import type { ClientTool } from "./client_tool_registry.js";
import { X_NAVIGATES_KEY } from "./constants.js";

/** A single navigable route the host declares for the agent. */
export interface Route {
  /** Stable id the agent uses with `navigate_to_route`. */
  readonly id: string;
  /** The URL path to navigate to. */
  readonly path: string;
  /** Human label shown to the agent. */
  readonly title?: string;
  /** Optional grouping (e.g. an app or section). */
  readonly group?: string;
  /** Optional longer description of when to use the route. */
  readonly description?: string;
}

/** The host-declared catalog of navigable routes. */
export type RouteMap = readonly Route[];

/** Append `params` to `path` as a query string (no-op when empty). */
function withQuery(path: string, params: Record<string, unknown> | undefined): string {
  if (params === undefined) {
    return path;
  }
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    usp.set(key, String(value));
  }
  const query = usp.toString();
  return query === "" ? path : `${path}?${query}`;
}

/**
 * The built-in `route.*` tools, bound to live getters so a host can set
 * `routeMap` / `navigate` before or after mount.
 *
 * `list_routes` is read-only; `navigate_to_route` is marked `x-navigates` so an
 * MPA reload checkpoints + resumes. When the host supplies a `navigate(path)`
 * callback (an SPA), the element routes client-side instead and the run loop
 * simply continues — see `AgUiChat`'s execute path.
 */
export function createRouteTools(
  getRouteMap: () => RouteMap,
  getNavigate: () => ((path: string) => void) | null,
): ClientTool[] {
  return [
    {
      name: "list_routes",
      description: "List the routes the app can navigate to.",
      parameters: { type: "object", properties: {}, required: [] },
      handler: () => getRouteMap(),
    },
    {
      name: "navigate_to_route",
      description: "Navigate to one of the app's routes by its id.",
      parameters: {
        type: "object",
        properties: {
          route_id: { type: "string" },
          params: { type: "object" },
        },
        required: ["route_id"],
        [X_NAVIGATES_KEY]: true,
      },
      handler: (args) => {
        const routeId = args["route_id"];
        const route = getRouteMap().find((r) => r.id === routeId);
        if (route === undefined) {
          throw new Error(`unknown route "${String(routeId)}"`);
        }
        const path = withQuery(route.path, args["params"] as Record<string, unknown> | undefined);
        const navigate = getNavigate();
        if (navigate !== null) {
          navigate(path);
        } else {
          window.location.assign(path);
        }
        return { navigated: true, path };
      },
    },
  ];
}
