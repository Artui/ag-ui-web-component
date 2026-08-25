/**
 * The built-in `render_chart` tool: the agent-called route to a chart.
 *
 * A thin thing on purpose. It carries no `handler` of its own beyond reporting
 * back to the model, because everything it does is drawing — which lives in
 * `render`, the half the component replays. A consumer wanting charts gets this
 * without writing a renderer; a consumer wanting something else writes their own
 * tool against the same seam.
 */

import type { ClientTool } from "../tools/client_tool_registry.js";
import { renderChart } from "./chart_block.js";
import { chartSpecFrom } from "./chart_spec_from.js";

/** The name the built-in chart tool registers under. */
export const CHART_TOOL_NAME = "render_chart";

const REJECTED =
  "chart not rendered: expected labels (strings) and series, each with one finite number per label";

/** The built-in chart tool. */
export function createChartTool(): ClientTool {
  return {
    name: CHART_TOOL_NAME,
    description:
      "Show a chart in the conversation. Supply the data and the page draws it. " +
      "Every series must have exactly one point per label.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["bar", "line", "pie", "scatter", "stacked"] },
        title: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        series: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              points: { type: "array", items: { type: "number" } },
            },
            required: ["points"],
          },
        },
      },
      required: ["labels", "series"],
      "x-summary": "Draw a chart",
    },
    // Says what happened and nothing else; the drawing is `render`'s job. Told
    // plainly when the arguments are unusable, because the model can fix that
    // and retry — a silent no-op would leave it believing the chart is on screen.
    handler: (args: Record<string, unknown>) =>
      chartSpecFrom(args) === null ? REJECTED : "chart rendered",
    render: (args: Record<string, unknown>) => {
      const spec = chartSpecFrom(args);
      return spec === null ? null : renderChart(spec);
    },
  };
}
