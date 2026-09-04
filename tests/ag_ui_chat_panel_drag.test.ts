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
  for (const [key, value] of Object.entries({ "data-start-open": "", ...attrs })) {
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
  // Resting on the host box's bottom-right corner, (920, 720) to (976, 776),
  // reported through the scale(0.4) it sits at behind an open panel -- which is
  // the state every header drag happens in, and the one the element divides
  // back out by reading the rect's centre.
  launcher.getBoundingClientRect = (() => ({
    left: 936.8,
    top: 736.8,
    width: 22.4,
    height: 22.4,
    right: 959.2,
    bottom: 759.2,
  })) as never;

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

/**
 * Where the launcher actually is, in viewport coordinates, read back out of
 * the two insets the element writes. The launcher is positioned inside the
 * host box, so its position is only meaningful with the box's own.
 */
function launcherAt(el: AgUiChat): { left: number; top: number } {
  const sides = (value: string) => value.split(" ").map((side) => Number.parseFloat(side));
  const [hostTop, hostRight, hostBottom, hostLeft] = sides(
    el.style.getPropertyValue("--ag-ui-inset"),
  );
  const [lTop, lRight, lBottom, lLeft] = sides(
    el.style.getPropertyValue("--ag-ui-launcher-inset") || "auto 0px 0px auto",
  );
  const boxLeft = Number.isNaN(hostLeft)
    ? VIEWPORT.width - (hostRight as number) - PANEL.width
    : (hostLeft as number);
  const boxTop = Number.isNaN(hostTop)
    ? VIEWPORT.height - (hostBottom as number) - PANEL.height
    : (hostTop as number);
  return {
    left: Number.isNaN(lLeft)
      ? boxLeft + PANEL.width - (lRight as number) - 56
      : boxLeft + (lLeft as number),
    top: Number.isNaN(lTop)
      ? boxTop + PANEL.height - (lBottom as number) - 56
      : boxTop + (lTop as number),
  };
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

    // The box was at (596, 216), so it is at (196, 116) now: 1000 - 576 of
    // right inset and 800 - 676 of bottom.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("auto 424px 124px auto");
  });

  it("takes the launcher along, so collapsing lands where the panel was", () => {
    const { el, header } = mount({ id: "launcher" });

    drag(header, [700, 240], [300, 140]);

    // Zero on both pinned sides: the launcher travelled with the panel and is
    // still on the corner it was resting on, which is the one edge a later
    // resize cannot move.
    expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("auto 0px 0px auto");
  });

  it("puts a panel that stays on the far side exactly where it was dragged too", () => {
    const { el, header } = mount({ id: "near" });

    // A short move that leaves the panel pinned from its right edge. This is
    // the case a naive answer gets wrong: put the launcher on the panel's
    // top-left while the placement pins the right, and the panel jumps left by
    // its own width the moment the pointer is released.
    drag(header, [700, 240], [660, 230]);

    expect(el.getAttribute("data-expand-corner")).toBe("bottom-right");
    // (596, 216) less (40, 10) is (556, 206), so 1000 - 936 = 64 of right
    // inset and 800 - 766 = 34 of bottom.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("auto 64px 34px auto");
  });

  it("does not jump when the corner it opens from changes mid-drag", () => {
    const { el, header } = mount({ id: "flip" });

    // Right half to left half: the panel crosses the line where the placement
    // changes its mind about which edge to pin. Deriving the position from the
    // launcher would move the panel by its own width at that moment.
    drag(header, [700, 240], [420, 240]);

    // 596 - 280 = 316, so 1000 - 696 = 304 of right inset, and the vertical
    // edges are where they were.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("auto 304px 24px auto");
  });

  it("takes the launcher exactly as far as the panel went", () => {
    // The bubble a collapsed widget shrinks to is where the panel was, so a
    // panel dragged 40 left and 10 up has to leave it 40 left and 10 up. It
    // used to be glued to whichever corner the panel was pinned by, and a drag
    // re-picks that corner -- so the bubble jumped across the panel instead.
    const { el, header } = mount({ id: "carried" });
    // At rest the launcher sits on the host box's bottom-right corner.
    const before = { left: 976 - 56, top: 776 - 56 };

    drag(header, [700, 240], [660, 230]);

    expect(launcherAt(el)).toEqual({ left: before.left - 40, top: before.top - 10 });
  });

  it("keeps the panel inside the viewport's margin", () => {
    const { el, header } = mount({ id: "clamped" });

    drag(header, [700, 240], [0, 0]);

    // Held at (24, 24) whatever the pointer asked for, and expressed from the
    // corner the launcher has ended up nearest.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("auto auto 216px 24px");
  });

  it("remembers the position for the next mount, per tab", async () => {
    const first = mount({ id: "remembered" });
    drag(first.header, [700, 240], [300, 140]);
    document.body.innerHTML = "";

    const { el } = mount({ id: "remembered" });
    await frame();

    // The restore re-derives the panel from the stored launcher, so this is
    // the assertion that the two halves of the drag agree with each other.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("auto 424px 124px auto");
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

  it("ends the drag where the placement stops owning the position mid-gesture", () => {
    // A responsive host can swap placement while a drag is live, and a commit
    // that ran anyway would write an inset a docked panel then has to fight.
    const { el, header } = mount({ id: "swapped" });
    header.dispatchEvent(pointer("pointerdown", 700, 240));
    window.dispatchEvent(pointer("pointermove", 660, 230));
    el.setAttribute("placement", "sidebar");

    window.dispatchEvent(pointer("pointerup", 660, 230));

    expect(sessionStorage.getItem("ag-ui-chat:launcher:swapped")).toBeNull();
  });

  it("ignores a stored panel position where the placement owns the position", async () => {
    sessionStorage.setItem(
      "ag-ui-chat:launcher:docked",
      JSON.stringify({ left: 100, top: 100, panel: { left: 40, top: 40 } }),
    );

    const { el } = mount({ id: "docked", placement: "sidebar" });
    await frame();

    // The rail decides where it sits; a position stated for a floating panel
    // has nothing to say about it.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("ignores a stored panel position that is not a pair of numbers", async () => {
    // The launcher half of the same record still restores: a panel position
    // that cannot be read is a position nobody stated, which is exactly the
    // record a launcher drag writes.
    for (const [id, panel] of [
      ["corrupt-panel", { left: "40", top: 40 }],
      ["null-panel", null],
    ] as const) {
      sessionStorage.setItem(
        `ag-ui-chat:launcher:${id}`,
        JSON.stringify({ left: 200, top: 150, panel }),
      );
      const { el } = mount({ id });
      await frame();

      // Derived from the launcher at (200, 150), which opens down and right.
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("150px auto auto 200px");
      document.body.innerHTML = "";
    }
  });

  it("takes the stated position with it when a resize moves the panel", async () => {
    // The pinned corner has to be one a grip can actually move, so this starts
    // from a launcher dragged to the top-left -- the panel opens down and
    // right from there, and the top-left grip then drags the very corner the
    // layout is holding, which moves the panel as much as it sizes it.
    const { el, header } = mount({ id: "resized" });
    el.setCollapsed(true);
    const launcher = shadow(el).querySelector(".launcher") as HTMLElement;
    launcher.dispatchEvent(pointer("pointerdown", 948, 748));
    window.dispatchEvent(pointer("pointermove", 228, 178));
    window.dispatchEvent(pointer("pointerup", 228, 178));
    el.setCollapsed(false);
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");

    drag(header, [700, 240], [680, 230]);
    const handle = shadow(el).querySelector(".resize-handle--top-left") as HTMLElement;
    handle.dispatchEvent(pointer("pointerdown", 596, 216));
    window.dispatchEvent(pointer("pointermove", 500, 180));
    window.dispatchEvent(pointer("pointerup", 500, 180));

    // Without this the next mount would put the panel back where the header
    // drag left it, undoing the resize that moved the same corner.
    const stored = JSON.parse(sessionStorage.getItem("ag-ui-chat:launcher:resized") ?? "{}");
    expect(stored.panel).toEqual({ left: 500, top: 180 });
  });

  it("moves the resize grip to the corner the panel now opens from", () => {
    const { el, header } = mount({ id: "grip" });

    drag(header, [700, 240], [300, 140]);

    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-right");
  });
});
