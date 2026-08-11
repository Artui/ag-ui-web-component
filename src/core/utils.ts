// Non-exported-from-index helpers shared by the core transport modules.

/**
 * Overlay a `credentials` mode onto a fetch `init`, or hand the `init` back
 * untouched when the caller has none configured.
 *
 * Absent and `undefined` are not the same thing here. `exactOptionalPropertyTypes`
 * rejects an explicit `credentials: undefined`, and writing one anyway would
 * state a mode where the point is to leave the browser's own default in place.
 * Every fetch this component makes has to make that choice, so it is made in one
 * place rather than repeated (and eventually forgotten) at each call site.
 */
export function withCredentials(
  init: RequestInit | undefined,
  credentials: RequestCredentials | undefined,
): RequestInit | undefined {
  return credentials === undefined ? init : { ...init, credentials };
}
