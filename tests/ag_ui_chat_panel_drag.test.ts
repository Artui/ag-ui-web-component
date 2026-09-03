/**
 * Dragging the panel by its header, and what the launcher does about it.
 *
 * The gesture is panel_drag.test.ts's and the geometry is
 * launcher_for_panel.test.ts's. What is left here is the property that makes
 * the two one feature: the panel arrives exactly where it was dragged, and the
 * launcher is somewhere that puts it back there next time -- because the
 * position this element persists and re-derives its whole layout from is the
 * launcher's, not the panel's.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

const VIEWPORT = { width: 1000, height: 800 };
/** The panel's resting size, which the host box keeps while collapsed. */
const PANEL = { width: 380, height: 560 };

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

/** Mount a widget with the geometry happy-dom does not compute. */
function mount(attrs: Record<string, string> = {}): { el: AgUiChat; header: HTMLElement } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);

  // Resting bottom-right: 24px margins on a 1000x800 viewport.
  el.getBoundingClientRect = (() => ({
    left: 596,
    top: 216,
    width: PANEL.width,
    height: PANEL.height,
    right: 976,
    bottom: 776,
  })) as never;

  const launcher = shadow(el).querySelector(".launcher") as HTMLElement;
  Object.defineProperty(launcher, "offsetWidth", { value: 56, configurable: true });
  Object.defineProperty(launcher, "offsetHeight", { value: 56, configurable: true });

  return { el, header: shadow(el).querySelector(".header") as HTMLElement };
}

/** The frame the element defers its restore to, so the host's CSS has applied. */
function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.assign(event, { clientX: x, clientY: y, button: 0 });
  return event;
}

function drag(header: HTMLElement, from: [number, number], to: [number, number]): void {
  header.dispatchEvent(pointer("pointerdown", from[0], from[1]));
  window.dispatchEvent(pointer("pointermove", to[0], to[1]));
  window.dispatchEvent(pointer("pointerup", to[0], to[1]));
}

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: VIEWPORT.width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: VIEWPORT.height, configurable: true });
  sessionStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("dragging the panel by its header", () => {
  it("puts the panel exactly where it was dragged", () => {
    const { el, header } = mount({ id: "moved" });

    // 400 left and 100 up, from a press in the middle of the header.
    drag(header, [700, 240], [300, 140]);

    // The box was at (596, 216), so it is at (196, 116) now -- and it is
    // pinned from the corner that has the room to open, not the one it had.
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("116px auto auto 196px");
  });

  it("takes the launcher along, so collapsing lands where the panel was", () => {
    const { el, header } = mount({ id: "launcher" });

    drag(header, [700, 240], [300, 140]);

    // Zero on both pinned sides: the launcher is on the panel's own corner,
    // which is the one edge a later resize cannot move.
    expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("0px auto auto 0px");
  });

  it("puts a panel that stays on the far side exactly where it was dragged too", () => {
    const { el, header } = mount({ id: "near" });

    // A short move that leaves the panel pinned from its right edge. This is
    // the case a naive answer gets wrong: put the launcher on the panel's
    // top-left while the placement pins the right, and the panel jumps left by
    // its own width the moment the pointer is released.
    drag(header, [700, 240], [660, 230]);

    expect(el.getAttribute("data-expand-corner")).toBe("top-right");
    // (596, 216) less (40, 10) is (556, 206), so 1000 - 556 - 380 = 64 of
    // right inset.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("206px 64px auto auto");
  });

  it("does not jump when the corner it opens from changes mid-drag", () => {
    const { el, header } = mount({ id: "flip" });

    // Right half to left half: the panel crosses the line where the placement
    // changes its mind about which edge to pin. Deriving the position from the
    // launcher would move the panel by its own width at that moment.
    drag(header, [700, 240], [420, 240]);

    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
    // 596 - 280 = 316, and the top is unchanged.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("216px auto auto 316px");
  });

  it("keeps the panel inside the viewport's margin", () => {
    const { el, header } = mount({ id: "clamped" });

    drag(header, [700, 240], [0, 0]);

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("24px auto auto 24px");
  });

  it("remembers the position for the next mount, per tab", async () => {
    const first = mount({ id: "remembered" });
    drag(first.header, [700, 240], [300, 140]);
    document.body.innerHTML = "";

    const { el } = mount({ id: "remembered" });
    await frame();

    // The restore re-derives the panel from the stored launcher, so this is
    // the assertion that the two halves of the drag agree with each other.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("116px auto auto 196px");
  });

  it("leaves the header alone while the widget is collapsed", () => {
    const { el, header } = mount({ id: "collapsed" });
    el.setCollapsed(true);

    drag(header, [700, 240], [300, 140]);

    // Nothing is on screen to drag, and the launcher is the handle then.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("leaves the header alone where the placement owns the position", () => {
    const { el, header } = mount({ id: "docked", placement: "sidebar" });

    drag(header, [700, 240], [300, 140]);

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("respects a host that turned dragging off", () => {
    const { el, header } = mount({ id: "opted-out", "data-launcher-drag": "false" });

    drag(header, [700, 240], [300, 140]);

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("moves the resize grip to the corner the panel now opens from", () => {
    const { el, header } = mount({ id: "grip" });

    drag(header, [700, 240], [300, 140]);

    expect(el.getAttribute("data-resize-anchor")).toBe("top-left");
  });
});
