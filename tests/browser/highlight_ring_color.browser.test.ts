import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { flash, pressThenClick, toggleControl } from "../../src/dom/animations.js";
import { showHighlightOverlay } from "../../src/dom/highlight_overlay.js";

/**
 * Which colour a highlight ring is drawn in when the caller passes none.
 *
 * The ring is drawn in the host's page, outside every chat, so a token on the
 * chat never reaches it through the cascade: the driver reads the chat
 * directly. Since the default theme's accent stopped being the package indigo,
 * an unthemed page drew indigo rings beside a near-black widget; these pin the
 * ring to the widget instead, per theme, and the precedence around it.
 *
 * Colours are compared as sRGB bytes read back from a canvas, because Chromium
 * serialises a resolved light-dark() or color-mix() in its own space.
 */

type Rgba = readonly [number, number, number, number];

const INDIGO: Rgba = [79, 70, 229, 1];
const QUIET_LIGHT_ACCENT: Rgba = [35, 35, 38, 1];

function rgba(color: string): Rgba {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("expected a 2d context");
  }
  context.fillStyle = "rgba(0, 0, 0, 0)";
  context.fillStyle = color;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b, Math.round((a / 255) * 100) / 100];
}

/** The halo a press or toggle ring draws: `color` at 40%. */
function halo(color: Rgba): Rgba {
  return rgba(`color-mix(in srgb, rgb(${color[0]} ${color[1]} ${color[2]}) 40%, transparent)`);
}

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

/** A plain element on the page, optionally under a scope carrying `styles`. */
function makeTarget(styles = ""): HTMLElement {
  const scope = document.createElement("div");
  scope.style.cssText = styles;
  const el = document.createElement("button");
  el.textContent = "target";
  scope.appendChild(el);
  document.body.appendChild(scope);
  return el;
}

/** The outline colour a flat `flash()` draws, read while it is on screen. */
async function flashColor(target: HTMLElement, options: Parameters<typeof flash>[1] = {}) {
  const done = flash(target, { flashMs: 30, ...options });
  const color = rgba(getComputedStyle(target).outlineColor);
  await done;
  return color;
}

/** The ring colour the overlay draws with no `color` option. */
function overlayColor(
  target: HTMLElement,
  options: Parameters<typeof showHighlightOverlay>[1] = {},
) {
  const dismiss = showHighlightOverlay(target, options);
  const ring = document.querySelector("[data-ag-ui-highlight]")?.lastElementChild;
  if (!(ring instanceof HTMLElement)) {
    throw new Error("no overlay ring");
  }
  const color = rgba(getComputedStyle(ring).borderTopColor);
  dismiss();
  return color;
}

/** The halo colour a press ring draws, read while it is on screen. */
async function pressHalo(target: HTMLElement) {
  const done = pressThenClick(target, { pressMs: 30 });
  const shadow = getComputedStyle(target).boxShadow.replace(/ 0px 0px 0px 3px$/, "");
  await done;
  return rgba(shadow);
}

