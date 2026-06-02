import { describe, expect, it } from "vitest";
import { fillTemplate } from "../src/skills/fill_template.js";

describe("fillTemplate", () => {
  it("substitutes present placeholders", () => {
    const r = fillTemplate("Summarize {model} rows", { model: "Order" });
    expect(r.text).toBe("Summarize Order rows");
    expect(r.missing).toEqual([]);
  });

  it("coerces non-string values", () => {
    expect(fillTemplate("count={n}", { n: 12 }).text).toBe("count=12");
  });

  it("leaves a missing placeholder verbatim and reports it", () => {
    const r = fillTemplate("for {selected_ids}", {});
    expect(r.text).toBe("for {selected_ids}");
    expect(r.missing).toEqual(["selected_ids"]);
  });

  it("treats null and empty string as missing", () => {
    expect(fillTemplate("{a}", { a: null }).missing).toEqual(["a"]);
    expect(fillTemplate("{b}", { b: "" }).missing).toEqual(["b"]);
  });

  it("dedupes a repeated missing placeholder", () => {
    const r = fillTemplate("{x} and {x} and {y}", { y: "ok" });
    expect(r.missing).toEqual(["x"]);
    expect(r.text).toBe("{x} and {x} and ok");
  });

  it("returns the text unchanged when there are no placeholders", () => {
    const r = fillTemplate("plain prompt", { unused: "v" });
    expect(r.text).toBe("plain prompt");
    expect(r.missing).toEqual([]);
  });
});
