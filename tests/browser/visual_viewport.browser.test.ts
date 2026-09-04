import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Sizing a full-bleed panel to the part of the screen the user can see.
 *
 * The case is the on-screen keyboard, and it needs measuring because no CSS
 * length describes it. An on-screen keyboard has no effect on any
 * viewport-percentage unit -- `100vh`, `100dvh` and `100svh` are the same
 * number with it up as without -- so a panel sized from one of them puts its
 * own composer behind the keyboard being typed into. Only `visualViewport`
 * reports it.
 *
 * A real keyboard cannot be opened from a test, so these drive the same API the
 * browser drives: a stand-in `visualViewport` that is a real `EventTarget`, so
 * the element's own listeners are exercised rather than its handler being
 * called directly. That is the difference between testing the wiring and
 * testing the arithmetic.
 */

/** How much shorter the "keyboard" makes the visible area. */
const KEYBOARD_PX = 260;

class FakeVisualViewport extends EventTarget {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    super();
    this.width = width;
    this.height = height;
  }

  resizeTo(height: number): void {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }
}

let original: PropertyDescriptor | undefined;
let fake: FakeVisualViewport;

function installFakeViewport(): FakeVisualViewport {
  original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  fake = new FakeVisualViewport(window.innerWidth, window.innerHeight);
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
  return fake;
}

function mount(placement: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("placement", placement);
  document.body.appendChild(el);
  return el;
}

describe("visual viewport tracking (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    if (original !== undefined) {
      Object.defineProperty(window, "visualViewport", original);
    }
  });

  it("shrinks a full-bleed panel to the visible area when the keyboard opens", async () => {
    const viewport = installFakeViewport();
    const el = mount("page");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(el.getBoundingClientRect().height).toBeCloseTo(window.innerHeight, 0);

    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // The composer is the reason: at the layout height it sits behind the
    // keyboard, which is the one control the user is trying to reach.
    expect(el.getBoundingClientRect().height).toBeCloseTo(window.innerHeight - KEYBOARD_PX, 0);
  });

  it("writes no override while the two viewports agree", async () => {
    const viewport = installFakeViewport();
    const el = mount("page");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // Nothing inline on a desktop that never diverges, so the declared
    // fallback stays in charge rather than being frozen to a measurement.
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-height")).toBe("");

    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-height")).not.toBe("");

    // ...and it is given back, not left pinned at the keyboard's height.
    viewport.resizeTo(window.innerHeight);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-height")).toBe("");
  });

  it("lets a host's stated height outrank the measurement", async () => {
    const viewport = installFakeViewport();
    const el = mount("page");
    el.style.setProperty("--ag-ui-viewport-height", "400px");
    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // Both are inline, so this is decided by the token chain rather than by
    // the cascade: the host's value is read first and the measurement is only
    // its fallback.
    expect(el.getBoundingClientRect().height).toBeCloseTo(400, 0);
  });

  it("lifts a bottom-anchored panel clear of what is hiding it", async () => {
    // The half a shorter panel does not solve. A floating widget is positioned
    // against the layout viewport, so its bottom edge stays behind the
    // keyboard however tall it is; only the measured gap moves it.
    const viewport = installFakeViewport();
    const el = mount("floating");
    el.setAttribute("data-start-open", "");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(el.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight - KEYBOARD_PX);
  });

  it("takes the launcher up with it, since that corner is the panel's", async () => {
    const viewport = installFakeViewport();
    const el = mount("floating");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const launcher = el.shadowRoot?.querySelector(".launcher") as HTMLElement;
    const box = launcher.getBoundingClientRect();
    // Measured from the centre: the launcher is scaled in several states and a
    // rect edge is adrift in every one of them, while a centred scale leaves
    // the centre where it is.
    expect(box.top + box.height / 2).toBeLessThanOrEqual(window.innerHeight - KEYBOARD_PX);
  });
});
