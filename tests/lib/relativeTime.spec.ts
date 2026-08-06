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
});

describe('formatFullTimestamp', () => {
  it('renders the full localized timestamp', () => {
    expect(formatFullTimestamp(NOW, 'en')).toBe(
      new Date(NOW).toLocaleString('en'),
    );
  });
});
