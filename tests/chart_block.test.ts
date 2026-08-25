import { describe, expect, it } from "vitest";
import { type ChartSpec, renderChart, seriesColor } from "../src/ui/chart_block.js";

function spec(over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    kind: "bar",
    labels: ["a", "b"],
    series: [{ label: "one", points: [1, 2] }],
    ...over,
  };
}

const svgOf = (block: HTMLDivElement | null) => block?.querySelector("svg");

describe("renderChart", () => {
  it("says nothing rather than drawing an empty frame", () => {
    // An empty frame reads as "there is no data" when the truth is "the caller
    // sent nothing", and the two deserve different answers.
    expect(renderChart(spec({ labels: [] }))).toBeNull();
    expect(renderChart(spec({ series: [] }))).toBeNull();
  });

  it("draws a rect per point for bars", () => {
    const block = renderChart(spec({ series: [{ label: "one", points: [1, 2] }] }));
    expect(svgOf(block)?.querySelectorAll("rect")).toHaveLength(2);
  });

  it("stacks each series on the running total", () => {
    const block = renderChart(
      spec({
        kind: "stacked",
        series: [
          { label: "one", points: [1, 2] },
          { label: "two", points: [3, 4] },
        ],
      }),
    );
    const rects = [...(svgOf(block)?.querySelectorAll("rect") ?? [])];
    expect(rects).toHaveLength(4);
    // The second series starts where the first ended, so its bar sits higher up
    // (a smaller y) than the first in the same column.
    const first = Number(rects[0]?.getAttribute("y"));
    const second = Number(rects[2]?.getAttribute("y"));
    expect(second).toBeLessThan(first);
  });

  it("draws one polyline per series for lines", () => {
    const block = renderChart(
      spec({
        kind: "line",
        series: [
          { label: "one", points: [1, 2] },
          { label: "two", points: [3, 4] },
        ],
      }),
    );
    expect(svgOf(block)?.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("draws a circle per point for scatter", () => {
    const block = renderChart(spec({ kind: "scatter" }));
    expect(svgOf(block)?.querySelectorAll("circle")).toHaveLength(2);
  });

  it("draws a wedge per label for pie", () => {
    const block = renderChart(
      spec({ kind: "pie", labels: ["a", "b", "c"], series: [{ label: "x", points: [1, 1, 2] }] }),
    );
    expect(svgOf(block)?.querySelectorAll("path")).toHaveLength(3);
  });

  it("draws a whole-circle pie as a circle, not a collapsed arc", () => {
    // A wedge of the full circle has coincident start and end, so an arc path
    // collapses to nothing.
    const block = renderChart(
      spec({ kind: "pie", labels: ["only"], series: [{ label: "x", points: [5] }] }),
    );
    expect(svgOf(block)?.querySelectorAll("circle")).toHaveLength(1);
    expect(svgOf(block)?.querySelectorAll("path")).toHaveLength(0);
  });

  it("outlines an all-zero pie rather than claiming one slice owns everything", () => {
    const block = renderChart(
      spec({ kind: "pie", labels: ["a", "b"], series: [{ label: "x", points: [0, 0] }] }),
    );
    const circle = svgOf(block)?.querySelector("circle");
    expect(circle?.getAttribute("fill")).toBe("none");
    expect(svgOf(block)?.querySelectorAll("path")).toHaveLength(0);
  });

  it("negative pie shares are floored at zero rather than inverting a wedge", () => {
    const block = renderChart(
      spec({ kind: "pie", labels: ["a", "b"], series: [{ label: "x", points: [-5, 5] }] }),
    );
    // One share survives, and it is the whole circle.
    expect(svgOf(block)?.querySelectorAll("circle")).toHaveLength(1);
  });

  it("gives an all-zero series a nominal span rather than dividing by zero", () => {
    // min and max both land on zero, so the scale has no extent to divide by.
    const block = renderChart(spec({ kind: "line", series: [{ label: "z", points: [0, 0] }] }));
    const points = svgOf(block)?.querySelector("polyline")?.getAttribute("points") ?? "";
    for (const pair of points.split(" ")) {
      expect(Number.isFinite(Number(pair.split(",")[1]))).toBe(true);
    }
  });

  it("draws a flat series as a flat line rather than dividing by zero", () => {
    const block = renderChart(spec({ kind: "line", series: [{ label: "flat", points: [3, 3] }] }));
    const points = svgOf(block)?.querySelector("polyline")?.getAttribute("points") ?? "";
    const ys = points.split(" ").map((pair) => Number(pair.split(",")[1]));
    expect(ys[0]).toBe(ys[1]);
    expect(Number.isFinite(ys[0])).toBe(true);
  });

  it("shows a legend only when there is more than one thing to name", () => {
    expect(renderChart(spec())?.querySelector(".chart-legend")).toBeNull();
    const two = renderChart(
      spec({
        series: [
          { label: "one", points: [1, 2] },
          { label: "two", points: [3, 4] },
        ],
      }),
    );
    expect(two?.querySelector(".chart-legend")?.textContent).toContain("two");
  });

  it("names a pie's legend by label, since its slices are the labels", () => {
    const block = renderChart(
      spec({ kind: "pie", labels: ["north", "south"], series: [{ label: "x", points: [1, 1] }] }),
    );
    expect(block?.querySelector(".chart-legend")?.textContent).toContain("north");
  });

  it("renders a title as text, never as markup", () => {
    const block = renderChart(spec({ title: "<img src=x onerror=alert(1)>" }));
    const heading = block?.querySelector(".chart-title");
    expect(heading?.querySelector("img")).toBeNull();
    expect(heading?.textContent).toContain("<img");
  });

  it("omits the title element when there is no title", () => {
    expect(renderChart(spec())?.querySelector(".chart-title")).toBeNull();
    expect(renderChart(spec({ title: "" }))?.querySelector(".chart-title")).toBeNull();
  });

  it("labels the figure for a screen reader", () => {
    expect(svgOf(renderChart(spec({ title: "Signups" })))?.getAttribute("aria-label")).toBe(
      "Signups",
    );
    expect(svgOf(renderChart(spec({ kind: "line" })))?.getAttribute("aria-label")).toBe(
      "line chart",
    );
  });

  it("wraps the palette rather than running out of colours", () => {
    expect(seriesColor(0)).toBe(seriesColor(6));
  });

  it("treats a short series as zero in a stack rather than dropping the column", () => {
    const block = renderChart(
      spec({
        kind: "stacked",
        labels: ["a", "b"],
        series: [{ label: "one", points: [1] } as never],
      }),
    );
    expect(svgOf(block)?.querySelectorAll("rect").length).toBeGreaterThan(0);
  });
});

describe("pie arc geometry", () => {
  it("flags the large-arc sweep for a wedge over half the circle", () => {
    // Under 180 degrees and over it take different arc flags, and an arc drawn
    // with the wrong one bulges the short way round.
    const block = renderChart({
      kind: "pie",
      labels: ["big", "small"],
      series: [{ label: "x", points: [3, 1] }],
    });
    const flags = [...(block?.querySelectorAll("path") ?? [])].map((path) =>
      // `M cx cy L x1 y1 A r r 0 <large> <sweep> x2 y2 Z` — the sweep flag is
      // always 1, so the large-arc flag sits one token further back.
      (path.getAttribute("d") ?? "").split(" ").at(-5),
    );
    expect(flags).toContain("1");
    expect(flags).toContain("0");
  });
});

describe("geometry that cannot be trusted to the caller", () => {
  it("keeps a stacked chart on the canvas when a series goes negative", () => {
    // The extent has to cover every running subtotal, not just the column
    // totals: with mixed signs the running value swings wider than the total it
    // ends on, and scaling to the total alone puts segments off the canvas.
    const block = renderChart({
      kind: "stacked",
      labels: ["a"],
      series: [
        { label: "up", points: [10] },
        { label: "down", points: [-8] },
      ],
    });
    for (const rect of block?.querySelectorAll("rect") ?? []) {
      const y = Number(rect.getAttribute("y"));
      const height = Number(rect.getAttribute("height"));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + height).toBeLessThanOrEqual(220);
    }
  });

  it("puts no NaN into an attribute for a wide but finite range", () => {
    // Two finite extremes still give an infinite range, and value/Infinity is
    // NaN -- which reaches the DOM as y="NaN" rather than failing loudly.
    const block = renderChart({
      kind: "line",
      labels: ["a", "b"],
      series: [{ label: "s", points: [1e15, -1e15] }],
    });
    const svg = block?.querySelector("svg");
    for (const node of svg?.querySelectorAll("*") ?? []) {
      for (const attr of node.attributes) {
        expect(attr.value).not.toContain("NaN");
      }
    }
  });
});

describe("renderChart is exported, so it must survive input the validator would refuse", () => {
  it("puts no NaN in a stacked chart carrying more points than labels", () => {
    const block = renderChart({
      kind: "stacked",
      labels: ["a"],
      series: [{ label: "long", points: [1, 2, 3] }],
    });
    for (const node of block?.querySelectorAll("*") ?? []) {
      for (const attr of node.attributes) {
        expect(attr.value).not.toContain("NaN");
      }
    }
  });
});
