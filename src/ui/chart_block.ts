/**
 * Draw a {@link ChartSpec} as SVG.
 *
 * Every node is built with `createElement`, never parsed from a string, so this
 * path never reaches the markdown sanitiser and cannot be widened by model
 * output. That is the argument for taking a *spec* rather than markup: the model
 * chooses the numbers, this module chooses the DOM. It is why a chart can be
 * shown on a surface that keeps `img` off by default, a model-controlled URL
 * being a zero-click exfiltration channel.
 *
 * Hand-rolled rather than a charting library, and the difference is not
 * marginal: the whole renderer costs single-digit kilobytes where a library
 * costs roughly half this bundle again, in a component distributed over a CDN.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** One named series of numbers. */
export interface ChartSeries {
  readonly label: string;
  readonly points: readonly number[];
}

/** How a spec is drawn. */
export type ChartKind = "bar" | "line" | "pie" | "scatter" | "stacked";

/** A chart, as data. */
export interface ChartSpec {
  readonly kind: ChartKind;
  readonly title?: string;
  readonly labels: readonly string[];
  readonly series: readonly ChartSeries[];
}

const WIDTH = 480;
const HEIGHT = 220;
const PAD = { top: 20, right: 12, bottom: 30, left: 44 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

// Read from the host's own palette rather than a fixed ramp: the component
// themes through custom properties everywhere else, and a chart that ignored
// that would be the one element a host could not restyle.
const SERIES_COLORS: readonly string[] = [
  "var(--ag-ui-chart-1, #4f7cff)",
  "var(--ag-ui-chart-2, #21b573)",
  "var(--ag-ui-chart-3, #e0803c)",
  "var(--ag-ui-chart-4, #b563d8)",
  "var(--ag-ui-chart-5, #d84f6e)",
  "var(--ag-ui-chart-6, #3ba7c4)",
];

/** The colour for series `index`, wrapping when there are more series than colours. */
export function seriesColor(index: number): string {
  // Cast rather than a `??` fallback: the modulo guarantees a hit, so a
  // fallback would be a branch no test could ever reach.
  return SERIES_COLORS[index % SERIES_COLORS.length] as string;
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function text(value: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el("text", {
    "font-size": 10,
    fill: "currentColor",
    "fill-opacity": 0.65,
    ...attrs,
  });
  // `textContent`, so a model-supplied label is text and never markup.
  node.textContent = value;
  return node;
}

/** Column totals, for the stacked kind. */
function stackTotals(spec: ChartSpec): number[] {
  return spec.labels.map((_label, i) =>
    spec.series.reduce((sum, series) => sum + (series.points[i] ?? 0), 0),
  );
}

function extent(spec: ChartSpec): { min: number; max: number } {
  const values =
    spec.kind === "stacked"
      ? stackTotals(spec)
      : spec.series.flatMap((series) => [...series.points]);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  // A flat series would divide by zero when scaling; give it a nominal span so
  // it draws as a flat line rather than vanishing.
  return max === min ? { min, max: max + 1 } : { min, max };
}

function scaleY(value: number, min: number, max: number): number {
  return PAD.top + PLOT_H - ((value - min) / (max - min)) * PLOT_H;
}

function bandCentre(index: number, count: number): number {
  const step = PLOT_W / count;
  return PAD.left + step * index + step / 2;
}

function drawAxes(svg: SVGSVGElement, spec: ChartSpec, min: number, max: number): void {
  for (const value of [min, max]) {
    const y = scaleY(value, min, max);
    svg.appendChild(
      el("line", {
        x1: PAD.left,
        y1: y,
        x2: WIDTH - PAD.right,
        y2: y,
        stroke: "currentColor",
        "stroke-opacity": value === min ? 0.35 : 0.12,
      }),
    );
    svg.appendChild(
      text(String(Math.round(value)), { x: PAD.left - 6, y: y + 4, "text-anchor": "end" }),
    );
  }
  spec.labels.forEach((label, i) => {
    svg.appendChild(
      text(label, {
        x: bandCentre(i, spec.labels.length),
        y: HEIGHT - PAD.bottom + 16,
        "text-anchor": "middle",
      }),
    );
  });
}

function drawBars(svg: SVGSVGElement, spec: ChartSpec, min: number, max: number): void {
  const step = PLOT_W / spec.labels.length;
  const width = (step * 0.7) / spec.series.length;
  const base = scaleY(min, min, max);
  spec.series.forEach((series, s) => {
    series.points.forEach((value, i) => {
      const y = scaleY(value, min, max);
      svg.appendChild(
        el("rect", {
          x: PAD.left + step * i + step * 0.15 + width * s,
          y,
          width,
          height: Math.max(1, base - y),
          fill: seriesColor(s),
          rx: 2,
        }),
      );
    });
  });
}

function drawStacked(svg: SVGSVGElement, spec: ChartSpec, min: number, max: number): void {
  const step = PLOT_W / spec.labels.length;
  const width = step * 0.7;
  // Indexed by the same `i` it was built from, so every read is a hit; cast
  // rather than defaulting, which would add a branch nothing can reach.
  const running = spec.labels.map(() => 0);
  spec.series.forEach((series, s) => {
    series.points.forEach((value, i) => {
      const from = running[i] as number;
      const to = from + value;
      running[i] = to;
      const y = scaleY(to, min, max);
      svg.appendChild(
        el("rect", {
          x: PAD.left + step * i + step * 0.15,
          y,
          width,
          height: Math.max(1, scaleY(from, min, max) - y),
          fill: seriesColor(s),
        }),
      );
    });
  });
}

function drawLines(svg: SVGSVGElement, spec: ChartSpec, min: number, max: number): void {
  spec.series.forEach((series, s) => {
    const points = series.points
      .map((value, i) => `${bandCentre(i, spec.labels.length)},${scaleY(value, min, max)}`)
      .join(" ");
    svg.appendChild(
      el("polyline", {
        points,
        fill: "none",
        stroke: seriesColor(s),
        "stroke-width": 2,
        "stroke-linejoin": "round",
      }),
    );
  });
}

function drawScatter(svg: SVGSVGElement, spec: ChartSpec, min: number, max: number): void {
  spec.series.forEach((series, s) => {
    series.points.forEach((value, i) => {
      svg.appendChild(
        el("circle", {
          cx: bandCentre(i, spec.labels.length),
          cy: scaleY(value, min, max),
          r: 4,
          fill: seriesColor(s),
          "fill-opacity": 0.85,
        }),
      );
    });
  });
}

/**
 * Pie draws the **first** series' points as shares of their own total, one
 * wedge per label — the only kind whose slices are the labels rather than the
 * series, so a second series has nowhere to go and is ignored rather than
 * silently summed into the first.
 */
function drawPie(svg: SVGSVGElement, points: readonly number[]): void {
  const total = points.reduce((sum, value) => sum + value, 0);
  const cx = WIDTH / 2;
  const cy = PAD.top + PLOT_H / 2;
  const r = Math.min(PLOT_W, PLOT_H) / 2;
  if (total === 0) {
    // Every share is zero, so there is no wedge to draw and a full circle would
    // claim one slice owns everything. An outline says "nothing here" honestly.
    svg.appendChild(
      el("circle", { cx, cy, r, fill: "none", stroke: "currentColor", "stroke-opacity": 0.3 }),
    );
    return;
  }
  let angle = -Math.PI / 2;
  points.forEach((value, i) => {
    const sweep = (value / total) * Math.PI * 2;
    const end = angle + sweep;
    // A wedge of the whole circle cannot be drawn as one arc (start and end
    // coincide, so the path collapses); draw it as a plain circle instead.
    if (sweep >= Math.PI * 2) {
      svg.appendChild(el("circle", { cx, cy, r, fill: seriesColor(i) }));
    } else {
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;
      svg.appendChild(
        el("path", {
          d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
          fill: seriesColor(i),
        }),
      );
    }
    angle = end;
  });
}

function buildLegend(entries: readonly string[]): HTMLDivElement | null {
  if (entries.length < 2) {
    return null;
  }
  const row = document.createElement("div");
  row.className = "chart-legend";
  row.setAttribute("part", "chart-legend");
  entries.forEach((label, i) => {
    const item = document.createElement("span");
    item.className = "chart-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "chart-legend-swatch";
    swatch.style.background = seriesColor(i);
    item.append(swatch, document.createTextNode(label));
    row.appendChild(item);
  });
  return row;
}

/**
 * Render one spec as a self-contained block, or `null` when it says nothing.
 *
 * A spec with no labels or no series is not drawn: an empty frame reads as
 * "there is no data" when the truth is "the caller sent nothing", and the two
 * deserve different answers.
 */
export function renderChart(spec: ChartSpec): HTMLDivElement | null {
  if (spec.labels.length === 0 || spec.series.length === 0) {
    return null;
  }
  const block = document.createElement("div");
  block.className = "chart-block";
  block.setAttribute("part", "chart-block");

  if (spec.title !== undefined && spec.title !== "") {
    const heading = document.createElement("div");
    heading.className = "chart-title";
    heading.setAttribute("part", "chart-title");
    heading.textContent = spec.title;
    block.appendChild(heading);
  }

  const svg = el("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, width: "100%", role: "img" });
  svg.setAttribute("aria-label", spec.title ?? `${spec.kind} chart`);

  if (spec.kind === "pie") {
    // `series[0]` is guaranteed by the early return above; a pie's slices are
    // its labels, so a second series has nowhere to go and is ignored rather
    // than silently summed into the first. Negative shares are floored, since a
    // wedge cannot sweep backwards.
    const first = spec.series[0] as ChartSeries;
    drawPie(
      svg,
      first.points.map((value) => Math.max(0, value)),
    );
  } else {
    const { min, max } = extent(spec);
    drawAxes(svg, spec, min, max);
    if (spec.kind === "bar") {
      drawBars(svg, spec, min, max);
    } else if (spec.kind === "stacked") {
      drawStacked(svg, spec, min, max);
    } else if (spec.kind === "line") {
      drawLines(svg, spec, min, max);
    } else {
      drawScatter(svg, spec, min, max);
    }
  }
  block.appendChild(svg);

  // Pie's slices are its labels; every other kind's are its series.
  const legend = buildLegend(
    spec.kind === "pie" ? spec.labels : spec.series.map((series) => series.label),
  );
  if (legend !== null) {
    block.appendChild(legend);
  }
  return block;
}
