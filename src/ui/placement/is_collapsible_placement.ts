/**
 * Whether `placement` has a collapsed state at all.
 *
 * `page` does not. It is a dedicated route rather than a panel sitting on
 * someone else's page, so there is no "away" for it to go to: collapsing it
 * left a strip of application chrome fixed over a route that no longer had an
 * owner. It is also the placement that hides the launcher, so the usual way
 * back does not exist here.
 *
 * The header hides its collapse control under this placement, but a control
 * removed from the UI is not a state removed from the model -- the property,
 * the attribute and a value restored from storage all still reach it. This is
 * what the reachable paths are gated on; the stylesheet covers the one path
 * that never passes through here, an attribute written straight onto the
 * element.
 */
export function isCollapsiblePlacement(placement: string | null): boolean {
  return placement !== "page";
}
