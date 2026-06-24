/**
 * A compact relative timestamp for a thread row — e.g. `"just now"`, `"5m ago"`,
 * `"3h ago"`, `"2d ago"`, `"4w ago"`.
 *
 * `now` is injectable so callers (and tests) can pin the reference point; it
 * defaults to the current time. A timestamp in the future (clock skew) reads as
 * `"just now"`. Kept locale-independent on purpose so the rendered label is
 * stable across environments.
 */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return `${Math.round(days / 7)}w ago`;
}
