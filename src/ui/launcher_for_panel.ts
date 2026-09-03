import { clampLauncher } from "./clamp_launcher.js";
import type { Extent, LauncherBox } from "./launcher_placement.js";
import { launcherPlacement } from "./launcher_placement.js";
import type { PanelRect } from "./resize_handle.js";

/**
 * Where the launcher belongs for a panel placed at `panel`.
 *
 * The launcher is the position this component persists and re-derives its
 * layout from -- {@link launcherPlacement} reads it and decides where the panel
 * goes. So a gesture that moves the *panel* has to answer the inverse question,
 * or the next expand would re-derive the old position from a launcher still
 * standing where the panel used to be and undo the move.
 *
 * The answer has to be a fixed point: feed the returned position back through
 * {@link launcherPlacement} and it must reproduce exactly the panel box that
 * was asked for. That holds when the launcher sits at the corner the placement
 * pins, and only then -- put it on the panel's right corner while the placement
 * pins the left and the panel jumps by its own width.
 *
 * One probe finds it. Ask the placement where it would pin a launcher at the
 * panel's top-left; whichever corner comes back is the one that is consistent,
 * because the placement's rule per axis is "is the launcher's near edge in the
 * near half" -- true for the panel's near edge means the near corner works, and
 * false means the panel's far edge is further out still, so the far corner
 * does. Deriving it from the rule instead would be a second copy of the rule.
 *
 * The result is then held on screen the way a dragged launcher is. A panel
 * pushed past the edge is clamped back to its margin by the placement, but the
 * launcher position is the half that persists -- so left unclamped it would be
 * remembered off-screen, and collapsing would leave the only way back to the
 * conversation hanging over the edge.
 */
export function launcherForPanel(
  panel: PanelRect,
  launcher: Extent,
  viewport: Extent,
): { readonly left: number; readonly top: number } {
  const size: Extent = { width: panel.right - panel.left, height: panel.bottom - panel.top };
  const probe: LauncherBox = { left: panel.left, top: panel.top, ...launcher };
  const { corner } = launcherPlacement(probe, size, viewport);
  return clampLauncher(
    {
      left: corner.x === "left" ? panel.left : panel.right - launcher.width,
      top: corner.y === "top" ? panel.top : panel.bottom - launcher.height,
      ...launcher,
    },
    viewport,
  );
}
