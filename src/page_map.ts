import type { Context } from "@ag-ui/core";

/**
 * A compact snapshot of the current page's actionable surface (field
 * names/types/labels, button labels+handles — not values). Host-defined shape;
 * kept small because it rides in every `RunAgentInput.context`.
 */
export type PageMap = Record<string, unknown>;

/**
 * Build the per-run context entry for the page map.
 *
 * Returns a single `page_map` context item when auto-injection is on and a
 * provider is set, else nothing. Recomputed each run so it reflects the page
 * the agent is currently looking at.
 */
export function createPageMapContext(
  getPageMap: (() => PageMap) | null,
  autoInject: boolean,
): Context[] {
  if (!autoInject || getPageMap === null) {
    return [];
  }
  return [{ description: "page_map", value: JSON.stringify(getPageMap()) }];
}
