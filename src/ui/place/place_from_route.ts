import type { RouteMap } from "../../tools/route_map.js";
import type { Place } from "./place.js";

/** A route path template as an anchored pattern: each placeholder one segment. */
function pattern(path: string): RegExp {
  const escaped = path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

/**
 * The zero-configuration place: the route in the host's route map that the
 * current path matches, named by its title. Null when no route matches, so a
 * host with no route map and no place provider shows nothing at all.
 */
export function placeFromRoute(routes: RouteMap, location: Location): Place | null {
  const route = routes.find((candidate) => pattern(candidate.path).test(location.pathname));
  if (route === undefined) {
    return null;
  }
  return {
    label: route.title ?? route.id,
    ...(route.group === undefined ? {} : { detail: route.group }),
    href: location.pathname,
  };
}
