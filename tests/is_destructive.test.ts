import { describe, expect, it } from "vitest";
import { isDestructive } from "../src/tools/is_destructive.js";

describe("isDestructive", () => {
  it("is true only when x-destructive is exactly true", () => {
    expect(isDestructive({ "x-destructive": true })).toBe(true);
    expect(isDestructive({ "x-destructive": false })).toBe(false);
    expect(isDestructive({ "x-destructive": "true" })).toBe(false);
    expect(isDestructive({})).toBe(false);
  });
});
