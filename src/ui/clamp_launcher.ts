import { SCREEN_EDGE_MARGIN } from "../constants.js";
import type { LauncherBox, ViewportBox } from "./launcher_placement.js";

/**
 * Keep a launcher fully on screen, and a little clear of the edge.
 *
 * Applied to a dragged position and again to a restored one, because the
 * viewport that stored it may since have shrunk. A launcher parked past the
 * edge is unreachable, and it is the only way back to a collapsed
 * conversation.
 *
 * Not the panel's 24px gutter, which was rejected here on purpose: a launcher
 * held that far in refuses the corners people actually drag it to. But not
 * zero either -- the bubble is a circle with a drop shadow, and one flush
 * against the boundary has its shadow cut and its curve running into the edge,
 * which reads as clipped whether or not a pixel is actually missing.
 */
export function clampLauncher(
  launcher: LauncherBox,
  viewport: ViewportBox,
  margin: number = SCREEN_EDGE_MARGIN,
): { readonly left: number; readonly top: number } {
  // The margin is given up rather than enforced where it does not fit: a
  // viewport narrower than the bubble and its two margins would otherwise
  // produce a lower bound above the upper one and pin it to the wrong edge.
  const room = Math.min(margin, Math.max(0, (viewport.width - launcher.width) / 2));
  const vertical = Math.min(margin, Math.max(0, (viewport.height - launcher.height) / 2));
  return {
    left: Math.max(
      viewport.left + room,
      Math.min(launcher.left, viewport.left + viewport.width - launcher.width - room),
    ),
    top: Math.max(
      viewport.top + vertical,
      Math.min(launcher.top, viewport.top + viewport.height - launcher.height - vertical),
    ),
  };
}
