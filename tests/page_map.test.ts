import { describe, expect, it } from "vitest";
import { createPageMapContext } from "../src/tools/page_map.js";

describe("createPageMapContext", () => {
  it("returns nothing without a provider", () => {
    expect(createPageMapContext(null, true)).toEqual([]);
  });

  it("returns nothing when auto-inject is off", () => {
    expect(createPageMapContext(() => ({ a: 1 }), false)).toEqual([]);
  });

  it("wraps the page map as a single context entry", () => {
    const ctx = createPageMapContext(() => ({ fields: ["title"] }), true);
    expect(ctx).toEqual([
      { description: "page_map", value: JSON.stringify({ fields: ["title"] }) },
    ]);
  });
});
