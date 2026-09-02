/**
 * The resize grips.
 *
 * One rule decides every case: **the edge a grip does not drag is the one that
 * stays put.** Everything here is that rule seen from a different side, plus
 * the two places it is easy to get backwards -- clamping the held edge instead
 * of the dragged one, and letting a grip act on an axis its placement owns.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  createResizeHandle,
  gripName,
  type PanelRect,
  type ResizeAxis,
  type ResizeGrip,
} from "../src/ui/resize_handle.js";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A 400x500 panel sitting at (100, 100). */
const RECT: PanelRect = { left: 100, top: 100, right: 500, bottom: 600 };

function harness(grip: ResizeGrip, axis: ResizeAxis = "both", rect: PanelRect = RECT) {
  const applied: PanelRect[] = [];
  const committed: PanelRect[] = [];
  let currentAxis = axis;
  const handle = createResizeHandle(grip, {
    axis: () => currentAxis,
    rect: () => rect,
    apply: (box) => applied.push(box),
    commit: (box) => committed.push(box),
    label: "Resize",
  });
  document.body.appendChild(handle);
  return {
    handle,
    applied,
    committed,
    setAxis: (next: ResizeAxis) => {
      currentAxis = next;
    },
  };
}

function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y });
  return event;
}

function drag(handle: HTMLElement, to: { x: number; y: number }): void {
  handle.dispatchEvent(pointer("pointerdown", 0, 0));
  window.dispatchEvent(pointer("pointermove", to.x, to.y));
  window.dispatchEvent(pointer("pointerup", to.x, to.y));
}

function key(handle: HTMLElement, name: string, shift = false): void {
  handle.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, shiftKey: shift, cancelable: true }),
  );
  handle.dispatchEvent(new KeyboardEvent("keyup", { key: name }));
}

describe("gripName", () => {
  it("names an edge by its side and a corner by both, vertical first", () => {
    expect(gripName({ x: "left" })).toBe("left");
    expect(gripName({ y: "top" })).toBe("top");
    expect(gripName({ x: "right", y: "bottom" })).toBe("bottom-right");
  });
});

describe("what each grip moves", () => {
  it("moves the left edge and holds the right", () => {
    const h = harness({ x: "left" });

    // 150 leaves a 350px panel, comfortably above the 280px minimum.
    drag(h.handle, { x: 150, y: 400 });

    // The right edge is untouched, and so is the whole vertical axis.
    expect(h.committed).toEqual([{ left: 150, top: 100, right: 500, bottom: 600 }]);
  });

  it("moves the right edge and holds the left", () => {
    const h = harness({ x: "right" });

    drag(h.handle, { x: 900, y: 400 });

    expect(h.committed).toEqual([{ left: 100, top: 100, right: 900, bottom: 600 }]);
  });

  it("moves the top edge and holds the bottom", () => {
    const h = harness({ y: "top" });

    drag(h.handle, { x: 250, y: 200 });

    expect(h.committed).toEqual([{ left: 100, top: 200, right: 500, bottom: 600 }]);
  });

  it("moves the bottom edge and holds the top", () => {
    const h = harness({ y: "bottom" });

    drag(h.handle, { x: 250, y: 900 });

    expect(h.committed).toEqual([{ left: 100, top: 100, right: 500, bottom: 900 }]);
  });

  it("moves both edges from a corner", () => {
    const h = harness({ x: "right", y: "bottom" });

    drag(h.handle, { x: 900, y: 900 });

    expect(h.committed).toEqual([{ left: 100, top: 100, right: 900, bottom: 900 }]);
  });

  it("moves the two edges a mixed corner names", () => {
    const h = harness({ x: "left", y: "bottom" });

    drag(h.handle, { x: 200, y: 900 });

    expect(h.committed).toEqual([{ left: 200, top: 100, right: 500, bottom: 900 }]);
  });

  it("reports every move, not only the last", () => {
    const h = harness({ x: "right" });

    h.handle.dispatchEvent(pointer("pointerdown", 0, 0));
    window.dispatchEvent(pointer("pointermove", 700, 400));
    window.dispatchEvent(pointer("pointermove", 800, 400));
    window.dispatchEvent(pointer("pointerup", 800, 400));

    expect(h.applied.map((box) => box.right)).toEqual([700, 800]);
    // One commit for one gesture, whatever it passed through on the way.
    expect(h.committed).toHaveLength(1);
  });
});

describe("the minimum size", () => {
  it("pushes a dragged left edge back rather than moving the right one", () => {
    const h = harness({ x: "left" });

    // Dragged past the right edge entirely.
    drag(h.handle, { x: 900, y: 400 });

    // Clamping the held edge instead is how a panel dragged past its minimum
    // starts travelling across the screen.
    expect(h.committed).toEqual([{ left: 220, top: 100, right: 500, bottom: 600 }]);
  });

  it("pushes a dragged right edge back the same way", () => {
    const h = harness({ x: "right" });

    drag(h.handle, { x: 0, y: 400 });

    expect(h.committed[0]?.right).toBe(380);
    expect(h.committed[0]?.left).toBe(100);
  });

  it("holds the height above its own minimum", () => {
    const h = harness({ y: "top" });

    drag(h.handle, { x: 250, y: 1000 });

    expect(h.committed).toEqual([{ left: 100, top: 360, right: 500, bottom: 600 }]);
  });

  it("holds a dragged bottom edge above the minimum too", () => {
    const h = harness({ y: "bottom" });

    drag(h.handle, { x: 250, y: 0 });

    expect(h.committed[0]?.bottom).toBe(340);
  });
});

