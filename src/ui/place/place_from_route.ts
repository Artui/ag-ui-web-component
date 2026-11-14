import type { RouteMap } from "../../tools/route_map.js";
import type { Place } from "./place.js";

/** A route path template as an anchored pattern, each placeholder one segment. */
function pattern(path: string): RegExp {
  const escaped = path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

/**
 * The place a route map implies: the first route whose path template matches
 * `pathname`, its title (else its id) as the label, its group as the detail,
 * and the path as the href. Null when no route matches.
 */
export function placeFromRoute(routes: RouteMap, pathname: string): Place | null {
  const route = routes.find((candidate) => pattern(candidate.path).test(pathname));
  if (route === undefined) {
    return null;
  }
  return {
    label: route.title ?? route.id,
    ...(route.group === undefined ? {} : { detail: route.group }),
    href: pathname,
  };
}
