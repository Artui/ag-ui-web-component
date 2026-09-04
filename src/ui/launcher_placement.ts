import { EDGE_MARGIN } from "../constants.js";
import { clampPanel } from "./clamp_panel.js";
import { placeWidget } from "./place_widget.js";

/** A box in viewport coordinates. */
export interface LauncherBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The part of the screen a widget may rest in: a width and height, and the
 * corner they start from.
 *
 * The origin is not always zero. A host can reserve the edges its own chrome
 * occupies, and a panel clamped against a viewport that starts at the top-left
 * of the screen will happily park itself underneath a sticky header -- where it
 * cannot be reached, and where collapsing it only hides it further.
 */
export interface ViewportBox extends Extent {
  readonly left: number;
  readonly top: number;
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
  viewport: ViewportBox,
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

  // The box the panel wants, then the box it can actually have. The launcher
  // is not moved by that clamp -- it is the fixed point of this gesture, so its
  // own inset carries the difference and it can end up outside the host box.
  const wantedLeft =
    corner.x === "left" ? launcher.left : launcher.left + launcher.width - panel.width;
  const wantedTop =
    corner.y === "top" ? launcher.top : launcher.top + launcher.height - panel.height;
  const host = clampPanel(
    {
      left: wantedLeft,
      top: wantedTop,
      right: wantedLeft + panel.width,
      bottom: wantedTop + panel.height,
    },
    viewport,
    margin,
  );

  return { corner, ...placeWidget(host, launcher, corner, viewport) };
}
