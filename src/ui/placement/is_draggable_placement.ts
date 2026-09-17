/**
 * Placements whose launcher can be dragged. The rest have nowhere to put it:
 * a sidebar collapses to a full-height edge rail, "embedded" and "page" hide
 * the launcher entirely and keep their header bar, and a full-bleed panel
 * covers the screen it would be opening into.
 */
const DRAGGABLE_PLACEMENTS: ReadonlySet<string | null> = new Set([
  null,
  "",
  "floating",
  "bottom-left",
]);

/**
 * Whether `placement` is one whose launcher can be dragged.
 *
 * Asked by two owners: the placement, deciding whether a gesture may move the
 * widget, and the element, deciding whether a first mount starts collapsed --
 * the corner placements are the two with a launcher to collapse to.
 */
export function isDraggablePlacement(placement: string | null): boolean {
  return DRAGGABLE_PLACEMENTS.has(placement);
}
