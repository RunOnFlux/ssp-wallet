import { describe, it, expect } from 'vitest';
import {
  BACKUP_CHECKUP_INTERVAL_MS,
  isBackupCheckupDue,
  sanitizeBackupCheckupState,
} from '../../src/lib/backupCheckup';

const NOW = 1_800_000_000_000; // fixed reference clock
const DAY = 24 * 60 * 60 * 1000;

describe('backupCheckup cycle logic', () => {
  describe('isBackupCheckupDue', () => {
    it('is due immediately when no verification was ever recorded (upgraded wallets)', () => {
      expect(isBackupCheckupDue({}, NOW)).toBe(true);
    });

    it('is not due right after a successful verification', () => {
      expect(isBackupCheckupDue({ lastVerifyAt: NOW }, NOW)).toBe(false);
      expect(isBackupCheckupDue({ lastVerifyAt: NOW - 1000 }, NOW)).toBe(false);
    });

    it('is not due during the 30-day cycle', () => {
      expect(isBackupCheckupDue({ lastVerifyAt: NOW - 29 * DAY }, NOW)).toBe(
        false,
      );
      expect(
        isBackupCheckupDue(
          { lastVerifyAt: NOW - BACKUP_CHECKUP_INTERVAL_MS + 1 },
          NOW,
        ),
      ).toBe(false);
    });

    it('becomes due once a full 30-day cycle elapsed', () => {
      expect(
        isBackupCheckupDue(
          { lastVerifyAt: NOW - BACKUP_CHECKUP_INTERVAL_MS },
          NOW,
        ),
      ).toBe(true);
      expect(isBackupCheckupDue({ lastVerifyAt: NOW - 90 * DAY }, NOW)).toBe(
        true,
      );
    });

    it('a fresh verification resets an elapsed cycle', () => {
      const elapsed = { lastVerifyAt: NOW - 60 * DAY };
      expect(isBackupCheckupDue(elapsed, NOW)).toBe(true);
      expect(isBackupCheckupDue({ ...elapsed, lastVerifyAt: NOW }, NOW)).toBe(
        false,
      );
    });

    it('an active snooze suppresses the card — even with no verification ever', () => {
      expect(isBackupCheckupDue({ snoozedUntil: NOW + DAY }, NOW)).toBe(false);
      expect(
        isBackupCheckupDue(
          { lastVerifyAt: NOW - 60 * DAY, snoozedUntil: NOW + DAY },
          NOW,
        ),
      ).toBe(false);
    });

    it('an expired snooze no longer suppresses it', () => {
      expect(isBackupCheckupDue({ snoozedUntil: NOW - 1 }, NOW)).toBe(true);
      expect(
        isBackupCheckupDue(
          { lastVerifyAt: NOW - 60 * DAY, snoozedUntil: NOW - DAY },
          NOW,
        ),
      ).toBe(true);
    });

    it('a future lastVerifyAt (clock skew) counts as fresh — never nags', () => {
      expect(isBackupCheckupDue({ lastVerifyAt: NOW + 5 * DAY }, NOW)).toBe(
        false,
      );
    });
  });

  describe('sanitizeBackupCheckupState (corrupt/missing values are safe)', () => {
    it('drops non-object input entirely', () => {
      expect(sanitizeBackupCheckupState(null)).toEqual({});
      expect(sanitizeBackupCheckupState(undefined)).toEqual({});
      expect(sanitizeBackupCheckupState('garbage')).toEqual({});
      expect(sanitizeBackupCheckupState(42)).toEqual({});
    });

    it('drops corrupt fields but keeps valid ones', () => {
      expect(
        sanitizeBackupCheckupState({
          lastVerifyAt: 'yesterday',
          snoozedUntil: NOW,
        }),
      ).toEqual({ snoozedUntil: NOW });
      expect(
        sanitizeBackupCheckupState({
          lastVerifyAt: NaN,
          snoozedUntil: -5,
          extra: true,
        }),
      ).toEqual({});
      expect(
        sanitizeBackupCheckupState({ lastVerifyAt: NOW, snoozedUntil: null }),
      ).toEqual({ lastVerifyAt: NOW });
    });

    it('sanitized corrupt storage behaves as never-verified (due, but no crash)', () => {
      const state = sanitizeBackupCheckupState({
        lastVerifyAt: 'corrupt',
        snoozedUntil: Infinity,
      });
      expect(isBackupCheckupDue(state, NOW)).toBe(true);
    });
  });
});