describe("highlight ring colour (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("draws an unthemed page's ring in a default-theme chat's accent, not the package indigo", async () => {
    mount();
    const target = makeTarget();

    expect(await flashColor(target)).toEqual(QUIET_LIGHT_ACCENT);
    expect(overlayColor(target)).toEqual(QUIET_LIGHT_ACCENT);
    expect(await pressHalo(target)).toEqual(halo(QUIET_LIGHT_ACCENT));
  });

  it.each([
    ["quiet light", "", [35, 35, 38, 1]],
    ["quiet dark", "dark", [240, 240, 242, 1]],
    ["soft light", "soft", [106, 79, 216, 1]],
    ["soft dark", "soft dark", [165, 147, 255, 1]],
    ["ledger light", "ledger", [184, 65, 14, 1]],
    ["ledger dark", "ledger dark", [240, 138, 75, 1]],
    ["code", "code", [63, 185, 80, 1]],
  ] as const)(
    "follows the %s chat's resolved accent, ring and halo",
    async (_name, theme, accent) => {
      // The page stays light throughout, so a dark chat's ring is only right if
      // its light-dark() pair was resolved by the chat's scheme, not the page's.
      mount(theme === "" ? {} : { theme });
      const target = makeTarget();

      expect(await flashColor(target)).toEqual(accent);
      expect(overlayColor(target)).toEqual(accent);
      expect(await pressHalo(target)).toEqual(halo(accent));
    },
  );

  it("takes the ring token set on the chat, over a target's --ag-ui-accent", async () => {
    const chat = mount();
    chat.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 128, 0)");
    const target = makeTarget("--ag-ui-accent: rgb(200, 0, 0)");

    expect(await flashColor(target)).toEqual([0, 128, 0, 1]);
    expect(overlayColor(target)).toEqual([0, 128, 0, 1]);
  });

  it("takes the ring token on a wrapper above the chat, as the cascade gives it", async () => {
    const wrapper = document.createElement("div");
    wrapper.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 0, 160)");
    document.body.appendChild(wrapper);
    const chat = document.createElement(ELEMENT_TAG);
    chat.setAttribute("endpoint", "/agent/");
    chat.setAttribute("placement", "embedded");
    wrapper.appendChild(chat);

    expect(await flashColor(makeTarget())).toEqual([0, 0, 160, 1]);
  });

  it("takes the ring token on the target's own cascade over the chat's", async () => {
    const chat = mount();
    chat.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 128, 0)");
    const target = makeTarget("--ag-ui-highlight-ring-color: rgb(0, 0, 160)");

    expect(await flashColor(target)).toEqual([0, 0, 160, 1]);
    expect(overlayColor(target)).toEqual([0, 0, 160, 1]);
  });

  it("still lets a target's --ag-ui-accent win over the chat's own accent", async () => {
    mount({ theme: "soft" });
    const target = makeTarget("--ag-ui-accent: rgb(200, 0, 0)");

    expect(await flashColor(target)).toEqual([200, 0, 0, 1]);
    expect(overlayColor(target)).toEqual([200, 0, 0, 1]);
  });

  it("lets the caller's colour win over every token", async () => {
    const chat = mount();
    chat.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 128, 0)");
    const target = makeTarget("--ag-ui-highlight-ring-color: rgb(0, 0, 160)");

    expect(await flashColor(target, { color: "rgb(255, 0, 255)" })).toEqual([255, 0, 255, 1]);
    expect(overlayColor(target, { color: "rgb(255, 0, 255)" })).toEqual([255, 0, 255, 1]);
  });

  it("draws in the package indigo when no chat is connected and nothing is themed", async () => {
    expect(await flashColor(makeTarget())).toEqual(INDIGO);
  });

  it("follows the most recently connected chat, and the previous one once it leaves", async () => {
    const first = mount();
    first.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 128, 0)");
    const second = mount();
    second.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 0, 160)");
    const target = makeTarget();

    expect(await flashColor(target)).toEqual([0, 0, 160, 1]);

    // A move is a reconnect, and makes the moved chat the latest.
    document.body.appendChild(first);
    expect(await flashColor(target)).toEqual([0, 128, 0, 1]);

    first.remove();
    expect(await flashColor(target)).toEqual([0, 0, 160, 1]);

    second.remove();
    expect(await flashColor(target)).toEqual(INDIGO);
  });

  it("draws in the chat a caller names, on a page with two", async () => {
    const first = mount();
    first.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 128, 0)");
    const second = mount();
    second.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 0, 160)");
    const target = makeTarget();

    expect(await flashColor(target, { chat: first })).toEqual([0, 128, 0, 1]);
    expect(overlayColor(target, { chat: first })).toEqual([0, 128, 0, 1]);

    // A scrim takes the overlay path, which has to carry the chat along.
    const done = flash(target, { flashMs: 30, scrim: true, chat: first });
    const ring = document.querySelector("[data-ag-ui-highlight]")?.lastElementChild as HTMLElement;
    expect(rgba(getComputedStyle(ring).borderTopColor)).toEqual([0, 128, 0, 1]);
    await done;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.appendChild(checkbox);
    const toggled = toggleControl(checkbox, true, { flashMs: 30, chat: first });
    const shadow = getComputedStyle(checkbox).boxShadow.replace(/ 0px 0px 0px 3px$/, "");
    expect(rgba(shadow)).toEqual(halo([0, 128, 0, 1]));
    await toggled;
  });

  it("reads a named element with no shadow root as it is", async () => {
    const plain = document.createElement("div");
    plain.style.setProperty("--ag-ui-highlight-ring-color", "rgb(0, 128, 0)");
    document.body.appendChild(plain);
    const target = makeTarget();

    expect(await flashColor(target, { chat: plain })).toEqual([0, 128, 0, 1]);

    plain.style.removeProperty("--ag-ui-highlight-ring-color");
    expect(await flashColor(target, { chat: plain })).toEqual(INDIGO);
  });

  it("skips a ring token on the chat that is not a colour", async () => {
    const chat = mount();
    chat.style.setProperty("--ag-ui-highlight-ring-color", "not-a-colour");

    expect(await flashColor(makeTarget())).toEqual(QUIET_LIGHT_ACCENT);
  });
});
