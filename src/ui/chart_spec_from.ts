/**
 * Narrow untrusted input into a {@link ChartSpec}.
 *
 * Both arrival routes are untrusted in the same way — a model writes one, a
 * server the other — so neither is taken on shape. Kept out of the renderer
 * because the renderer's job is drawing, and a value that reaches it has
 * already been vouched for.
 */

import type { ChartKind, ChartSpec } from "./chart_block.js";

const KINDS: readonly ChartKind[] = ["bar", "line", "pie", "scatter", "stacked"];

function asKind(value: unknown): ChartKind {
  // Anything unrecognised falls back to `bar` rather than refusing the spec: an
  // unknown kind is a caller reaching for a chart type we do not draw, and the
  // data is still worth showing.
  return KINDS.includes(value as ChartKind) ? (value as ChartKind) : "bar";
}

function asNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: number[] = [];
  for (const item of value) {
    // `Number.isFinite` rather than `typeof === "number"`: JSON encoders render
    // NaN and Infinity as nulls or strings depending on the encoder, and either
    // would scale into a chart with no visible extent.
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return null;
    }
    out.push(item);
  }
  return out;
}

function asStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value as string[];
}

/** A well-formed spec, or `null` for anything that cannot be drawn honestly. */
export function chartSpecFrom(value: unknown): ChartSpec | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const labels = asStrings(raw["labels"]);
  if (labels === null || !Array.isArray(raw["series"])) {
    return null;
  }

  const series: { label: string; points: number[] }[] = [];
  for (const entry of raw["series"]) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const item = entry as Record<string, unknown>;
    const points = asNumbers(item["points"]);
    // A series with a different number of points than there are labels would
    // silently misalign every value after the gap. A chart that is subtly wrong
    // still reads as authoritative, which is worse than no chart at all.
    if (points === null || points.length !== labels.length) {
      return null;
    }
    series.push({ label: typeof item["label"] === "string" ? item["label"] : "", points });
  }
  if (series.length === 0) {
    return null;
  }

  const kind = asKind(raw["kind"]);
  const title = raw["title"];
  // The key is omitted rather than set to `undefined`: `title` is genuinely
  // optional and this tsconfig distinguishes absent from present-and-undefined.
  return typeof title === "string" ? { kind, title, labels, series } : { kind, labels, series };
}
