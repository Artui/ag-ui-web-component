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

/**
 * Most points a spec may carry, across every series.
 *
 * Not a taste limit. `Math.max(0, ...values)` throws `RangeError` on a large
 * enough spread, and the renderer runs inside the history replay, where a throw
 * abandons the replay and takes every later turn of the transcript with it —
 * permanently, on every reload. A chart nobody can read is a far smaller
 * problem than a conversation that silently loses its tail.
 */
const MAX_POINTS = 20_000;

/**
 * Whether a spec's *labels* are cheap enough to draw.
 *
 * `MAX_POINTS` bounds the data; this bounds the DOM. Every label produces an
 * axis text node whatever the series count, so a spec well inside the point
 * budget can still emit tens of thousands of nodes and block the main thread —
 * again on every reload, since it is in the transcript. Kept separate because
 * the two limits answer different questions and a single number cannot.
 */
const MAX_LABELS = 2_000;

/**
 * Largest magnitude a point may carry.
 *
 * `Number.isFinite` is not enough on its own: two finite extremes still give an
 * infinite *range*, and `(value - min) / Infinity` is `NaN`, which reaches the
 * DOM as `y="NaN"`. Bounding the values bounds the range.
 */
const MAX_MAGNITUDE = 1e15;

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
    if (Math.abs(item) > MAX_MAGNITUDE) {
      return null;
    }
    out.push(item);
  }
  return out;
}

function asStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  // `every` over an index range rather than `Array.prototype.some`, which skips
  // holes: a sparse array passed the old check and drew a chart with blank axis
  // labels, which reads as a rendering bug rather than bad input.
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== "string") {
      return null;
    }
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
  if (series.length * labels.length > MAX_POINTS || labels.length > MAX_LABELS) {
    return null;
  }

  const kind = asKind(raw["kind"]);
  const title = raw["title"];
  // The key is omitted rather than set to `undefined`: `title` is genuinely
  // optional and this tsconfig distinguishes absent from present-and-undefined.
  return typeof title === "string" ? { kind, title, labels, series } : { kind, labels, series };
}
