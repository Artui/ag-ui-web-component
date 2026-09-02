/** A box in viewport coordinates. */
export interface LauncherBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A width/height pair, in CSS pixels. */
export interface Extent {
  readonly width: number;
  readonly height: number;
}

/**
 * The corner the panel is pinned by, and therefore grows away from: pinned
 * `top-left` opens down and to the right. It is also the corner the resize grip
 * must stay off, which is why the element stamps it rather than measuring it
 * once the launcher has been moved.
 */
export interface ExpandCorner {
  readonly x: "left" | "right";
  readonly y: "top" | "bottom";
}

/** Where to put the host box, and where the launcher sits inside it. */
export interface LauncherPlacement {
  /** The corner the panel opens away from. */
  readonly corner: ExpandCorner;
  /** An `inset` shorthand for the host box. */
  readonly hostInset: string;
  /** An `inset` shorthand for the launcher, relative to the host box. */
  readonly launcherInset: string;
}

/**
 * The gutter a panel keeps from the viewport edge, matching the default
 * `--ag-ui-inset` so an undragged widget resolves to exactly the placement it
 * already had. Changing this moves every clamped panel.
 */
const EDGE_MARGIN = 24;

/**
 * Decide where a panel should open from a launcher the user has dragged.
 *
 * The launcher is the fixed point: wherever it was dropped is where it stays,
 * collapsed and expanded alike. Everything here decides what happens *around*
 * it.
 *
 * Two steps, and they are separate on purpose:
 *
 * 1. **Pick the corner with the most clear space.** For each axis, compare the
 *    room a panel would have on either side of the launcher and pin the side
 *    with more of it. Pinning `left` means the panel runs rightward from the
 *    launcher's left edge, so the room that decides it is the distance from
 *    that edge to the far side of the viewport -- not "which half of the screen
 *    is the launcher in", which gives a different and worse answer for a
 *    launcher near the middle.
 *
 * 2. **Clamp the panel into the viewport, then put the launcher back.** A
 *    launcher near the centre of a short viewport has a panel taller than
 *    either side, so the winning corner still overflows. Clamping moves the
 *    host box -- and the launcher is positioned inside that box, so it would be
 *    dragged along with it. The launcher's own inset therefore carries the
 *    difference: zero in the ordinary case, and exactly the distance the clamp
 *    moved the box in the case that needs it. That the launcher may end up
 *    outside its own host box is fine; nothing clips it, and it keeps its own
 *    pointer events.
 *
 * Both insets are expressed from the *same* corner, which is what stops a
 * later panel resize from dragging the launcher: the pinned corner is the one
 * edge a resize cannot move.
 */
export function launcherPlacement(
  launcher: LauncherBox,
  panel: Extent,
  viewport: Extent,
  margin: number = EDGE_MARGIN,
): LauncherPlacement {
  // Room for a panel pinned to each side of the launcher. A tie goes to the
  // first branch, so the result is deterministic for a centred launcher.
  const roomRunningRight = viewport.width - launcher.left;
  const roomRunningLeft = launcher.left + launcher.width;
  const roomRunningDown = viewport.height - launcher.top;
  const roomRunningUp = launcher.top + launcher.height;
  const corner: ExpandCorner = {
    x: roomRunningRight >= roomRunningLeft ? "left" : "right",
    y: roomRunningDown >= roomRunningUp ? "top" : "bottom",
  };

  // The box the panel wants, then the box it can actually have. Clamping the
  // near edge covers the far edge too: the panel is a fixed size here, and a
  // panel too large for the viewport is held against the near margin and left
  // to the max-width and max-height rules rather than centred by force.
  const wantedLeft =
    corner.x === "left" ? launcher.left : launcher.left + launcher.width - panel.width;
  const wantedTop =
    corner.y === "top" ? launcher.top : launcher.top + launcher.height - panel.height;
  const hostLeft = clamp(wantedLeft, margin, viewport.width - margin - panel.width);
  const hostTop = clamp(wantedTop, margin, viewport.height - margin - panel.height);

  const hostRight = hostLeft + panel.width;
  const hostBottom = hostTop + panel.height;

  return {
    corner,
    hostInset: inset({
      top: corner.y === "top" ? hostTop : null,
      right: corner.x === "right" ? viewport.width - hostRight : null,
      bottom: corner.y === "bottom" ? viewport.height - hostBottom : null,
      left: corner.x === "left" ? hostLeft : null,
    }),
    // Measured from the host box's pinned corner to the launcher's matching
    // corner, so the launcher lands exactly where it was dropped.
    launcherInset: inset({
      top: corner.y === "top" ? launcher.top - hostTop : null,
      right: corner.x === "right" ? hostRight - (launcher.left + launcher.width) : null,
      bottom: corner.y === "bottom" ? hostBottom - (launcher.top + launcher.height) : null,
      left: corner.x === "left" ? launcher.left - hostLeft : null,
    }),
  };
}

/**
 * Constrain a value, with the lower bound winning a contradiction. `Math.min`
 * first would put a panel wider than the viewport off the left edge instead of
 * against the near margin.
 */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
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
