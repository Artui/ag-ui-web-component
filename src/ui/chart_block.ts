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
 *
 * **The drawing is sized in CSS pixels, not scaled to them.** An SVG with a
 * fixed viewBox and `width: 100%` is a picture the browser magnifies: widen the
 * panel and every stroke, every label and the whole frame grow with it, so a
 * 10px axis label renders at 25px in a 1200px panel and the chart takes half
 * the transcript. So the geometry is computed for the width the block actually
 * has, one user unit to one CSS pixel, and recomputed when that width changes.
 * Text then stays 10px at every panel size and the height stays inside a band.
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

/** The frame a chart is drawn into, in CSS pixels. */
interface Geometry {
  readonly width: number;
  readonly height: number;
  /** The plotting area inside the padding. */
  readonly plotW: number;
  readonly plotH: number;
}

const PAD = { top: 20, right: 12, bottom: 30, left: 44 };

/**
 * The width drawn before the block has been measured -- while it is still
 * detached, and in a caller that never puts it in a document at all. It is the
 * width this renderer drew at unconditionally before it could measure, so a
 * chart that is never measured looks exactly as it always did.
 */
const DEFAULT_WIDTH = 480;

/**
 * The narrowest frame worth computing. Below this the SVG scales down as it
 * always did, which is the right answer at the bottom end: a 200px chart with
 * 10px labels has no room for the labels either way, and shrinking them keeps
 * the shape readable.
 */
const MIN_WIDTH = 220;

/**
 * How tall a chart is for its width, and the band that holds. The ratio is the
 * old fixed 480x220 frame, so the default width draws precisely what it drew
 * before; the band is what stops a wide panel from turning a chart into a
 * banner or a narrow one into a strip.
 */
const HEIGHT_RATIO = 220 / 480;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 320;

/**
 * The step a measured width is rounded to before it is redrawn.
 *
 * The SVG keeps `width="100%"`, so it fills its block exactly whatever the
 * viewBox says; rounding the viewBox to 8px therefore costs at most a 3%
 * scale at the narrow end and nothing anyone can see, while cutting the
 * redraws during a panel drag from one per pixel to one per eight.
 */
const WIDTH_STEP = 8;

/** A rough advance width per character for the 10px axis font. */
const AXIS_CHAR_WIDTH = 5.6;

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

/** The frame for a block of this width. */
function geometryFor(width: number): Geometry {
  const w = Math.max(MIN_WIDTH, width);
  const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(w * HEIGHT_RATIO)));
  return {
    width: w,
    height: h,
    plotW: w - PAD.left - PAD.right,
    plotH: h - PAD.top - PAD.bottom,
  };
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

/** Every running subtotal a stack passes through, column by column. */
function stackRunning(spec: ChartSpec): number[] {
  const seen: number[] = [];
  spec.labels.forEach((_label, i) => {
    let running = 0;
    for (const series of spec.series) {
      running += series.points[i] ?? 0;
      seen.push(running);
    }
  });
  return seen;
}

function extent(spec: ChartSpec): { min: number; max: number } {
  // A stack's extent has to cover every *running subtotal*, not just the column
  // totals: with mixed signs the running value swings wider than the total it
  // ends on, and scaling to the total alone puts segments far off the canvas.
  const values =
    spec.kind === "stacked"
      ? stackRunning(spec)
      : spec.series.flatMap((series) => [...series.points]);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  // A flat series would divide by zero when scaling; give it a nominal span so
  // it draws as a flat line rather than vanishing.
  return max === min ? { min, max: max + 1 } : { min, max };
}

function scaleY(value: number, min: number, max: number, geo: Geometry): number {
  return PAD.top + geo.plotH - ((value - min) / (max - min)) * geo.plotH;
}

function bandCentre(index: number, count: number, geo: Geometry): number {
  const step = geo.plotW / count;
  return PAD.left + step * index + step / 2;
}

/**
 * Draw every nth label, for the smallest n whose labels have room.
 *
 * Axis text is a fixed 10px now rather than something that shrank with the
 * frame, so at the narrow end the labels are the first thing to collide -- and
 * a smear of overlapping words says less than half as many words with space
 * around them. The character estimate only has to be good enough to pick a
 * step; measuring text properly would mean laying it out first.
 */
function labelStride(labels: readonly string[], geo: Geometry): number {
  const band = geo.plotW / labels.length;
  const widest = Math.max(...labels.map((label) => label.length)) * AXIS_CHAR_WIDTH;
  return Math.max(1, Math.ceil(widest / band));
}

function drawAxes(
  svg: SVGSVGElement,
  spec: ChartSpec,
  geo: Geometry,
  min: number,
  max: number,
): void {
  for (const value of [min, max]) {
    const y = scaleY(value, min, max, geo);
    svg.appendChild(
      el("line", {
        x1: PAD.left,
        y1: y,
        x2: geo.width - PAD.right,
        y2: y,
        stroke: "currentColor",
        "stroke-opacity": value === min ? 0.35 : 0.12,
      }),
    );
    svg.appendChild(
      text(String(Math.round(value)), { x: PAD.left - 6, y: y + 4, "text-anchor": "end" }),
    );
  }
  const stride = labelStride(spec.labels, geo);
  spec.labels.forEach((label, i) => {
    if (i % stride !== 0) {
      return;
    }
    svg.appendChild(
      text(label, {
        x: bandCentre(i, spec.labels.length, geo),
        y: geo.height - PAD.bottom + 16,
        "text-anchor": "middle",
      }),
    );
  });
}

