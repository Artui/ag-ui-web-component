import { describe, expect, it } from "vitest";
import { withCredentials } from "../src/core/utils.js";

describe("withCredentials", () => {
  it("hands back the very same init when no mode is configured", () => {
    const init = { method: "GET", headers: { a: "1" } };
    // Identity, not equality: an unconfigured call must reach fetch exactly as
    // the caller built it, with no `credentials` key at all — an explicit
    // `undefined` would state a policy where the point is to leave the
    // browser's own default alone.
    expect(withCredentials(init, undefined)).toBe(init);
    expect(withCredentials(undefined, undefined)).toBeUndefined();
  });

  it("overlays the mode, keeping every other init field", () => {
    expect(withCredentials({ method: "POST", headers: { a: "1" } }, "include")).toEqual({
      method: "POST",
      headers: { a: "1" },
      credentials: "include",
    });
  });

  it("builds an init from nothing when only a mode is given", () => {
    expect(withCredentials(undefined, "omit")).toEqual({ credentials: "omit" });
  });
});
