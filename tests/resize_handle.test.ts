import { afterEach, describe, expect, it } from "vitest";
import { createResizeHandle, type ResizeSize } from "../src/ui/resize_handle.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function harness(axis: "both" | "width" | "none", start = { width: 400, height: 500 }) {
  const applied: ResizeSize[] = [];
  const committed: ResizeSize[] = [];
  let current = { ...start };
  const handle = createResizeHandle({
    axis,
    measure: () => current,
    apply: (size) => {
      applied.push(size);
      current = { ...current, ...size } as { width: number; height: number };
    },
    commit: (size) => committed.push(size),
    label: "Resize",
  });
  if (handle !== null) {
    document.body.appendChild(handle);
  }
  return { handle, applied, committed };
}

function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y });
  return event;
}

describe("createResizeHandle", () => {
  it("builds nothing where the placement is full-bleed", () => {
    // A 100vw/100vh layout has nothing to drag; a handle there is a control
    // that does nothing.
    expect(harness("none").handle).toBeNull();
  });

  it("grows the panel as the pointer moves toward the page edge", () => {
    const { handle, applied, committed } = harness("both");
    handle?.dispatchEvent(pointer("pointerdown", 100, 100));
    window.dispatchEvent(pointer("pointermove", 60, 70));
    window.dispatchEvent(pointer("pointerup", 60, 70));

    // Anchored right/bottom, so dragging left and up grows it.
    expect(applied.at(-1)).toEqual({ width: 440, height: 530 });
    expect(committed).toHaveLength(1);
  });

  it("clamps to a usable minimum rather than collapsing the panel", () => {
    const { handle, applied } = harness("both", { width: 300, height: 260 });
    handle?.dispatchEvent(pointer("pointerdown", 0, 0));
    window.dispatchEvent(pointer("pointermove", 900, 900));

    expect(applied.at(-1)).toEqual({ width: 280, height: 240 });
  });

  it("resizes width only where the placement owns the height", () => {
    const { handle, applied } = harness("width");
    handle?.dispatchEvent(pointer("pointerdown", 100, 100));
    window.dispatchEvent(pointer("pointermove", 80, 40));

    expect(applied.at(-1)).toEqual({ width: 420 });
  });

  it("stops tracking once the drag ends", () => {
    const { handle, applied } = harness("both");
    handle?.dispatchEvent(pointer("pointerdown", 100, 100));
    window.dispatchEvent(pointer("pointerup", 90, 90));
    const seen = applied.length;
    window.dispatchEvent(pointer("pointermove", 10, 10));

    expect(applied).toHaveLength(seen);
  });

  it("resizes from the keyboard, which is the only route without a pointer", () => {
    const { handle, applied, committed } = harness("both");
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true }));
    expect(applied.at(-1)).toEqual({ width: 416 });

    handle?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, cancelable: true }),
    );
    expect(applied.at(-1)).toEqual({ height: 564 });
    expect(committed).toHaveLength(2);
  });

  it("shrinks on the opposite arrows", () => {
    const { handle, applied } = harness("both");
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
    expect(applied.at(-1)).toEqual({ width: 384 });
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true }));
    expect(applied.at(-1)).toEqual({ height: 484 });
  });

  it("ignores the vertical keys where only width is draggable", () => {
    const { handle, applied } = harness("width");
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true }));
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", cancelable: true }));
    expect(applied).toHaveLength(0);
  });
});
