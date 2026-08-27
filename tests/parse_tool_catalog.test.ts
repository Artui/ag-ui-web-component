import { describe, expect, it } from "vitest";
import { parseToolCatalog } from "../src/tools/parse_tool_catalog.js";

describe("parseToolCatalog", () => {
  it("keeps the whole entry, description included", () => {
    // The entry a server sends is the entry a caller gets back. A parser that
    // narrowed it to the summary made `description` unreachable by anything —
    // a documented wire field with nowhere to arrive.
    expect(
      parseToolCatalog([
        { name: "query_model", summary: "Query records", description: "Run an ORM query." },
        { name: "ping", summary: "Ping" },
      ]),
    ).toEqual({
      query_model: {
        name: "query_model",
        summary: "Query records",
        description: "Run an ORM query.",
      },
      ping: { name: "ping", summary: "Ping" },
    });
  });

  it("drops a description that isn't a string", () => {
    // Same tolerance the name and summary get: a malformed optional field
    // costs that field, not the entry.
    expect(parseToolCatalog([{ name: "ping", summary: "Ping", description: 7 }])).toEqual({
      ping: { name: "ping", summary: "Ping" },
    });
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
    ).toEqual({ ok: { name: "ok", summary: "Good" } });
  });
});
