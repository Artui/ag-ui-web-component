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
  it("keeps its labels the same size whatever the panel's width", async () => {
    const narrow = chartIn(mount("380px"));
    const wide = chartIn(mount("1100px"));
    await settle();

    const ratio = labelHeight(wide) / labelHeight(narrow);
    // Text drawn into a scaled viewBox would be near 3x here, which is what a
    // 25px axis label in a wide panel was.
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it("fills the width it is given rather than leaving it empty", async () => {
    const el = mount("1100px");
    const block = chartIn(el);
    await settle();

    // The point of redrawing rather than capping: the chart still uses the
    // panel, it just stops magnifying itself to do it.
    expect(svgBox(block).width).toBeGreaterThan(900);
  });

  it("stays inside its height band instead of eating the transcript", async () => {
    const block = chartIn(mount("1100px"));
    await settle();

    // Scaled, a 480x220 frame at this width is 500px tall.
    expect(svgBox(block).height).toBeLessThanOrEqual(322);
    expect(svgBox(block).height).toBeGreaterThan(260);
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
