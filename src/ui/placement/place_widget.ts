import type { ExpandCorner, Extent, LauncherBox } from "./launcher_placement.js";
import type { PanelRect } from "./resize_handle.js";

/** Where to put the host box, and where the launcher sits inside it. */
export interface WidgetInsets {
  /** An `inset` shorthand for the host box. */
  readonly hostInset: string;
  /** An `inset` shorthand for the launcher, relative to the host box. */
  readonly launcherInset: string;
}

/**
 * Express a panel and its launcher, both already positioned, as the two
 * `inset` shorthands the element writes.
 *
 * Both are measured from the **same** corner, which is what stops a later
 * resize from dragging the launcher: the pinned corner is the one edge a
 * resize cannot move. Which corner that is says nothing about where either box
 * ends up -- the positions are absolute and arrive decided -- so re-picking it
 * moves nothing, and the launcher may sit outside its own host box. Nothing
 * clips it there, and that is what lets a launcher be flush to a screen corner
 * while the panel it opens keeps its margin.
 *
 * `screen` is the **whole** viewport, not the part a host has left free. These
 * are CSS `inset` values on a fixed element, and the browser measures those
 * from the real edges -- so a `bottom` expressed against a box inset from the
 * top comes out short by exactly that inset. It only shows when the corner
 * flips mid-drag, because that is when the same point stops being expressed
 * from `top` and starts being expressed from `bottom`: the widget then leaps by
 * the reserved edge, which is a jump the gesture cannot explain.
 */
export function placeWidget(
  host: PanelRect,
  launcher: LauncherBox,
  corner: ExpandCorner,
  screen: Extent,
): WidgetInsets {
  return {
    hostInset: inset({
      top: corner.y === "top" ? host.top : null,
      right: corner.x === "right" ? screen.width - host.right : null,
      bottom: corner.y === "bottom" ? screen.height - host.bottom : null,
      left: corner.x === "left" ? host.left : null,
    }),
    launcherInset: inset({
      top: corner.y === "top" ? launcher.top - host.top : null,
      right: corner.x === "right" ? host.right - (launcher.left + launcher.width) : null,
      bottom: corner.y === "bottom" ? host.bottom - (launcher.top + launcher.height) : null,
      left: corner.x === "left" ? launcher.left - host.left : null,
    }),
  };
}

/** An `inset` shorthand; a null side is `auto`, so the opposite one pins it. */
function inset(sides: {
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
}): string {
  const side = (value: number | null): string =>
    value === null ? "auto" : `${Math.round(value)}px`;
  return `${side(sides.top)} ${side(sides.right)} ${side(sides.bottom)} ${side(sides.left)}`;
}
