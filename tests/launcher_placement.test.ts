import { describe, expect, it } from "vitest";
import { launcherPlacement } from "../src/ui/launcher_placement.js";

/** A 56px launcher, the component's default size. */
const box = (left: number, top: number, size = 56) => ({ left, top, width: size, height: size });
const panel = { width: 380, height: 560 };
const desktop = { width: 1440, height: 900 };

describe("launcherPlacement", () => {
  it("reproduces the resting layout exactly for an undragged launcher", () => {
    // The default CSS is inset: auto 24px 24px auto with the launcher at the
    // host box's bottom-right corner. Feeding this function where that puts the
    // launcher has to hand back the same two values, or simply mounting the
    // widget would shift it.
    const viewport = { width: 414, height: 896 };
    const sized = { width: 366, height: 560 };
    const resting = box(viewport.width - 24 - 56, viewport.height - 24 - 56);

    const placed = launcherPlacement(resting, sized, viewport);

    expect(placed.corner).toEqual({ x: "right", y: "bottom" });
    expect(placed.hostInset).toBe("auto 24px 24px auto");
    expect(placed.launcherInset).toBe("auto 0px 0px auto");
  });

  it("opens toward whichever side of the launcher has more room", () => {
    // Top-left corner: everything is down and to the right.
    expect(launcherPlacement(box(20, 20), panel, desktop).corner).toEqual({
      x: "left",
      y: "top",
    });
    // Bottom-right corner: everything is up and to the left.
    expect(launcherPlacement(box(1364, 824), panel, desktop).corner).toEqual({
      x: "right",
      y: "bottom",
    });
    // Mixed corners resolve per axis, not as a pair.
    expect(launcherPlacement(box(1364, 20), panel, desktop).corner).toEqual({
      x: "right",
      y: "top",
    });
    expect(launcherPlacement(box(20, 824), panel, desktop).corner).toEqual({
      x: "left",
      y: "bottom",
    });
  });

  it("measures room for the panel, not which half of the screen holds the launcher", () => {
    // Just right of centre: the launcher is in the right-hand half, but a panel
    // pinned to its left edge still has more room than one pinned to its right,
    // because the room that counts runs from the edge the panel starts at.
    const justRightOfCentre = box(desktop.width / 2 + 10, 400);

    const placed = launcherPlacement(justRightOfCentre, panel, desktop);

    expect(placed.corner.x).toBe("right");
    // And a hair to the left of centre flips it, so the boundary is where the
    // two rooms are equal rather than at the midpoint of the screen.
    expect(launcherPlacement(box(desktop.width / 2 - 40, 400), panel, desktop).corner.x).toBe(
      "left",
    );
  });

  it("pins the panel to the launcher's own edge when it fits", () => {
    const placed = launcherPlacement(box(200, 100), panel, desktop);

    // Opening down-right from (200, 100): the host box starts exactly there.
    expect(placed.hostInset).toBe("100px auto auto 200px");
    // And the launcher needs no offset inside it.
    expect(placed.launcherInset).toBe("0px auto auto 0px");
  });

  it("holds the panel inside the viewport and leaves the launcher where it was", () => {
    // Dragged to the vertical middle of a short viewport: 560px of panel fits
    // neither above nor below, so the winning corner still overflows.
    const shallow = { width: 1440, height: 700 };
    const middle = box(600, 320);

    const placed = launcherPlacement(middle, panel, shallow);

    // Opening downward would run to 320 + 560 = 880, past the 700 viewport, so
    // the box is pulled up to sit on the bottom margin.
    expect(placed.corner.y).toBe("top");
    expect(placed.hostInset).toBe("116px auto auto 600px");
    // 320 - 116 = 204: the launcher keeps its dragged position by carrying the
    // whole of the clamp's correction in its own inset.
    expect(placed.launcherInset).toBe("204px auto auto 0px");
  });

  it("holds a clamped panel against the near margin rather than off-screen", () => {
    // A panel wider than the viewport can satisfy neither bound, and the lower
    // one wins, so its left edge sits on the margin rather than hanging off.
    const narrow = { width: 320, height: 900 };

    const placed = launcherPlacement(box(200, 100), { width: 800, height: 560 }, narrow);

    // This launcher is pinned right, so the clamp reaches the same left edge by
    // pushing the right one past the viewport: 320 + 504 - 800 = 24. A negative
    // offset is the correct expression of it, not a symptom.
    expect(placed.corner.x).toBe("right");
    expect(placed.hostInset).toBe("100px -504px auto auto");
    const right = 320 - -504;
    expect(right - 800).toBe(24);
  });

  it("takes a caller's margin over the default gutter", () => {
    const placed = launcherPlacement(box(0, 0), panel, desktop, 60);

    expect(placed.hostInset).toBe("60px auto auto 60px");
  });

  it("rounds to whole pixels so a drag cannot accumulate a subpixel drift", () => {
    const placed = launcherPlacement(box(200.4, 100.6), panel, desktop);

    expect(placed.hostInset).toBe("101px auto auto 200px");
  });
});
