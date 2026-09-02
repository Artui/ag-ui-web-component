import { describe, expect, it } from "vitest";
import { clampLauncher } from "../src/ui/clamp_launcher.js";

const launcher = (left: number, top: number) => ({ left, top, width: 56, height: 56 });
const viewport = { width: 1000, height: 800 };

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
    expect(clampLauncher(launcher(10, 10), { width: 40, height: 40 })).toEqual({
      left: 0,
      top: 0,
    });
  });
});
