import { describe, expect, it } from "vitest";
import { isNavigates } from "../src/tools/is_navigates.js";

describe("isNavigates", () => {
  it("is true only when x-navigates is exactly true", () => {
    expect(isNavigates({ "x-navigates": true })).toBe(true);
    expect(isNavigates({ "x-navigates": false })).toBe(false);
    expect(isNavigates({})).toBe(false);
  });
});
