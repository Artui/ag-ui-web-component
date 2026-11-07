import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * The documented recipe for keeping a brand accent under the default theme:
 * the header and launcher take the accent, the text on them takes the colour
 * that reads on it, and the tool names take the accent too.
 *
 * Two parts of it reached nothing. Quiet drew its header buttons in its own
 * third ink, so on an accent header they read about 1.2:1, and its hover
 * square was the panel's near-white or near-black, so a glyph recoloured to
 * the header's text vanished under the pointer. And the grouped tool display,
 * the default since the step group shipped, drew every call name in the
 * second ink whatever the tool token said.
 *
 * Chromium, because each assertion is on a painted colour: an opacity, a
 * color-mix() and a chained var() fallback, none of which happy-dom resolves.
 * Colours are read back as sRGB bytes from a canvas, because Chromium
 * serialises a color-mix() result in its mixing space.
 */

type Rgba = readonly [number, number, number, number];

/** The accent the gallery measured on, with white on it. */
const INDIGO = { bg: "#3d5afe", fg: "#ffffff" } as const;
/** A light accent, so the text on it is dark and the hover square is mixed from a dark ink. */
const AMBER = { bg: "#ffd60a", fg: "#1b1b1d" } as const;

/** Every header button the header can carry, by modifier. */
const BUTTONS = ["history", "new", "theme", "collapse"] as const;

/**
 * Every theme attribute the default theme's structure reaches: Quiet itself,
 * in each scheme word, and a word the library does not know, which is how a
 * host's own named theme starts from Quiet.
 */
const QUIET_REACH = ["", "light", "dark", "auto", "acme", "acme dark"] as const;

function rgba(color: string): Rgba {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("expected a 2d context");
  }
  context.fillStyle = color;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b, Math.round((a / 255) * 100) / 100];
}

