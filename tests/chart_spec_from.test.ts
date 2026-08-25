import { describe, expect, it } from "vitest";
import { chartSpecFrom } from "../src/ui/chart_spec_from.js";

const ok = { kind: "line", labels: ["a", "b"], series: [{ label: "s", points: [1, 2] }] };

describe("chartSpecFrom", () => {
  it("accepts a well-formed spec", () => {
    expect(chartSpecFrom(ok)).toEqual(ok);
  });

  it("refuses anything that is not an object", () => {
    for (const value of [null, undefined, 42, "chart", [ok]]) {
      expect(chartSpecFrom(value)).toBeNull();
    }
  });

  it("refuses labels that are not all strings", () => {
    expect(chartSpecFrom({ ...ok, labels: ["a", 2] })).toBeNull();
    expect(chartSpecFrom({ ...ok, labels: "ab" })).toBeNull();
  });

  it("refuses a missing or non-array series", () => {
    expect(chartSpecFrom({ labels: ["a"] })).toBeNull();
    expect(chartSpecFrom({ ...ok, series: {} })).toBeNull();
  });

  it("refuses a series entry that is not an object", () => {
    expect(chartSpecFrom({ ...ok, series: ["nope"] })).toBeNull();
    expect(chartSpecFrom({ ...ok, series: [null] })).toBeNull();
  });

  it("refuses a series whose length disagrees with the labels", () => {
    // Silently misaligns every value after the gap, and a chart that is subtly
    // wrong still reads as authoritative.
    expect(chartSpecFrom({ ...ok, series: [{ label: "s", points: [1] }] })).toBeNull();
    expect(chartSpecFrom({ ...ok, series: [{ label: "s", points: [1, 2, 3] }] })).toBeNull();
  });

  it("refuses points that are not finite numbers", () => {
    // JSON encoders render NaN and Infinity as nulls or strings, and either
    // would scale into a chart with no visible extent.
    for (const points of [
      [1, "2"],
      [1, null],
      [1, Number.NaN],
      [1, Number.POSITIVE_INFINITY],
    ]) {
      expect(chartSpecFrom({ ...ok, series: [{ label: "s", points }] })).toBeNull();
    }
    expect(chartSpecFrom({ ...ok, series: [{ label: "s", points: "12" }] })).toBeNull();
  });

  it("refuses an empty series list", () => {
    expect(chartSpecFrom({ ...ok, series: [] })).toBeNull();
  });

  it("defaults an unknown or missing kind to bar rather than refusing the data", () => {
    expect(chartSpecFrom({ ...ok, kind: "sankey" })?.kind).toBe("bar");
    expect(chartSpecFrom({ labels: ok.labels, series: ok.series })?.kind).toBe("bar");
  });

  it("keeps every kind it knows", () => {
    for (const kind of ["bar", "line", "pie", "scatter", "stacked"]) {
      expect(chartSpecFrom({ ...ok, kind })?.kind).toBe(kind);
    }
  });

  it("defaults a missing series label to empty rather than refusing", () => {
    expect(chartSpecFrom({ ...ok, series: [{ points: [1, 2] }] })?.series[0]?.label).toBe("");
  });

  it("omits a non-string title entirely", () => {
    expect(chartSpecFrom({ ...ok, title: 7 })).not.toHaveProperty("title");
    expect(chartSpecFrom({ ...ok, title: "t" })?.title).toBe("t");
  });
});

describe("bounds that exist to protect the transcript", () => {
  it("refuses a magnitude that would make the range infinite", () => {
    // Finite per point is not enough: 1e308 minus -1e308 is Infinity, and
    // dividing by it yields NaN in every coordinate.
    expect(chartSpecFrom({ ...ok, series: [{ label: "s", points: [1e308, -1e308] }] })).toBeNull();
    expect(
      chartSpecFrom({ ...ok, series: [{ label: "s", points: [1e15, -1e15] }] }),
    ).not.toBeNull();
  });

  it("refuses a spec large enough to throw while rendering", () => {
    // `Math.max(0, ...values)` blows the call stack on a big enough spread, and
    // the renderer runs inside the history replay -- where a throw abandons the
    // replay and takes every later turn with it, on every reload.
    const labels = Array.from({ length: 30_000 }, (_v, i) => String(i));
    const points = labels.map(() => 1);
    expect(chartSpecFrom({ kind: "bar", labels, series: [{ label: "s", points }] })).toBeNull();
  });
});
