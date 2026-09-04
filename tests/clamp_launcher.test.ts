import { describe, expect, it } from "vitest";
import { clampLauncher } from "../src/ui/clamp_launcher.js";

const launcher = (left: number, top: number) => ({ left, top, width: 56, height: 56 });
// A screen with an origin: the clamps take a box rather than a size now, because
// a host can reserve the edges its own chrome occupies and a widget clamped
// against the whole screen parks itself underneath one.
const viewport = { left: 0, top: 0, width: 1000, height: 800 };

describe("clampLauncher", () => {
  it("leaves a launcher already on screen alone", () => {
    expect(clampLauncher(launcher(300, 200), viewport)).toEqual({ left: 300, top: 200 });
  });

  it("pulls a launcher back from past the far edges", () => {
    expect(clampLauncher(launcher(1200, 900), viewport)).toEqual({ left: 936, top: 736 });
  });

  it("pulls a launcher back from past the near edges", () => {
    expect(clampLauncher(launcher(-80, -30), viewport)).toEqual({ left: 8, top: 8 });
  });

  it("keeps a launcher larger than its viewport reachable at the origin", () => {
    // The far bound goes negative here, and the near one has to win or the only
    // way back into a collapsed conversation ends up off-screen. The edge
    // margin is given up too: there is no room for it, and insisting would put
    // the bubble further out than having none.
    expect(clampLauncher(launcher(10, 10), { left: 0, top: 0, width: 40, height: 40 })).toEqual({
      left: 0,
      top: 0,
    });
  });

  it("keeps a launcher out of the edges the host reserved", () => {
    // The failure this origin exists for. A user drags the bubble up under a
    // sticky header, cannot reach it, and presses collapse -- which is the one
    // thing that makes it worse, because the panel goes and the unreachable
    // launcher is all that is left.
    const reserved = { left: 0, top: 120, width: 1000, height: 680 };

    expect(clampLauncher(launcher(500, 0), reserved).top).toBe(128);
    expect(clampLauncher(launcher(500, 40), reserved).top).toBe(128);
    // ...and it still reaches the bottom of what is left.
    expect(clampLauncher(launcher(500, 5000), reserved).top).toBe(120 + 680 - 56 - 8);
  });

  it("never leaves the bubble flush against the edge", () => {
    // A circle with a drop shadow touching the boundary reads as clipped even
    // when no pixel is missing -- and on a rounded screen, or under a
    // scrollbar, it is clipped. Small enough that every corner is still
    // reachable: this is not the panel's 24px gutter.
    const screen = { left: 0, top: 0, width: 1000, height: 800 };

    expect(clampLauncher(launcher(-500, -500), screen)).toEqual({ left: 8, top: 8 });
    expect(clampLauncher(launcher(5000, 5000), screen)).toEqual({
      left: 1000 - 56 - 8,
      top: 800 - 56 - 8,
    });
  });

  it("gives the margin up rather than pinning to the wrong edge", () => {
    // A viewport narrower than the bubble and its two margins would otherwise
    // put the lower bound above the upper one, and Math.max would win with a
    // position past the far side.
    const cramped = { left: 0, top: 0, width: 60, height: 60 };

    const held = clampLauncher(launcher(5000, 5000), cramped);
    expect(held.left).toBeGreaterThanOrEqual(0);
    expect(held.left).toBeLessThanOrEqual(60 - 56);
    expect(held.top).toBeLessThanOrEqual(60 - 56);
  });
});
