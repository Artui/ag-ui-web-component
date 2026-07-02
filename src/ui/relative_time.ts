import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/**
 * A compact relative timestamp for a thread row — e.g. `"just now"`, `"5m ago"`,
 * `"3h ago"`, `"2d ago"`, `"4w ago"`.
 *
 * `now` is injectable so callers (and tests) can pin the reference point; it
 * defaults to the current time. A timestamp in the future (clock skew) reads as
 * `"just now"`. A non-finite timestamp — an unparseable or missing `updated_at`
 * that arrived as `NaN` — has no meaningful age, so it falls back to `justNow`
 * rather than rendering `"NaNw ago"` or `"~2950w ago"`. The unit words come from
 * {@link UiStrings} (the `{n}` token is filled in here) so a localized host
 * translates them; the bucketing stays integer-rounded and locale-neutral.
 */
export function relativeTime(
  timestamp: number,
  now: number = Date.now(),
  strings: UiStrings = DEFAULT_UI_STRINGS,
): string {
  if (!Number.isFinite(timestamp)) {
    return strings.justNow;
  }
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 60) {
    return strings.justNow;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return strings.minutesAgo.replace("{n}", String(minutes));
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return strings.hoursAgo.replace("{n}", String(hours));
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return strings.daysAgo.replace("{n}", String(days));
  }
  return strings.weeksAgo.replace("{n}", String(Math.round(days / 7)));
}
