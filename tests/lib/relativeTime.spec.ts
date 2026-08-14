import { describe, it, expect } from 'vitest';
import {
  formatRelativeTime,
  formatFullTimestamp,
} from '../../src/lib/relativeTime';

const NOW = new Date('2026-07-15T12:00:00Z').getTime();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('formatRelativeTime', () => {
  it('renders sub-minute ages as now', () => {
    expect(formatRelativeTime(NOW - 10_000, 'en', NOW)).toBe('now');
  });

  it('renders future timestamps (clock skew) as now', () => {
    expect(formatRelativeTime(NOW + 5 * MIN, 'en', NOW)).toBe('now');
  });

  it('renders minute ages', () => {
    expect(formatRelativeTime(NOW - 5 * MIN, 'en', NOW)).toBe('5m ago');
    expect(formatRelativeTime(NOW - 59 * MIN, 'en', NOW)).toBe('59m ago');
  });

  it('renders hour ages', () => {
    expect(formatRelativeTime(NOW - HOUR, 'en', NOW)).toBe('1h ago');
    expect(formatRelativeTime(NOW - 23 * HOUR, 'en', NOW)).toBe('23h ago');
  });

  it('renders day ages with auto phrasing', () => {
    expect(formatRelativeTime(NOW - DAY, 'en', NOW)).toBe('yesterday');
    expect(formatRelativeTime(NOW - 3 * DAY, 'en', NOW)).toBe('3d ago');
  });

  it('falls back to a locale date beyond a week', () => {
    const old = NOW - 30 * DAY;
    expect(formatRelativeTime(old, 'en', NOW)).toBe(
      new Date(old).toLocaleDateString('en'),
    );
  });

  it('boundary: exactly 7 days falls back to date', () => {
    const week = NOW - 7 * DAY;
    expect(formatRelativeTime(week, 'en', NOW)).toBe(
      new Date(week).toLocaleDateString('en'),
    );
  });

  // Explorer txs can arrive without a timeStamp (NaN after Number()) —
  // must not throw RangeError inside Intl.RelativeTimeFormat.format().
  it('renders unknown timestamps (NaN, 0, negative) as empty string', () => {
    expect(formatRelativeTime(NaN, 'en', NOW)).toBe('');
    expect(formatRelativeTime(0, 'en', NOW)).toBe('');
    expect(formatRelativeTime(-1, 'en', NOW)).toBe('');
    expect(formatRelativeTime(Infinity, 'en', NOW)).toBe('');
  });
});

describe('formatFullTimestamp', () => {
  it('renders the full localized timestamp', () => {
    expect(formatFullTimestamp(NOW, 'en')).toBe(
      new Date(NOW).toLocaleString('en'),
    );
  });

  it('renders unknown timestamps as empty string', () => {
    expect(formatFullTimestamp(NaN, 'en')).toBe('');
    expect(formatFullTimestamp(0, 'en')).toBe('');
  });
});
