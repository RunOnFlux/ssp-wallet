/**
 * @vitest-environment jsdom
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock react-secure-storage to prevent initialization issues
vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}));

import { getFingerprint } from '../../src/lib/fingerprint';

describe('Fingerprint Lib', () => {
  describe('Verifies fingerprint', () => {
    beforeAll(() => {
      // JSDOM environment is set for this test file via @vitest-environment comment
    });

    // Testing using stub data
    it('should return successful result if value is valid', () => {
      const res = getFingerprint();
      expect(res).toBeTypeOf('string');
      expect(res.length).toBe(64);
    });
  });
});