/** `top` composited over the opaque `under`, with an extra opacity on top. */
function over(top: Rgba, under: Rgba, opacity = 1): Rgba {
  const alpha = top[3] * opacity;
  const mix = (index: 0 | 1 | 2): number => top[index] * alpha + under[index] * (1 - alpha);
  return [mix(0), mix(1), mix(2), 1];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = shadow(el).querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector} in the shadow root`);
  }
  return found;
}

/** The colour the element resolves for an expression, read from a probe in its shadow root. */
function resolved(el: AgUiChat, expression: string): Rgba {
  const probe = document.createElement("span");
  probe.style.color = expression;
  shadow(el).appendChild(probe);
  const colour = rgba(getComputedStyle(probe).color);
  probe.remove();
  return colour;
}

function addPageRule(css: string): void {
  const style = document.createElement("style");
  style.dataset["testPageRule"] = "";
  style.textContent = css;
  document.head.appendChild(style);
}

/** The recipe as a host writes it: one page rule aimed at the element. */
function followRecipe(accent: { readonly bg: string; readonly fg: string }): void {
  addPageRule(`${ELEMENT_TAG} {
    --ag-ui-header-bg: ${accent.bg};
    --ag-ui-header-fg: ${accent.fg};
    --ag-ui-launcher-bg: ${accent.bg};
    --ag-ui-launcher-fg: ${accent.fg};
    --ag-ui-tool-fg: ${accent.bg};
  }`);
}

/** An open floating panel carrying every header button. */
function mountPanel(theme: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-theme-toggle", "");
  if (theme !== "") {
    el.setAttribute("theme", theme);
  }
  document.body.appendChild(el);
  return el;
}

function headerButtons(el: AgUiChat): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const name of BUTTONS) {
    const button = part(el, `.header-btn--${name}`);
    // Laid out, so a button the header hides is not measured as if it showed.
    expect(button.getBoundingClientRect().width, name).toBeGreaterThan(0);
    found.set(name, button);
  }
  return found;
}

/** What the button paints: its glyph over its square over the header. */
function painted(el: AgUiChat, button: HTMLElement): { glyph: Rgba; ground: Rgba; ink: Rgba } {
  const header = rgba(getComputedStyle(part(el, ".header")).backgroundColor);
  const style = getComputedStyle(button);
  const opacity = Number(style.opacity);
  // The square and the glyph are both under the button's opacity.
  const ground = over(rgba(style.backgroundColor), header, opacity);
  const ink = rgba(style.color);
  return { glyph: over(ink, ground, opacity), ground, ink };
}

async function hover(button: HTMLElement): Promise<void> {
  await userEvent.hover(button);
  expect(button.matches(":hover")).toBe(true);
}

async function unhover(): Promise<void> {
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } });
}

async function emulateDark(): Promise<void> {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(async () => {
  await unhover();
  document.body.replaceChildren();
  for (const style of document.head.querySelectorAll("style[data-test-page-rule]")) {
    style.remove();
  }
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

describe("the accent recipe's header buttons (real browser)", () => {
  for (const accent of [INDIGO, AMBER]) {
    it.each(QUIET_REACH)(
      `read 4.5:1 on a ${accent.bg} header, at rest and hovered, under theme "%s"`,
      async (theme) => {
        if (theme === "auto") {
          await emulateDark();
        }
        followRecipe(accent);
        const el = mountPanel(theme);
        const headerFg = rgba(accent.fg);

        for (const [name, button] of headerButtons(el)) {
          const rest = painted(el, button);
          expect(rest.ink, `${name} at rest`).toEqual(headerFg);
          expect(contrast(rest.glyph, rest.ground), `${name} at rest`).toBeGreaterThanOrEqual(4.5);

          await hover(button);
          const hovered = painted(el, button);
          expect(hovered.ink, `${name} hovered`).toEqual(headerFg);
          // The square shows: it differs from the header it sits on.
          expect(hovered.ground, `${name} hovered`).not.toEqual(rest.ground);
          expect(contrast(hovered.glyph, hovered.ground), `${name} hovered`).toBeGreaterThanOrEqual(
            4.5,
          );
          await unhover();
        }
      },
    );
  }

  it.each([
    [INDIGO, "#000000"],
    [AMBER, "#e4e4e2"],
  ])(
    "mixes the hover square from the opposite of the header text, about a fifth of it",
    async (accent, opposite) => {
      followRecipe(accent);
      const el = mountPanel("");
      const button = part(el, ".header-btn--history");
      await hover(button);
      expect(rgba(getComputedStyle(button).backgroundColor)).toEqual(
        resolved(el, `color-mix(in srgb, ${opposite} 18%, transparent)`),
      );
    },
  );

  // Mid-tone accents whose white text sits a little over 4.5:1, which a
  // square mixed from the text itself took under it.
  it.each([
    { bg: "#dc2626", fg: "#ffffff" },
    { bg: "#7c3aed", fg: "#ffffff" },
  ])(
    "never draws the hovered glyph below what the host's own pair reads, on $bg",
    async (accent) => {
      followRecipe(accent);
      const el = mountPanel("");
      const pair = contrast(rgba(accent.fg), rgba(accent.bg));
      const button = part(el, ".header-btn--new");
      await hover(button);
      const hovered = painted(el, button);
      expect(contrast(hovered.glyph, hovered.ground)).toBeGreaterThanOrEqual(pair);
      expect(contrast(hovered.glyph, hovered.ground)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // A pair per scheme, as a page that follows its own dark mode writes it:
  // the light-dark() halves resolve against the element's scheme, and the
  // hover square is mixed from whichever half is in force.
  it.each([
    ["", "#3d5afe", "#ffffff"],
    ["dark", "#8a9dff", "#14161b"],
    ["auto", "#8a9dff", "#14161b"],
  ])('reads 4.5:1 with a light-dark() pair under theme "%s"', async (theme, bg, fg) => {
    if (theme === "auto") {
      await emulateDark();
    }
    followRecipe({ bg: "light-dark(#3d5afe, #8a9dff)", fg: "light-dark(#ffffff, #14161b)" });
    const el = mountPanel(theme);
    expect(rgba(getComputedStyle(part(el, ".header")).backgroundColor)).toEqual(rgba(bg));
    const button = part(el, ".header-btn--history");
    const rest = painted(el, button);
    expect(rest.ink).toEqual(rgba(fg));
    expect(contrast(rest.glyph, rest.ground)).toBeGreaterThanOrEqual(4.5);
    await hover(button);
    const hovered = painted(el, button);
    expect(hovered.ink).toEqual(rgba(fg));
    expect(rgba(getComputedStyle(button).backgroundColor)).not.toEqual(
      resolved(el, "var(--_hover)"),
    );
    expect(hovered.ground).not.toEqual(rest.ground);
    expect(contrast(hovered.glyph, hovered.ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("reaches the header buttons from a token set on an ancestor", async () => {
    addPageRule(`.brand { --ag-ui-header-bg: ${INDIGO.bg}; --ag-ui-header-fg: ${INDIGO.fg}; }`);
    const wrapper = document.createElement("div");
    wrapper.className = "brand";
    document.body.appendChild(wrapper);
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("placement", "floating");
    el.setAttribute("data-start-open", "");
    wrapper.appendChild(el);
    const rest = painted(el, part(el, ".header-btn--history"));
    expect(rest.ink).toEqual(rgba(INDIGO.fg));
    expect(contrast(rest.glyph, rest.ground)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Quiet's header buttons with no header text set (real browser)", () => {
  it.each(QUIET_REACH)(
    'keep the third ink, the 0.85 rest and the panel hover under theme "%s"',
    async (theme) => {
      if (theme === "auto") {
        await emulateDark();
      }
      const el = mountPanel(theme);
      const button = part(el, ".header-btn--history");
      const rest = getComputedStyle(button);
      expect(rgba(rest.color)).toEqual(resolved(el, "var(--_ink-3)"));
      expect(rest.opacity).toBe("0.85");
      expect(rgba(rest.backgroundColor)).toEqual([0, 0, 0, 0]);

      await hover(button);
      const hovered = getComputedStyle(button);
      expect(rgba(hovered.color)).toEqual(resolved(el, "var(--_fg)"));
      expect(hovered.opacity).toBe("1");
      expect(rgba(hovered.backgroundColor)).toEqual(resolved(el, "var(--_hover)"));
    },
  );
});

/** Two calls in one run, which the default display folds into one group. */
function twoCalls(emit: Emit): void {
  emit.runStart();
  emit.toolCall("c1", "fill_field", { field: "title" });
  emit.toolCall("c2", "fill_field", { field: "slug" });
  emit.toolResult("c1", "ok");
  emit.toolResult("c2", "ok");
  emit.runEnd();
}

async function groupedRun(theme: string, before: () => void = () => {}): Promise<AgUiChat> {
  before();
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  if (theme !== "") {
    el.setAttribute("theme", theme);
  }
  el.style.height = "480px";
  el.agentFactory = () => makeFakeAgent({ script: twoCalls }).agent;
  document.body.appendChild(el);
  void el.sendMessage("go");
  await new Promise((resolve) => setTimeout(resolve, 30));
  return el;
}

function groupedNames(el: AgUiChat): HTMLElement[] {
  const names = [
    ...shadow(el).querySelectorAll<HTMLElement>(".tool-group .tool-call .tool-call-name"),
  ];
  expect(names.length).toBe(2);
  return names;
}

const EVERY_THEME = [
  "",
  "dark",
  "acme",
  "soft",
  "soft dark",
  "ledger",
  "ledger dark",
  "classic",
  "classic dark",
  "code",
];

describe("the tool token in a step group (real browser)", () => {
  it.each(EVERY_THEME)(
    'colours every grouped call name when set, under theme "%s"',
    async (theme) => {
      const el = await groupedRun(theme, () =>
        addPageRule(`${ELEMENT_TAG} { --ag-ui-tool-fg: ${INDIGO.bg}; }`),
      );
      for (const name of groupedNames(el)) {
        expect(rgba(getComputedStyle(name).color)).toEqual(rgba(INDIGO.bg));
      }
    },
  );

  it.each(EVERY_THEME)(
    'leaves grouped call names in the second ink when unset, under theme "%s"',
    async (theme) => {
      const el = await groupedRun(theme);
      for (const name of groupedNames(el)) {
        expect(rgba(getComputedStyle(name).color)).toEqual(resolved(el, "var(--_ink-2)"));
      }
    },
  );

  it("still colours a call outside a group from the card display's own token", async () => {
    addPageRule(`${ELEMENT_TAG} { --ag-ui-tool-fg: ${INDIGO.bg}; }`);
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "embedded");
    el.setAttribute("data-tool-display", "full");
    el.agentFactory = () => makeFakeAgent({ script: twoCalls }).agent;
    document.body.appendChild(el);
    void el.sendMessage("go");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const card = part(el, ".tool-call");
    expect(rgba(getComputedStyle(card).color)).toEqual(rgba(INDIGO.bg));
  });
});

describe("the header buttons' hover token (real browser)", () => {
  it.each(QUIET_REACH)(
    'draws a set square exactly as given, with the header text set, under theme "%s"',
    async (theme) => {
      if (theme === "auto") {
        await emulateDark();
      }
      followRecipe(INDIGO);
      // The lightening square a host may prefer, at the cost of contrast.
      const square = "color-mix(in srgb, #ffffff 18%, transparent)";
      addPageRule(`${ELEMENT_TAG} { --ag-ui-header-btn-hover: ${square}; }`);
      const el = mountPanel(theme);
      const button = part(el, ".header-btn--history");
      await hover(button);
      expect(rgba(getComputedStyle(button).backgroundColor)).toEqual(resolved(el, square));
    },
  );

  it("draws a set square exactly as given with no header text set", async () => {
    addPageRule(`${ELEMENT_TAG} { --ag-ui-header-btn-hover: #fde68a; }`);
    const el = mountPanel("");
    const button = part(el, ".header-btn--history");
    await hover(button);
    expect(rgba(getComputedStyle(button).backgroundColor)).toEqual(rgba("#fde68a"));
    // The glyph still follows the header text, which is unset, so the full ink.
    expect(rgba(getComputedStyle(button).color)).toEqual(resolved(el, "var(--_fg)"));
  });

  it("reaches the square from a token set on an ancestor", async () => {
    addPageRule(".brand { --ag-ui-header-btn-hover: #fde68a; }");
    const wrapper = document.createElement("div");
    wrapper.className = "brand";
    document.body.appendChild(wrapper);
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("placement", "floating");
    el.setAttribute("data-start-open", "");
    wrapper.appendChild(el);
    const button = part(el, ".header-btn--history");
    await hover(button);
    expect(rgba(getComputedStyle(button).backgroundColor)).toEqual(rgba("#fde68a"));
  });
});
