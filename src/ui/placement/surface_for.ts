import type { ResizeAxis } from "./resize_handle.js";

/**
 * What a collapsed panel shrinks to.
 *
 * - `launcher` -- the round button in a corner.
 * - `rail` -- the slim full-height edge the sidebar docks against; the same
 *   launcher element, shaped by the stylesheet.
 * - `header` -- the in-flow collapse: the body hides and the header bar stays
 *   in the host's layout, so there is no launcher at all.
 * - `null` -- no collapsed state. `page` is a dedicated route rather than a
 *   panel on someone else's page, so there is no "away" for it to go to:
 *   collapsing it left a strip of application chrome fixed over a route with
 *   no owner, and it hides the launcher, so the usual way back did not exist.
 *   The header drops its collapse control here, but a control removed from
 *   the UI is not a state removed from the model: the property, the attribute
 *   and a value restored from storage all still reach it, so every one of
 *   those paths asks this record; the stylesheet covers the one path that
 *   never does, an attribute written straight onto the element.
 */
export type CollapseTarget = "launcher" | "rail" | "header" | null;

/**
 * Everything the script needs to know about one display surface, in one
 * record, so a placement's behaviour is read in one place rather than
 * assembled from a table per question.
 *
 * The stylesheet still carries each surface's look (one module per placement
 * under this directory); this is the part of a surface that code decides.
 */
export interface Surface {
  /** What collapsing shrinks the panel to; `null` when it cannot collapse. */
  readonly collapseTo: CollapseTarget;
  /**
   * Whether a gesture may move the launcher. The rest have nowhere to put it:
   * the rail is a docked edge, `header` and `null` have no launcher, and a
   * full-bleed panel covers the screen it would be opening into.
   */
  readonly launcherDraggable: boolean;
  /**
   * Which axes the resize grips may change. A full-bleed layout is the whole
   * viewport by definition and cannot be resized; a docked panel owns its
   * height, leaving only its inner edge.
   */
  readonly resizeAxis: ResizeAxis;
  /**
   * Whether a first mount with nothing stored starts collapsed. Only the
   * corner placements do: a launcher is the resting state of every corner chat
   * in the field, and mounting open put a 380x560 panel over the host page's
   * corner on a visitor's first load, uninvited. The placements that place
   * themselves start open -- a host that docks a sidebar has already decided
   * the widget belongs on screen, and one that embeds it has given it a box.
   *
   * Separate from {@link launcherDraggable} although the two agree today:
   * "has a launcher to rest on" and "the launcher can be moved" are different
   * questions, and a surface with a fixed launcher would answer them apart.
   */
  readonly startsCollapsed: boolean;
}

const CORNER: Surface = {
  collapseTo: "launcher",
  launcherDraggable: true,
  resizeAxis: "both",
  startsCollapsed: true,
};

const DOCKED: Surface = {
  collapseTo: "launcher",
  launcherDraggable: false,
  resizeAxis: "width",
  startsCollapsed: false,
};

/**
 * One record per `placement` value. Absent (`null`) and empty are the default
 * floating corner, as the stylesheet treats them.
 */
const SURFACES: ReadonlyMap<string | null, Surface> = new Map<string | null, Surface>([
  [null, CORNER],
  ["", CORNER],
  ["floating", CORNER],
  ["bottom-left", CORNER],
  ["side", DOCKED],
  ["sidebar", { ...DOCKED, collapseTo: "rail" }],
  [
    "full",
    {
      collapseTo: "launcher",
      launcherDraggable: false,
      resizeAxis: "none",
      startsCollapsed: false,
    },
  ],
  [
    "page",
    { collapseTo: null, launcherDraggable: false, resizeAxis: "none", startsCollapsed: false },
  ],
  [
    "embedded",
    { collapseTo: "header", launcherDraggable: false, resizeAxis: "both", startsCollapsed: false },
  ],
]);

/**
 * A value no record names. The stylesheet lays it out as the default corner,
 * but the script has never treated an unknown value as one: its launcher stays
 * put and it mounts open, so a typo in a host's markup does not start moving
 * or hiding a panel the host meant to show.
 */
const UNKNOWN: Surface = {
  collapseTo: "launcher",
  launcherDraggable: false,
  resizeAxis: "both",
  startsCollapsed: false,
};

/**
 * The surface `placement` describes. Read per interaction by every caller,
 * because `placement` is a live attribute.
 */
export function surfaceFor(placement: string | null): Surface {
  return SURFACES.get(placement) ?? UNKNOWN;
}
