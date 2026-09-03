/**
 * A chart in a panel that changes width, measured rather than described.
 *
 * happy-dom computes no layout, so the unit tests can only prove the viewBox
 * follows the width it is handed. What that width *does* to the drawing is a
 * used value from a real layout engine, and it is the whole complaint: an SVG
 * with a fixed viewBox and width 100% is a picture the browser magnifies, so
 * widening the panel scaled a 10px axis label to 25px and turned a chart into
 * half the transcript.
 *
 * The ratio between the two panel widths is what these assert. An absolute
 * font size would be measuring the test browser's default typeface.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { type ChartSpec, renderChart } from "../../src/ui/chart_block.js";

const SPEC: ChartSpec = {
  kind: "bar",
  title: "Requested vs approved",
  labels: ["DR-1", "DR-2", "DR-3", "DR-4"],
  series: [
    { label: "requested", points: [15000, 400, 9200, 6100] },
    { label: "approved", points: [300, 8600, 0, 5400] },
  ],
};

function mount(width: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent");
  el.style.setProperty("--ag-ui-width", width);
  document.body.appendChild(el);
  return el;
}

/**
 * A chart where the component puts one: a child of the answer group, not of a
 * message bubble. That is the layout being measured -- the group stretches its
 * children to the transcript's full width, which is what makes the panel's own
 * width the chart's.
 */
function chartIn(el: AgUiChat): HTMLElement {
  const root = el.shadowRoot as ShadowRoot;
  const messages = root.querySelector(".messages") as HTMLElement;
  messages.replaceChildren();
  const group = document.createElement("div");
  group.className = "answer";
  const block = renderChart(SPEC) as HTMLElement;
  group.appendChild(block);
  messages.appendChild(group);
  return block;
}

/** Two frames: one for the layout, one for the observation it delivers. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** The rendered height of an axis label, in real CSS pixels. */
function labelHeight(block: HTMLElement): number {
  const label = block.querySelector("text") as SVGTextElement;
  return label.getBoundingClientRect().height;
}

function svgBox(block: HTMLElement): DOMRect {
  return (block.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
}

/**
 * How much the browser is magnifying the drawing: rendered width over the
 * viewBox's own width. One means a user unit is a CSS pixel, which is the
 * property the whole change is about -- and it is the one to assert, because
 * the obvious alternative is not stable. Chromium reports a different glyph box
 * for the same 10px text at an integer scale than at a fractional one (13px
 * against 10.05px, hinted against not), so a label measured in one panel and
 * compared against another can differ by 29% with nothing wrong.
 */
function scaleOf(block: HTMLElement): number {
  const svg = block.querySelector("svg") as SVGSVGElement;
  const units = Number((svg.getAttribute("viewBox") ?? "").split(" ")[2]);
  return svg.getBoundingClientRect().width / units;
}

beforeAll(async () => {
  defineAgUiChat();
  // A desktop, because the default test viewport is a phone and the whole
  // question here is what a wide panel does.
  await page.viewport(1280, 800);
});

afterAll(async () => {
  await page.viewport(414, 896);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a chart in a panel that has been widened", () => {
  it("draws one unit per pixel whatever the panel's width", async () => {
    const narrow = chartIn(mount("380px"));
    const wide = chartIn(mount("1100px"));
    await settle();

    // Magnified, the wide one was 2.2 here and every 10px label with it.
    expect(scaleOf(narrow)).toBeCloseTo(1, 1);
    expect(scaleOf(wide)).toBeCloseTo(1, 1);
  });

  it("never renders an axis label at display size", async () => {
    const block = chartIn(mount("1100px"));
    await settle();

    // A loose ceiling on purpose: what matters is that a 10px label is not
    // 29px, which is what it measured in this panel before.
    expect(labelHeight(block)).toBeLessThan(16);
  });

  it("stops at its own width rather than stretching with the panel", async () => {
    const el = mount("1100px");
    const block = chartIn(el);
    await settle();

    // Widening the panel does not resize what is already in it, which is how a
    // message behaves and the reason a chart should not be the exception.
    expect(svgBox(block).width).toBeCloseTo(480, 0);
    const messages = (el.shadowRoot as ShadowRoot).querySelector(".messages") as HTMLElement;
    expect(svgBox(block).width).toBeLessThan(messages.clientWidth / 2);
  });

  it("keeps the frame it has always drawn once it is at its own width", async () => {
    const block = chartIn(mount("1100px"));
    await settle();

    // The 480x220 frame exactly, which is what this renderer drew before it
    // could measure anything at all. Scaled to the panel it was 489px tall.
    expect(svgBox(block).height).toBeCloseTo(220, 0);
  });

  it("lets a host raise the cap without changing the label size", async () => {
    const narrow = chartIn(mount("380px"));
    const el = mount("1100px");
    el.style.setProperty("--ag-ui-chart-max-width", "900px");
    const wide = chartIn(el);
    await settle();

    // The escape hatch is about how much room the chart gets, never about how
    // big its text is -- which is the whole distinction this change is built on.
    expect(svgBox(wide).width).toBeCloseTo(900, 0);
    expect(scaleOf(wide)).toBeCloseTo(1, 1);
    expect(scaleOf(narrow)).toBeCloseTo(1, 1);
  });

  it("redraws when the panel itself is resized", async () => {
    const el = mount("1100px");
    const block = chartIn(el);
    await settle();
    const before = svgBox(block).height;

    el.style.setProperty("--ag-ui-width", "420px");
    await settle();

    // The band's floor is well under the ceiling it was resting on, so a chart
    // that had stopped listening would still report the old height.
    expect(svgBox(block).height).toBeLessThan(before);
  });
});
