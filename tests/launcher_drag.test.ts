import { afterEach, describe, expect, it } from "vitest";
import { enableLauncherDrag } from "../src/ui/launcher_drag.js";

afterEach(() => {
  document.body.innerHTML = "";
});

// A screen with an origin: the clamps take a box rather than a size now, because
// a host can reserve the edges its own chrome occupies and a widget clamped
// against the whole screen parks itself underneath one.
const VIEWPORT = { left: 0, top: 0, width: 1000, height: 800 };
/** A 56px launcher resting at the bottom-right, where the CSS puts it. */
const START = { left: 920, top: 720, width: 56, height: 56 };

function harness(enabled = true) {
  const launcher = document.createElement("button");
  const applied: Array<{ left: number; top: number }> = [];
  const committed: Array<{ left: number; top: number }> = [];
  const clicks: string[] = [];
  let live = enabled;
  let box = START;
  launcher.addEventListener("click", () => clicks.push("expand"));
  enableLauncherDrag(launcher, {
    enabled: () => live,
    rect: () => box,
    viewport: () => VIEWPORT,
    apply: (left, top) => {
      applied.push({ left, top });
      box = { ...box, left, top };
    },
    commit: (left, top) => committed.push({ left, top }),
  });
  document.body.appendChild(launcher);
  return {
    launcher,
    applied,
    committed,
    clicks,
    setEnabled: (next: boolean) => {
      live = next;
    },
  };
}

function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y });
  return event;
}

/** A press, a run of moves, and a release. Coordinates are viewport pixels. */
function drag(launcher: HTMLElement, from: [number, number], to: [number, number]): void {
  launcher.dispatchEvent(pointer("pointerdown", from[0], from[1]));
  window.dispatchEvent(pointer("pointermove", to[0], to[1]));
  window.dispatchEvent(pointer("pointerup", to[0], to[1]));
}

function key(launcher: HTMLElement, name: string, shift = false): void {
  const event = new KeyboardEvent("keydown", { key: name, shiftKey: shift, cancelable: true });
  launcher.dispatchEvent(event);
  launcher.dispatchEvent(new KeyboardEvent("keyup", { key: name }));
}

describe("enableLauncherDrag", () => {
  it("moves the launcher by the pointer's travel, from the box the press started on", () => {
    const h = harness();

    drag(h.launcher, [948, 748], [648, 348]);

    // Travelled (-300, -400) from a launcher resting at (920, 720).
    expect(h.applied.at(-1)).toEqual({ left: 620, top: 320 });
    expect(h.committed).toEqual([{ left: 620, top: 320 }]);
  });

  it("ignores travel below the threshold, so a press is still a click", () => {
    const h = harness();

    drag(h.launcher, [948, 748], [950, 749]);

    expect(h.applied).toEqual([]);
    expect(h.committed).toEqual([]);
    // And the click the browser synthesises still reaches the expand handler.
    h.launcher.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    expect(h.clicks).toEqual(["expand"]);
  });

  it("swallows the click that ends a real drag", () => {
    const h = harness();

    drag(h.launcher, [948, 748], [648, 348]);
    h.launcher.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );

    expect(h.clicks).toEqual([]);
  });

  it("swallows only one click, so the next press still expands", () => {
    const h = harness();

    drag(h.launcher, [948, 748], [648, 348]);
    h.launcher.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    h.launcher.dispatchEvent(pointer("pointerdown", 648, 348));
    window.dispatchEvent(pointer("pointerup", 648, 348));
    h.launcher.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );

    expect(h.clicks).toEqual(["expand"]);
  });

  it("lets a keyboard or programmatic activation through, drag or no drag", () => {
    const h = harness();

    drag(h.launcher, [948, 748], [648, 348]);
    // detail 0: Enter on the focused button, assistive tech, or click() itself.
    // None of these can be the tail of a drag, and for a keyboard user this is
    // the only way to open the panel at all.
    h.launcher.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(h.clicks).toEqual(["expand"]);
  });

  it("does not leave a suppression armed when the drag ends off the launcher", () => {
    const h = harness();

    // A drag whose click never arrives -- the pointer came up somewhere else.
    drag(h.launcher, [948, 748], [648, 348]);
    // The next gesture is an ordinary press, and its click must survive.
    h.launcher.dispatchEvent(pointer("pointerdown", 648, 348));
    window.dispatchEvent(pointer("pointerup", 648, 348));
    h.launcher.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );

    expect(h.clicks).toEqual(["expand"]);
  });

  it("keeps the launcher inside the viewport", () => {
    const h = harness();

    drag(h.launcher, [948, 748], [2000, 2000]);

    expect(h.committed).toEqual([{ left: 936, top: 736 }]);
  });

  it("marks the launcher while it travels and clears the mark at the end", () => {
    const h = harness();

    h.launcher.dispatchEvent(pointer("pointerdown", 948, 748));
    window.dispatchEvent(pointer("pointermove", 648, 348));
    expect(h.launcher.getAttribute("data-dragging")).toBe("true");
    window.dispatchEvent(pointer("pointerup", 648, 348));
    expect(h.launcher.hasAttribute("data-dragging")).toBe(false);
  });

  it("does nothing at all where the placement forbids it", () => {
    const h = harness(false);

    drag(h.launcher, [948, 748], [648, 348]);
    key(h.launcher, "ArrowLeft");

    expect(h.applied).toEqual([]);
    expect(h.committed).toEqual([]);
  });

  it("moves on the arrow keys, with a coarser step for shift", () => {
    const h = harness();

    key(h.launcher, "ArrowLeft");
    expect(h.applied.at(-1)).toEqual({ left: 904, top: 720 });
    key(h.launcher, "ArrowUp", true);
    expect(h.applied.at(-1)).toEqual({ left: 904, top: 656 });
    key(h.launcher, "ArrowRight");
    expect(h.applied.at(-1)).toEqual({ left: 920, top: 656 });
    key(h.launcher, "ArrowDown");
    expect(h.applied.at(-1)).toEqual({ left: 920, top: 672 });
  });

  it("leaves other keys to the button, so Enter still expands", () => {
    const h = harness();

    const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    h.launcher.dispatchEvent(event);

    expect(h.applied).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("persists a key gesture once, when it ends, not per repeat", () => {
    const h = harness();

    // Three repeats of a held arrow, then the key comes up.
    for (let i = 0; i < 3; i += 1) {
      h.launcher.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true }),
      );
    }
    expect(h.committed).toEqual([]);
    h.launcher.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft" }));

    expect(h.applied).toHaveLength(3);
    expect(h.committed).toEqual([{ left: 872, top: 720 }]);
  });

  it("closes a key gesture whose keyup never arrives, on blur", () => {
    const h = harness();

    h.launcher.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true }));
    h.launcher.dispatchEvent(new FocusEvent("blur"));

    expect(h.committed).toEqual([{ left: 904, top: 720 }]);
  });

  it("settles nothing when no key gesture is open", () => {
    const h = harness();

    h.launcher.dispatchEvent(new FocusEvent("blur"));

    expect(h.committed).toEqual([]);
  });
});
