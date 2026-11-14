import {
  ICON_CHEVRON_DOWN,
  ICON_CHEVRON_LEFT,
  ICON_CHEVRON_RIGHT,
  ICON_CHEVRON_UP,
  ICON_PANEL_CLOSE_LEFT,
  ICON_PANEL_CLOSE_RIGHT,
} from "../../constants.js";

/**
 * The collapse control's mark for the element's `data-collapse-icon`,
 * `placement` and `data-side`, read live by the caller.
 *
 * Unset, or a value it does not name, follows the placement: a docked column
 * (`sidebar`, and the undocumented `side`) hides sideways into its edge, so it
 * takes the panel mark, and everything else -- the corners, `full`,
 * `embedded`, an unknown placement -- keeps the chevron down. The panel mark
 * points into the edge the panel docks to, so it is mirrored for a sidebar on
 * `data-side="left"`, whether it was chosen or defaulted; `side` has no left
 * variant, so it always takes the right one. The chevrons are absolute.
 */
export function collapseGlyph(
  choice: string | null,
  placement: string | null,
  side: string | null,
): string {
  switch (choice) {
    case "chevron-up":
      return ICON_CHEVRON_UP;
    case "chevron-down":
      return ICON_CHEVRON_DOWN;
    case "chevron-left":
      return ICON_CHEVRON_LEFT;
    case "chevron-right":
      return ICON_CHEVRON_RIGHT;
  }
  const docked = placement === "sidebar" || placement === "side";
  if (choice !== "panel-close" && !docked) {
    return ICON_CHEVRON_DOWN;
  }
  return placement === "sidebar" && side === "left"
    ? ICON_PANEL_CLOSE_LEFT
    : ICON_PANEL_CLOSE_RIGHT;
}
