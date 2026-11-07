import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { flash } from "../../src/dom/animations.js";
import { showHighlightOverlay } from "../../src/dom/highlight_overlay.js";

/**
 * The highlight ring the agent draws around a page field holds 3:1 against
 * the page it is drawn on (WCAG 2.4.13 and 1.4.11).
 *
 * The ring falls back to the chat's resolved accent, which follows the
 * widget's scheme rather than the page's: a dark Quiet widget on a light
 * page drew #f0f0f2 on white, about 1.1:1. The ring is drawn outside the
 * target's border box (the flash outline is offset, the overlay leaves a gap),
 * so the surface it is measured against is the one behind the target: the
 * first background up from its parent, over the page canvas. Each case names
 * that surface itself rather than asking the code under test for it.
 */

type Rgba = readonly [number, number, number, number];

const WHITE: Rgba = [255, 255, 255, 1];
const DARK_PAGE: Rgba = [18, 18, 18, 1];

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

function luminance([r, g, b]: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
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

/** A transparent field on the page, optionally inside a scope with `styles`. */
function makeTarget(styles = "", tag = "div"): HTMLElement {
  const scope = document.createElement("div");
  scope.style.cssText = styles;
  const el = document.createElement(tag);
  el.textContent = "target";
  scope.appendChild(el);
  document.body.appendChild(scope);
  return el;
}

async function flashColor(target: HTMLElement): Promise<Rgba> {
  const done = flash(target, { flashMs: 30 });
  const color = rgba(getComputedStyle(target).outlineColor);
  await done;
  return color;
}

function overlayColor(target: HTMLElement): Rgba {
  const dismiss = showHighlightOverlay(target);
  const ring = document.querySelector("[data-ag-ui-highlight]")?.lastElementChild;
  if (!(ring instanceof HTMLElement)) {
    throw new Error("no overlay ring");
  }
  const color = rgba(getComputedStyle(ring).borderTopColor);
  dismiss();
  return color;
}

async function expectBothRings(target: HTMLElement, surface: Rgba): Promise<void> {
  expect(contrast(await flashColor(target), surface)).toBeGreaterThanOrEqual(3);
  expect(contrast(overlayColor(target), surface)).toBeGreaterThanOrEqual(3);
}

function darkPage(): void {
  document.documentElement.style.background = "rgb(18, 18, 18)";
  document.body.style.background = "rgb(18, 18, 18)";
}

describe("highlight ring contrast against the page (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  it("holds 3:1 for a dark Quiet widget on a light page", async () => {
    mount({ theme: "dark" });
    document.body.style.background = "rgb(255, 255, 255)";

    await expectBothRings(makeTarget(), WHITE);
  });

  it("holds 3:1 for a light widget on a dark page", async () => {
    mount();
    darkPage();

    await expectBothRings(makeTarget(), DARK_PAGE);
  });

  it("holds 3:1 for a light widget on a dark page with no background of its own", async () => {
    // Nothing on the page paints, so the surface is the canvas, which the
    // root's colour scheme darkens.
    mount();
    document.documentElement.style.colorScheme = "dark";
    const canvas = rgba(getComputedStyle(document.documentElement).backgroundColor);
    expect(canvas[3]).toBe(0);

    const probe = document.createElement("div");
    probe.style.color = "Canvas";
    document.body.appendChild(probe);
    const surface = rgba(getComputedStyle(probe).color);
    probe.remove();
    expect(luminance(surface)).toBeLessThan(0.1);

    await expectBothRings(makeTarget(), surface);
  });

  it("measures a white field on a dark page against the page, not the field", async () => {
    // The ring sits outside the field's box, on the page behind it.
    mount();
    darkPage();

    await expectBothRings(makeTarget("", "input"), DARK_PAGE);
    const field = document.querySelector("input");
    expect(field && rgba(getComputedStyle(field).backgroundColor)).toEqual(WHITE);
  });

  it("measures a translucent wash as it looks over the page beneath it", async () => {
    // A 4% black wash on white is still a light surface; read alone, its
    // colour is black.
    mount({ theme: "dark" });
    document.body.style.background = "rgb(255, 255, 255)";

    await expectBothRings(makeTarget("background: rgb(0 0 0 / 0.04)"), [245, 245, 245, 1]);
  });

  it("steps an accent with no other half until it holds", async () => {
    // A host's plain accent on the chat is not a light-dark pair, so the
    // other scheme gives the same colour back.
    const chat = mount();
    chat.style.setProperty("--ag-ui-accent", "#e8e8ea");
    document.body.style.background = "rgb(255, 255, 255)";

    await expectBothRings(makeTarget(), WHITE);
  });

  it("steps a dark accent with no other half toward white on a dark page", async () => {
    const chat = mount();
    chat.style.setProperty("--ag-ui-accent", "#202022");
    darkPage();

    await expectBothRings(makeTarget(), DARK_PAGE);
  });

  it("measures a field inside a shadow root against its host's surface", async () => {
    // The walk up from the field leaves the shadow root through its host, so
    // the dark card the host paints is the surface, not the light page.
    mount();
    document.body.style.background = "rgb(255, 255, 255)";
    const card = document.createElement("div");
    card.style.background = "rgb(18, 18, 18)";
    document.body.appendChild(card);
    const target = document.createElement("div");
    target.textContent = "target";
    card.attachShadow({ mode: "open" }).appendChild(target);

    await expectBothRings(target, DARK_PAGE);
  });

  it("leaves a ring token the host chose as it is, contrast or not", async () => {
    const chat = mount();
    chat.style.setProperty("--ag-ui-highlight-ring-color", "rgb(250, 250, 250)");
    document.body.style.background = "rgb(255, 255, 255)";

    expect(await flashColor(makeTarget())).toEqual([250, 250, 250, 1]);
  });

  it("leaves a target's own accent as it is, contrast or not", async () => {
    mount({ theme: "dark" });
    document.body.style.background = "rgb(255, 255, 255)";

    expect(await flashColor(makeTarget("--ag-ui-accent: rgb(250, 250, 250)"))).toEqual([
      250, 250, 250, 1,
    ]);
  });
});