function drawBars(
  svg: SVGSVGElement,
  spec: ChartSpec,
  geo: Geometry,
  min: number,
  max: number,
): void {
  const step = geo.plotW / spec.labels.length;
  const width = (step * 0.7) / spec.series.length;
  const base = scaleY(min, min, max, geo);
  spec.series.forEach((series, s) => {
    series.points.forEach((value, i) => {
      const y = scaleY(value, min, max, geo);
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

function drawStacked(
  svg: SVGSVGElement,
  spec: ChartSpec,
  geo: Geometry,
  min: number,
  max: number,
): void {
  const step = geo.plotW / spec.labels.length;
  const width = step * 0.7;
  // Indexed by the same `i` it was built from, so every read is a hit; cast
  // rather than defaulting, which would add a branch nothing can reach.
  const running = spec.labels.map(() => 0);
  spec.series.forEach((series, s) => {
    series.points.forEach((value, i) => {
      // `?? 0` rather than a cast: `renderChart` is exported, so a caller can
      // hand it a series carrying more points than there are labels, which
      // `chartSpecFrom` would have refused. The cast that used to be here
      // claimed that could not happen and wrote `y="NaN"` into the DOM when it
      // did.
      const from = running[i] ?? 0;
      const to = from + value;
      running[i] = to;
      const y = scaleY(to, min, max, geo);
      svg.appendChild(
        el("rect", {
          x: PAD.left + step * i + step * 0.15,
          y,
          width,
          height: Math.max(1, scaleY(from, min, max, geo) - y),
          fill: seriesColor(s),
        }),
      );
    });
  });
}

function drawLines(
  svg: SVGSVGElement,
  spec: ChartSpec,
  geo: Geometry,
  min: number,
  max: number,
): void {
  spec.series.forEach((series, s) => {
    const points = series.points
      .map(
        (value, i) => `${bandCentre(i, spec.labels.length, geo)},${scaleY(value, min, max, geo)}`,
      )
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

function drawScatter(
  svg: SVGSVGElement,
  spec: ChartSpec,
  geo: Geometry,
  min: number,
  max: number,
): void {
  spec.series.forEach((series, s) => {
    series.points.forEach((value, i) => {
      svg.appendChild(
        el("circle", {
          cx: bandCentre(i, spec.labels.length, geo),
          cy: scaleY(value, min, max, geo),
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
 * wedge per label -- the only kind whose slices are the labels rather than the
 * series, so a second series has nowhere to go and is ignored rather than
 * silently summed into the first.
 */
function drawPie(svg: SVGSVGElement, points: readonly number[], geo: Geometry): void {
  const total = points.reduce((sum, value) => sum + value, 0);
  const cx = geo.width / 2;
  const cy = PAD.top + geo.plotH / 2;
  const r = Math.min(geo.plotW, geo.plotH) / 2;
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

/** The whole drawing for one spec at one width. */
function drawSvg(spec: ChartSpec, geo: Geometry): SVGSVGElement {
  const svg = el("svg", {
    viewBox: `0 0 ${geo.width} ${geo.height}`,
    width: "100%",
    role: "img",
  });
  svg.setAttribute("aria-label", spec.title ?? `${spec.kind} chart`);

  if (spec.kind === "pie") {
    // `series[0]` is guaranteed by renderChart's early return; a pie's slices
    // are its labels, so a second series has nowhere to go and is ignored
    // rather than silently summed into the first. Negative shares are floored,
    // since a wedge cannot sweep backwards.
    const first = spec.series[0] as ChartSeries;
    drawPie(
      svg,
      first.points.map((value) => Math.max(0, value)),
      geo,
    );
    return svg;
  }
  const { min, max } = extent(spec);
  drawAxes(svg, spec, geo, min, max);
  if (spec.kind === "bar") {
    drawBars(svg, spec, geo, min, max);
  } else if (spec.kind === "stacked") {
    drawStacked(svg, spec, geo, min, max);
  } else if (spec.kind === "line") {
    drawLines(svg, spec, geo, min, max);
  } else {
    drawScatter(svg, spec, geo, min, max);
  }
  return svg;
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
 * Redraw `block`'s chart whenever the width it has to fill changes.
 *
 * Nothing disconnects this, and nothing needs to: the observer is referenced
 * only by the closure that made it, and an active observer holds its target
 * rather than the other way round -- so a chart removed from the transcript
 * takes its observer with it.
 *
 * The block's own width is read rather than the entry's box, because that is
 * the number the redraw has to match and the entry carries several.
 */
function fitToWidth(block: HTMLElement, redraw: (width: number) => void): void {
  const observer = new ResizeObserver(() => {
    redraw(Math.round(block.clientWidth / WIDTH_STEP) * WIDTH_STEP);
  });
  observer.observe(block);
}

/**
 * Render one spec as a self-contained block, or `null` when it says nothing.
 *
 * A spec with no labels or no series is not drawn: an empty frame reads as
 * "there is no data" when the truth is "the caller sent nothing", and the two
 * deserve different answers.
 *
 * The block returned is already drawn at {@link DEFAULT_WIDTH} and redraws
 * itself once it is in a document and knows how wide it really is, so a caller
 * appends it exactly as before and never has to say how big it should be.
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

  let width = DEFAULT_WIDTH;
  let svg = drawSvg(spec, geometryFor(width));
  block.appendChild(svg);

  // Pie's slices are its labels; every other kind's are its series.
  const legend = buildLegend(
    spec.kind === "pie" ? spec.labels : spec.series.map((series) => series.label),
  );
  if (legend !== null) {
    block.appendChild(legend);
  }

  fitToWidth(block, (measured) => {
    if (measured === width) {
      return;
    }
    width = measured;
    const next = drawSvg(spec, geometryFor(width));
    svg.replaceWith(next);
    svg = next;
  });
  return block;
}
