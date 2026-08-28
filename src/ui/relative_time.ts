import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/**
 * A compact relative timestamp for a thread row — e.g. `"just now"`, `"5m ago"`,
 * `"3h ago"`, `"2d ago"`, `"4w ago"`.
 *
 * `now` is injectable so callers and tests can pin the reference point. A
 * future timestamp (clock skew) and a non-finite one (an unparseable or missing
 * `updated_at`, arriving as `NaN`) both read as `justNow`, rather than
 * rendering a nonsense age. Unit words come from {@link UiStrings} with `{n}`
 * filled in here; the bucketing stays integer-rounded and locale-neutral.
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

/**
 * A host's replacement for {@link relativeTime}.
 *
 * Takes an epoch-milliseconds timestamp and returns the text a row shows.
 * `Intl.RelativeTimeFormat` is the obvious implementation and is deliberately
 * *not* the default: a component that guessed a locale would disagree with the
 * host page's own formatting, and being wrong in a second language is worse
 * than being neutral in one.
 */
export type RelativeTimeFormatter = (timestamp: number) => string;
