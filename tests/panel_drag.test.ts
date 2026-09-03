/**
 * Dragging the panel by its header.
 *
 * The arithmetic is one translation, so most of what is worth testing here is
 * what the gesture declines to do: a press that belongs to a control, a press
 * that never travels, and a press on a placement with nowhere to go. Where the
 * panel then lands is launcher_for_panel.test.ts and ag_ui_chat_panel_drag's
 * business.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { enablePanelDrag, type PanelDragOptions } from "../src/ui/panel_drag.js";
import type { PanelRect } from "../src/ui/resize_handle.js";

const PANEL: PanelRect = { left: 100, top: 60, right: 480, bottom: 620 };

interface Harness {
  readonly header: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly applied: PanelRect[];
  readonly committed: PanelRect[];
}

function mount(over: Partial<PanelDragOptions> = {}): Harness {
  const header = document.createElement("div");
  const button = document.createElement("button");
  header.appendChild(button);
  document.body.appendChild(header);

  const applied: PanelRect[] = [];
  const committed: PanelRect[] = [];
  enablePanelDrag(header, {
    enabled: () => true,
    rect: () => PANEL,
    apply: (box) => applied.push(box),
    commit: (box) => committed.push(box),
    ...over,
  });
  return { header, button, applied, committed };
}

/** A pointer event carrying the fields the drag reads. */
function pointer(type: string, x: number, y: number, button = 0): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.assign(event, { clientX: x, clientY: y, button });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("enablePanelDrag", () => {
  it("moves the panel by exactly what the pointer travelled", () => {
    const { header, applied, committed } = mount();

    header.dispatchEvent(pointer("pointerdown", 200, 100));
    window.dispatchEvent(pointer("pointermove", 260, 140));
    window.dispatchEvent(pointer("pointerup", 260, 140));

    // The box the press started on, translated: no edge is recomputed, so the
    // panel keeps its size and arrives under the pointer.
    expect(applied).toEqual([{ left: 160, top: 100, right: 540, bottom: 660 }]);
    expect(committed).toEqual([{ left: 160, top: 100, right: 540, bottom: 660 }]);
  });

  it("measures every move from the press, not from the move before it", () => {
    const { header, applied } = mount();

    header.dispatchEvent(pointer("pointerdown", 200, 100));
    window.dispatchEvent(pointer("pointermove", 220, 100));
    window.dispatchEvent(pointer("pointermove", 240, 100));
    window.dispatchEvent(pointer("pointerup", 240, 100));

    // 40 from the press, not 20 from the previous move, which is what chasing
    // the live rect would have produced.
    expect(applied.at(-1)?.left).toBe(140);
  });

  it("leaves a press that barely travels as a press", () => {
    const { header, applied, committed } = mount();

    header.dispatchEvent(pointer("pointerdown", 200, 100));
    window.dispatchEvent(pointer("pointermove", 202, 101));
    window.dispatchEvent(pointer("pointerup", 202, 101));

    expect(applied).toEqual([]);
    expect(committed).toEqual([]);
    expect(header.hasAttribute("data-dragging")).toBe(false);
  });

  it("marks the header while the drag is live and unmarks it after", () => {
    const { header } = mount();

    header.dispatchEvent(pointer("pointerdown", 200, 100));
    window.dispatchEvent(pointer("pointermove", 260, 140));
    expect(header.getAttribute("data-dragging")).toBe("true");

    window.dispatchEvent(pointer("pointerup", 260, 140));
    expect(header.hasAttribute("data-dragging")).toBe(false);
  });

  it("steps aside for a control in the header", () => {
    // The controls are the only way to reach what they do, and a drag started
    // on one would move the panel out from under the button being aimed at.
    const { button, applied } = mount();

    button.dispatchEvent(pointer("pointerdown", 200, 100));
    window.dispatchEvent(pointer("pointermove", 260, 140));

    expect(applied).toEqual([]);
  });

  it("still drags through a host's own element in the header", () => {
    // A slotted widget's shadow root is in the composed path and is not an
    // element; a check that assumed otherwise would throw or refuse the drag.
    const { header, applied } = mount();
    const widget = document.createElement("span");
    const inner = widget.attachShadow({ mode: "open" });
    const label = document.createElement("span");
    inner.appendChild(label);
    header.appendChild(widget);

    label.dispatchEvent(pointer("pointerdown", 200, 100));
    window.dispatchEvent(pointer("pointermove", 260, 140));

    expect(applied).toHaveLength(1);
  });

  it("ignores a secondary button", () => {
    const { header, applied } = mount();

    header.dispatchEvent(pointer("pointerdown", 200, 100, 2));
    window.dispatchEvent(pointer("pointermove", 260, 140));

    expect(applied).toEqual([]);
  });

  it("does nothing where the placement has nowhere to move the panel", () => {
    const { header, applied } = mount({ enabled: () => false });

    header.dispatchEvent(pointer("pointerdown", 200, 100));
    window.dispatchEvent(pointer("pointermove", 260, 140));

    expect(applied).toEqual([]);
  });

  it("lets go of the window once the drag is over", () => {
    const { header, applied } = mount();

    header.dispatchEvent(pointer("pointerdown", 200, 100));
    window.dispatchEvent(pointer("pointermove", 260, 140));
    window.dispatchEvent(pointer("pointerup", 260, 140));
    window.dispatchEvent(pointer("pointermove", 900, 900));

    expect(applied).toHaveLength(1);
  });

  it("takes the press away from the browser's own text selection", () => {
    const { header } = mount();
    const down = pointer("pointerdown", 200, 100);

    header.dispatchEvent(down);

    expect(down.defaultPrevented).toBe(true);
  });
});
