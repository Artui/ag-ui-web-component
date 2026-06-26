import { describe, expect, it } from "vitest";
import { DEFAULT_UI_STRINGS, mergeUiStrings, type UiStrings } from "../src/ui/ui_strings.js";

describe("ui strings", () => {
  it("ships English defaults for every documented key", () => {
    expect(DEFAULT_UI_STRINGS.title).toBe("Assistant");
    expect(DEFAULT_UI_STRINGS.send).toBe("Send");
    expect(DEFAULT_UI_STRINGS.connectionLost).toBe("Connection lost");
    expect(DEFAULT_UI_STRINGS.minutesAgo).toBe("{n}m ago");
    expect(DEFAULT_UI_STRINGS.confirmRun).toBe("Run “{tool}”?");
  });

  it("merges a partial override over the defaults", () => {
    const merged = mergeUiStrings({ send: "Go", title: "Helper" });
    expect(merged.send).toBe("Go");
    expect(merged.title).toBe("Helper");
    // Untouched keys keep their defaults.
    expect(merged.cancel).toBe(DEFAULT_UI_STRINGS.cancel);
  });

  it("returns the defaults verbatim for an empty override", () => {
    expect(mergeUiStrings({})).toEqual(DEFAULT_UI_STRINGS);
  });

  it("ignores explicit `undefined` overrides (keeps the default)", () => {
    const overrides: Partial<UiStrings> = { send: "Go" };
    // An explicit `undefined` value (what a runtime property mutation can yield)
    // must not clobber the default.
    (overrides as Record<string, string | undefined>)["title"] = undefined;
    const merged = mergeUiStrings(overrides);
    expect(merged.title).toBe(DEFAULT_UI_STRINGS.title);
    expect(merged.send).toBe("Go");
  });

  it("does not mutate the defaults object", () => {
    mergeUiStrings({ send: "Go" });
    expect(DEFAULT_UI_STRINGS.send).toBe("Send");
  });
});
