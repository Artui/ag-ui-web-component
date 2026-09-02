import type { Extent, LauncherBox } from "./launcher_placement.js";

/**
 * Keep a launcher fully on screen.
 *
 * Applied to a dragged position and again to a restored one, because the
 * viewport that stored it may since have shrunk. A launcher parked past the
 * edge is unreachable, and it is the only way back to a collapsed
 * conversation -- so this clamps to the viewport itself rather than to the
 * panel's margin, which would refuse the corners users actually want.
 */
export function clampLauncher(
  launcher: LauncherBox,
  viewport: Extent,
): { readonly left: number; readonly top: number } {
  return {
    left: Math.max(0, Math.min(launcher.left, viewport.width - launcher.width)),
    top: Math.max(0, Math.min(launcher.top, viewport.height - launcher.height)),
  };
}
