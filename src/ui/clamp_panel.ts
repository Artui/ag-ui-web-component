import { EDGE_MARGIN } from "../constants.js";
import type { Extent } from "./launcher_placement.js";
import type { PanelRect } from "./resize_handle.js";

/**
 * Hold a panel inside the viewport, keeping its size.
 *
 * The near edge is clamped and the far edge follows, so a panel too large for
 * the viewport is held against the near margin and left to the max-width and
 * max-height rules rather than centred by force. The lower bound wins a
 * contradiction for the same reason: `Math.min` first would put an oversized
 * panel off the left edge instead of against the margin it can still honour.
 */
export function clampPanel(
  host: PanelRect,
  viewport: Extent,
  margin: number = EDGE_MARGIN,
): PanelRect {
  const width = host.right - host.left;
  const height = host.bottom - host.top;
  const left = Math.max(margin, Math.min(host.left, viewport.width - margin - width));
  const top = Math.max(margin, Math.min(host.top, viewport.height - margin - height));
  return { left, top, right: left + width, bottom: top + height };
}
