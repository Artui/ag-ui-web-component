import { describe, expect, it } from "vitest";
import { parseToolCatalog } from "../src/tools/parse_tool_catalog.js";

describe("parseToolCatalog", () => {
  it("maps name → summary for valid entries (ignoring description)", () => {
    expect(
      parseToolCatalog([
        { name: "query_model", summary: "Query records", description: "Run an ORM query." },
        { name: "ping", summary: "Ping" },
      ]),
    ).toEqual({ query_model: "Query records", ping: "Ping" });
  });

  it("returns an empty map for a non-array payload", () => {
    expect(parseToolCatalog({ tools: [] })).toEqual({});
    expect(parseToolCatalog(null)).toEqual({});
  });

  it("skips malformed entries", () => {
    expect(
      parseToolCatalog([
        null,
        42,
        { name: "a" }, // missing summary
        { summary: "b" }, // missing name
        { name: 1, summary: "c" }, // non-string name
        { name: "d", summary: 2 }, // non-string summary
        { name: "ok", summary: "Good" },
      ]),
    ).toEqual({ ok: "Good" });
  });
});
