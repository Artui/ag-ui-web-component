import { afterEach, describe, expect, it } from "vitest";
import {
  createResizeHandle,
  type PanelRect,
  type ResizeAnchor,
  type ResizeAxis,
  type ResizeSize,
} from "../src/ui/resize_handle.js";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A 400x500 panel sitting at (100, 100). */
const RECT: PanelRect = { left: 100, top: 100, right: 500, bottom: 600 };

function harness(axis: ResizeAxis, anchor: ResizeAnchor, rect: PanelRect = RECT) {
  const applied: ResizeSize[] = [];
  const committed: ResizeSize[] = [];
  let currentAxis = axis;
  const handle = createResizeHandle({
    axis: () => currentAxis,
    anchor: () => anchor,
    rect: () => rect,
    apply: (size) => applied.push(size),
    commit: (size) => committed.push(size),
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

const BOTTOM_RIGHT: ResizeAnchor = { x: "right", y: "bottom" };
const TOP_LEFT: ResizeAnchor = { x: "left", y: "top" };
const BOTTOM_LEFT: ResizeAnchor = { x: "left", y: "bottom" };

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

describe("createResizeHandle", () => {
  it("measures from the fixed edge, so the anchored corner stays put", () => {
    // The defect this replaced: applying a pointer *delta* assumed one anchor
    // for every placement, so dragging an embedded panel's grip grew it out of
    // the opposite corner while the grip itself stayed where it was.
    const pinnedBottomRight = harness("both", BOTTOM_RIGHT);
    drag(pinnedBottomRight.handle, { x: 150, y: 200 });
    // Pinned bottom-right (500, 600): width is right - x, height is bottom - y.
    expect(pinnedBottomRight.applied.at(-1)).toEqual({ width: 350, height: 400 });

    const pinnedTopLeft = harness("both", TOP_LEFT);
    drag(pinnedTopLeft.handle, { x: 550, y: 700 });
    // Pinned top-left (100, 100): width is x - left, height is y - top.
    expect(pinnedTopLeft.applied.at(-1)).toEqual({ width: 450, height: 600 });
  });

  it("mixes the axes independently for a bottom-left anchored panel", () => {
    const { handle, applied } = harness("both", BOTTOM_LEFT);
    drag(handle, { x: 620, y: 300 });
    expect(applied.at(-1)).toEqual({ width: 520, height: 300 });
  });

  it("resizes width only where the placement owns the height", () => {
    const rightPinned = harness("width", BOTTOM_RIGHT);
    drag(rightPinned.handle, { x: 220, y: 400 });
    expect(rightPinned.applied.at(-1)).toEqual({ width: 280 });

    const leftPinned = harness("width", TOP_LEFT);
    drag(leftPinned.handle, { x: 460, y: 400 });
    expect(leftPinned.applied.at(-1)).toEqual({ width: 360 });
  });

  it("clamps to a usable minimum rather than collapsing the panel", () => {
    const { handle, applied } = harness("both", BOTTOM_RIGHT);
    drag(handle, { x: 480, y: 590 });
    expect(applied.at(-1)).toEqual({ width: 280, height: 240 });
  });

  it("commits once per drag, with the final size", () => {
    const { handle, committed } = harness("both", BOTTOM_RIGHT);
    drag(handle, { x: 150, y: 200 });
    expect(committed).toEqual([{ width: 350, height: 400 }]);
  });

  it("stops tracking once the drag ends", () => {
    const { handle, applied } = harness("both", BOTTOM_RIGHT);
    drag(handle, { x: 150, y: 200 });
    const seen = applied.length;
    window.dispatchEvent(pointer("pointermove", 10, 10));
    expect(applied).toHaveLength(seen);
  });

  it("does nothing where the placement is full-bleed", () => {
    // A 100vw/100vh layout has nothing to drag. The element still exists (the
    // shadow CSS hides it) so a later placement change can bring it back.
    const { handle, applied } = harness("none", BOTTOM_RIGHT);
    drag(handle, { x: 150, y: 200 });
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true }));
    expect(applied).toHaveLength(0);
  });

  it("follows a placement change instead of keeping the axes it mounted with", () => {
    // Caught by the demo playground: reading the placement once at construction
    // left a floating panel dragging both axes after the host docked it.
    const h = harness("both", BOTTOM_RIGHT);
    h.setAxis("width");
    drag(h.handle, { x: 220, y: 400 });
    expect(h.applied.at(-1)).toEqual({ width: 280 });

    h.setAxis("none");
    drag(h.handle, { x: 150, y: 150 });
    expect(h.applied).toHaveLength(1);
  });

  it("resizes from the keyboard, which is the only route without a pointer", () => {
    const { handle, applied, committed } = harness("both", BOTTOM_RIGHT);
    /** One deliberate press: down, then up. */
    const press = (key: string, shiftKey = false): void => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, cancelable: true }));
      handle.dispatchEvent(new KeyboardEvent("keyup", { key, shiftKey }));
    };
    // A left-side grip grows leftward.
    press("ArrowLeft");
    expect(applied.at(-1)).toEqual({ width: 416 });
    press("ArrowRight");
    expect(applied.at(-1)).toEqual({ width: 384 });
    // A top grip grows upward.
    press("ArrowUp", true);
    expect(applied.at(-1)).toEqual({ height: 564 });
    press("ArrowDown");
    expect(applied.at(-1)).toEqual({ height: 484 });
    // Four deliberate presses are four gestures, the way four drags would be.
    expect(committed).toHaveLength(4);
  });

  it("commits once per keyboard gesture, not once per key event", () => {
    // `commit` is declared "once per completed drag, for persistence", and a
    // host that reads it that way puts a storage write or a PATCH behind it.
    // Holding an arrow key means OS key repeat at 20-30 events a second, which
    // is exactly the interaction keyboard support exists for.
    const { handle, applied, committed } = harness("both", BOTTOM_RIGHT);
    for (let i = 0; i < 3; i += 1) {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true }));
    }
    // Live feedback on every repeat, and nothing persisted mid-gesture.
    expect(applied).toHaveLength(3);
    expect(committed).toEqual([]);

    handle.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft" }));
    expect(committed).toEqual([{ width: 416 }]);
  });

  it("commits a pending keyboard resize when focus leaves before the key comes up", () => {
    const { handle, committed } = harness("both", BOTTOM_RIGHT);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true }));
    handle.dispatchEvent(new FocusEvent("blur"));
    expect(committed).toEqual([{ width: 416 }]);

    // ...and the gesture is over, so the key coming up later commits nothing.
    handle.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft" }));
    expect(committed).toHaveLength(1);
  });

  it("commits nothing for a key that never resized anything", () => {
    const { handle, committed } = harness("both", BOTTOM_RIGHT);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", cancelable: true }));
    handle.dispatchEvent(new KeyboardEvent("keyup", { key: "Home" }));
    handle.dispatchEvent(new FocusEvent("blur"));
    expect(committed).toEqual([]);
  });

  it("reverses the horizontal keys when the left edge is the fixed one", () => {
    const { handle, applied } = harness("both", TOP_LEFT);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
    expect(applied.at(-1)).toEqual({ width: 416 });
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true }));
    expect(applied.at(-1)).toEqual({ height: 516 });
  });

  it("ignores the vertical keys and unrelated keys where height is not draggable", () => {
    const { handle, applied } = harness("width", BOTTOM_RIGHT);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", cancelable: true }));
    expect(applied).toHaveLength(0);
  });
});
