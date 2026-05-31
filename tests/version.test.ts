import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("VERSION", () => {
  it("is exposed and looks like semver", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION.split(".")).toHaveLength(3);
  });
});
