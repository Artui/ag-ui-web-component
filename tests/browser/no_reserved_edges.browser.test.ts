import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, LAUNCHER_EDGE_MARGIN } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * What a host that reserves nothing gets.
 *
 * Every restriction this release added is expressed against the box the host
 * left free, and that box defaults to the whole screen: the four
 * `--ag-ui-viewport-inset-*` tokens are `0px` unless someone sets them. So the
 * limits below are "stay on the screen", which is what they were before any of
 * this, and the reserved-edge behaviour is what a host opts into rather than
 * what everyone gets.
 *
 * Worth its own file because the rest of the drag and resize tests state an
 * inset in order to exercise it, and a suite that only ever tests the
 * configured case cannot tell a general rule from a special one.
 */

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

/** Deliberately no viewport-inset tokens: this is the unconfigured widget. */
function mount(collapsed: boolean): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  document.body.appendChild(el);
  if (collapsed) {
    el.setCollapsed(true);
  }
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector}`);
  }
  return found;
}

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    composed: true,
    pointerId: 1,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    isPrimary: true,
  });
}

function dragBy(handle: HTMLElement, dx: number, dy: number): void {
  const box = handle.getBoundingClientRect();
  const from = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  handle.dispatchEvent(pointer("pointerdown", from.x, from.y));
  for (let i = 1; i <= 20; i += 1) {
    window.dispatchEvent(pointer("pointermove", from.x + (dx / 20) * i, from.y + (dy / 20) * i));
  }
  window.dispatchEvent(pointer("pointerup", from.x + dx, from.y + dy));
}

describe("a host that reserves nothing (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lets the panel reach the top-left of the screen itself", async () => {
    const el = mount(false);
    await settle();

    dragBy(part(el, ".header"), -3000, -3000);
    await settle();

    // Zero, not a gutter and not somebody's header bar: with nothing reserved
    // the limit is the screen.
    const box = el.getBoundingClientRect();
    expect(box.left).toBeCloseTo(0, 0);
    expect(box.top).toBeCloseTo(0, 0);
  });

  it("lets the panel reach the bottom-right of the screen itself", async () => {
    const el = mount(false);
    await settle();

    dragBy(part(el, ".header"), 3000, 3000);
    await settle();

    const box = el.getBoundingClientRect();
    expect(box.right).toBeCloseTo(window.innerWidth, 0);
    expect(box.bottom).toBeCloseTo(window.innerHeight, 0);
  });

  it("lets the launcher reach the screen's own corner", async () => {
    const el = mount(true);
    const launcher = part(el, ".launcher");
    // The collapse is a transition, and the launcher is scaled through it --
    // a rect read mid-animation is inset by half the difference, which reads
    // as a clamp that stopped short. Wait for it, then measure from the
    // centre, which a centred scale is the one point that cannot move.
    await Promise.all(launcher.getAnimations().map((animation) => animation.finished));

    dragBy(launcher, -3000, -3000);
    await settle();

    // A small margin, not flush: a circle with a drop shadow touching the
    // boundary reads as clipped even where no pixel is missing. Still the
    // screen's own corner rather than the panel's 24px gutter, which would
    // refuse the corners people drag it to.
    const box = launcher.getBoundingClientRect();
    expect(box.left).toBeCloseTo(LAUNCHER_EDGE_MARGIN, 0);
    expect(box.top).toBeCloseTo(LAUNCHER_EDGE_MARGIN, 0);
  });

  it("stops a resize at the screen, not before it", async () => {
    const el = mount(false);
    await settle();
    const before = el.getBoundingClientRect();

    dragBy(part(el, ".resize-handle--bottom"), 0, 3000);
    await settle();

    const box = el.getBoundingClientRect();
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
    expect(box.bottom).toBeCloseTo(window.innerHeight, 0);
    // ...and the anchored edge did not travel.
    expect(Math.abs(box.top - before.top)).toBeLessThanOrEqual(1);
  });

  it("reports the whole screen as usable when nothing is reserved", async () => {
    const el = mount(false);
    await settle();

    // The same box every restriction is expressed against, read through the
    // public surface rather than inferred from where things stopped.
    const surface = el.describeSurface();
    expect(surface.viewport.width).toBe(window.innerWidth);
    expect(surface.viewport.height).toBe(window.innerHeight);
  });
});
