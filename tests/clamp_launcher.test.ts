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
    expect(clampLauncher(launcher(1200, 900), viewport)).toEqual({ left: 944, top: 744 });
  });

  it("pulls a launcher back from past the near edges", () => {
    expect(clampLauncher(launcher(-80, -30), viewport)).toEqual({ left: 0, top: 0 });
  });

  it("keeps a launcher larger than its viewport reachable at the origin", () => {
    // The far bound goes negative here, and the near one has to win or the only
    // way back into a collapsed conversation ends up off-screen.
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

    expect(clampLauncher(launcher(500, 0), reserved).top).toBe(120);
    expect(clampLauncher(launcher(500, 40), reserved).top).toBe(120);
    // ...and it still reaches the bottom of what is left.
    expect(clampLauncher(launcher(500, 5000), reserved).top).toBe(120 + 680 - 56);
  });
});
