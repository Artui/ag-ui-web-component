import { X_NAVIGATES_KEY, X_SUMMARY_KEY } from "../constants.js";
import type { ClientTool } from "./client_tool_registry.js";

/** A single navigable route the host declares for the agent. */
export interface Route {
  /** Stable id the agent uses with `navigate_to_route`. */
  readonly id: string;
  /**
   * The URL path to navigate to. May contain `:name` placeholders for dynamic
   * segments (e.g. `/admin/shop/book/:pk/change/`); the agent fills them via
   * the `navigate_to_route` `params` argument. Real apps are mostly
   * parameterised — few pages have a truly static path.
   */
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

/** A route enriched with its derived dynamic-segment parameter names. */
export interface RouteWithParams extends Route {
  /** Names of the `:name` placeholders in {@link Route.path} (may be empty). */
  readonly pathParams: readonly string[];
}

const PATH_PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/** The `:name` path-parameter names declared in a path template, in order. */
function pathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const match of path.matchAll(PATH_PARAM_RE)) {
    const name = match[1];
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Substitute `:name` placeholders in ``path`` from ``params``.
 *
 * Returns the concrete path plus the params *not* consumed by a placeholder, so
 * the caller can append those as a query string. Throws (referencing
 * ``routeId``) when a declared path param is missing or empty — a half-filled
 * path must never be navigated to.
 */
function fillPath(
  routeId: string,
  path: string,
  params: Record<string, unknown>,
): { path: string; leftover: Record<string, unknown> } {
  const leftover: Record<string, unknown> = { ...params };
  const filled = path.replace(PATH_PARAM_RE, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || String(value) === "") {
      throw new Error(`route "${routeId}" requires path param "${name}"`);
    }
    delete leftover[name];
    return encodeURIComponent(String(value));
  });
  return { path: filled, leftover };
}

/** Append `params` to `path` as a query string (no-op when empty). */
function withQuery(path: string, params: Record<string, unknown>): string {
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
 * `list_routes` is read-only and advertises each route's dynamic
 * `pathParams` so the model knows what to supply. `navigate_to_route` is marked
 * `x-navigates` so an MPA reload checkpoints + resumes; it substitutes path
 * params into the template and appends any remaining params as a query string.
 * When the host supplies a `navigate(path)` callback (an SPA), the element
 * routes client-side instead and the run loop simply continues — see
 * `AgUiChat`'s execute path.
 */
export function createRouteTools(
  getRouteMap: () => RouteMap,
  getNavigate: () => ((path: string) => void) | null,
): ClientTool[] {
  return [
    {
      name: "list_routes",
      description:
        "List the routes the app can navigate to. Each route's `pathParams` " +
        "names the dynamic segments to pass as `params` to `navigate_to_route`.",
      parameters: { type: "object", properties: {}, required: [], [X_SUMMARY_KEY]: "List pages" },
      handler: (): RouteWithParams[] =>
        getRouteMap().map((route) => ({ ...route, pathParams: pathParamNames(route.path) })),
    },
    {
      name: "navigate_to_route",
      description:
        "Navigate to one of the app's routes by its id, filling any dynamic " +
        "`:name` path segments (and extra query params) from `params`.",
      parameters: {
        type: "object",
        properties: {
          route_id: { type: "string" },
          params: { type: "object" },
        },
        required: ["route_id"],
        [X_NAVIGATES_KEY]: true,
        [X_SUMMARY_KEY]: "Navigate",
      },
      handler: (args) => {
        const routeId = args["route_id"];
        const route = getRouteMap().find((r) => r.id === routeId);
        if (route === undefined) {
          throw new Error(`unknown route "${String(routeId)}"`);
        }
        const provided = (args["params"] as Record<string, unknown> | undefined) ?? {};
        const { path: filledPath, leftover } = fillPath(route.id, route.path, provided);
        const path = withQuery(filledPath, leftover);
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
