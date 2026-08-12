// Non-exported-from-index helpers shared by the core transport modules.

/**
 * Overlay a `credentials` mode onto a fetch `init`, or hand the `init` back
 * untouched when none is configured.
 *
 * Absent and `undefined` differ: `exactOptionalPropertyTypes` rejects an
 * explicit `credentials: undefined`, and writing one anyway would state a mode
 * where the point is to leave the browser's own default in place.
 */
export function withCredentials(
  init: RequestInit | undefined,
  credentials: RequestCredentials | undefined,
): RequestInit | undefined {
  return credentials === undefined ? init : { ...init, credentials };
}