describe("what the placement forbids", () => {
  it("does nothing at all where no axis is resizable", () => {
    const h = harness({ x: "right", y: "bottom" }, "none");

    drag(h.handle, { x: 900, y: 900 });
    key(h.handle, "ArrowRight");

    expect(h.applied).toEqual([]);
    expect(h.committed).toEqual([]);
  });

  it("leaves the height alone where the placement owns it", () => {
    const h = harness({ x: "right", y: "bottom" }, "width");

    drag(h.handle, { x: 900, y: 900 });

    // The corner still widens; the vertical half is the placement's.
    expect(h.committed).toEqual([{ left: 100, top: 100, right: 900, bottom: 600 }]);
  });

  it("ignores a grip that only moves a horizontal edge under a width-only placement", () => {
    const h = harness({ y: "bottom" }, "width");

    drag(h.handle, { x: 250, y: 900 });
    key(h.handle, "ArrowDown");

    // Nothing it could move, so it must not claim the gesture either.
    expect(h.applied).toEqual([]);
  });

  it("reads the placement per interaction, not once", () => {
    const h = harness({ x: "right" }, "none");

    drag(h.handle, { x: 900, y: 400 });
    expect(h.applied).toEqual([]);

    h.setAxis("both");
    drag(h.handle, { x: 900, y: 400 });

    expect(h.committed).toHaveLength(1);
  });
});

describe("the keyboard", () => {
  it("moves the edge the arrow names, in the direction it names", () => {
    const h = harness({ x: "left" });

    key(h.handle, "ArrowLeft");

    // The left grip going left grows the panel; the same key on the right grip
    // shrinks it. That symmetry is the point of naming the edge.
    expect(h.committed).toEqual([{ left: 84, top: 100, right: 500, bottom: 600 }]);
  });

  it("shrinks from the opposite grip on the same key", () => {
    const h = harness({ x: "right" });

    key(h.handle, "ArrowLeft");

    expect(h.committed[0]?.right).toBe(484);
  });

  it("takes a coarser step with shift", () => {
    const h = harness({ x: "right" });

    key(h.handle, "ArrowRight", true);

    expect(h.committed[0]?.right).toBe(564);
  });

  it("moves a top edge on the vertical arrows", () => {
    const h = harness({ y: "top" });

    key(h.handle, "ArrowUp");

    // Up on the top grip grows the panel, the mirror of down on the bottom one.
    expect(h.committed[0]?.top).toBe(84);
    expect(h.committed[0]?.bottom).toBe(600);
  });

  it("moves a vertical edge on the vertical arrows", () => {
    const h = harness({ y: "bottom" });

    key(h.handle, "ArrowDown");
    expect(h.committed[0]?.bottom).toBe(616);

    key(h.handle, "ArrowUp");
    expect(h.committed[1]?.bottom).toBe(584);
  });

  it("ignores an arrow across the axis a grip does not move", () => {
    const h = harness({ x: "left" });

    const event = new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true });
    h.handle.dispatchEvent(event);

    expect(h.applied).toEqual([]);
    // And leaves the key to the page, so it still scrolls.
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores a sideways arrow on a grip that only moves a horizontal edge", () => {
    const h = harness({ y: "bottom" });

    const event = new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true });
    h.handle.dispatchEvent(event);

    expect(h.applied).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores keys that are not arrows", () => {
    const h = harness({ x: "left" });

    const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    h.handle.dispatchEvent(event);

    expect(h.applied).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("persists once when the gesture ends, not per repeat", () => {
    const h = harness({ x: "right" });

    for (let i = 0; i < 3; i += 1) {
      h.handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
    }
    expect(h.committed).toEqual([]);
    h.handle.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));

    expect(h.applied).toHaveLength(3);
    expect(h.committed).toHaveLength(1);
  });

  it("closes a gesture whose keyup never arrives, on blur", () => {
    const h = harness({ x: "right" });

    h.handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
    h.handle.dispatchEvent(new FocusEvent("blur"));

    expect(h.committed).toHaveLength(1);
  });

  it("settles nothing when no gesture is open", () => {
    const h = harness({ x: "right" });

    h.handle.dispatchEvent(new FocusEvent("blur"));

    expect(h.committed).toEqual([]);
  });
});

describe("the handle element", () => {
  it("marks itself while dragging and clears the mark at the end", () => {
    const h = harness({ x: "right" });

    h.handle.dispatchEvent(pointer("pointerdown", 0, 0));
    window.dispatchEvent(pointer("pointermove", 700, 400));
    expect(h.handle.getAttribute("data-dragging")).toBe("true");
    window.dispatchEvent(pointer("pointerup", 700, 400));

    expect(h.handle.hasAttribute("data-dragging")).toBe(false);
  });

  it("names its own axis for assistive technology, and a corner names none", () => {
    expect(harness({ x: "left" }).handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(harness({ y: "top" }).handle.getAttribute("aria-orientation")).toBe("horizontal");
    expect(harness({ x: "left", y: "top" }).handle.hasAttribute("aria-orientation")).toBe(false);
  });

  it("carries its grip in its class and its part", () => {
    const h = harness({ x: "right", y: "bottom" });

    expect(h.handle.className).toBe("resize-handle resize-handle--bottom-right");
    expect(h.handle.getAttribute("part")).toBe("resize-handle resize-handle-bottom-right");
  });
});
