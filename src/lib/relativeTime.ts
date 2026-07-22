/**
 * Relative timestamp rendering for activity feeds.
 *
 * Recent events read as "5m ago" / "3h ago" / "yesterday" (localized via
 * Intl.RelativeTimeFormat, narrow style); anything older than a week falls
 * back to the locale date so history stays scannable. Pure — callers pass
 * `now` in tests.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export function formatRelativeTime(
  timestamp: number,
  locale?: string,
  now: number = Date.now(),
): string {
  const diff = now - timestamp;
  // Future or sub-minute timestamps (clock skew, just-broadcast txs) → "now".
  if (diff < MINUTE_MS) {
    return new Intl.RelativeTimeFormat(locale, {
      numeric: 'auto',
      style: 'narrow',
    }).format(0, 'second');
  }
  if (diff >= WEEK_MS) {
    return new Date(timestamp).toLocaleDateString(locale);
  }
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: 'narrow',
  });
  if (diff < HOUR_MS) {
    return rtf.format(-Math.floor(diff / MINUTE_MS), 'minute');
  }
  if (diff < DAY_MS) {
    return rtf.format(-Math.floor(diff / HOUR_MS), 'hour');
  }
  return rtf.format(-Math.floor(diff / DAY_MS), 'day');
}

/** Full localized timestamp — used as the tooltip/title for relative times. */
export function formatFullTimestamp(
  timestamp: number,
  locale?: string,
): string {
  return new Date(timestamp).toLocaleString(locale);
}
