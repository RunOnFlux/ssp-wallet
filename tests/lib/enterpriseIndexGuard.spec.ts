// H-1 (wallet side): enterprise derivation indices are re-checked at sign
// time in every enterprise handler (vault sign, vault xpub, flux node start).
import { describe, it, expect } from 'vitest';
import {
  assertEnterpriseIndices,
  enterpriseIndicesError,
  inputAddressIndex,
  isValidChildIndex,
  isValidEnterpriseOrgIndex,
  EnterpriseIndexError,
} from '../../src/lib/enterpriseIndexGuard';

describe('enterpriseIndexGuard', () => {
  it('accepts only integer orgIndex in 100..99999', () => {
    for (const ok of [100, 150, 99999]) {
      expect(isValidEnterpriseOrgIndex(ok)).toBe(true);
    }
    // 0 = consumer account, 99 = recovery account.
    for (const bad of [0, 1, 99, 100000, 150.5, NaN, Infinity, -100]) {
      expect(isValidEnterpriseOrgIndex(bad)).toBe(false);
    }
    // Non-number types are rejected, never coerced.
    expect(isValidEnterpriseOrgIndex('150')).toBe(false);
    expect(isValidEnterpriseOrgIndex(null)).toBe(false);
    expect(isValidEnterpriseOrgIndex(undefined)).toBe(false);
  });

  it('accepts only integer child indices in [0, 2^31)', () => {
    expect(isValidChildIndex(0)).toBe(true);
    expect(isValidChildIndex(2 ** 31 - 1)).toBe(true);
    expect(isValidChildIndex(2 ** 31)).toBe(false);
    expect(isValidChildIndex(-1)).toBe(false);
    expect(isValidChildIndex(1.5)).toBe(false);
    expect(isValidChildIndex('1')).toBe(false);
  });

  it('assertEnterpriseIndices refuses consumer / recovery / bad indices', () => {
    expect(() =>
      assertEnterpriseIndices({
        orgIndex: 150,
        vaultIndex: 0,
        addressIndexes: [0, 3],
      }),
    ).not.toThrow();
    expect(() =>
      assertEnterpriseIndices({ orgIndex: 0, vaultIndex: 0 }),
    ).toThrow(EnterpriseIndexError);
    expect(() => assertEnterpriseIndices({ orgIndex: 99 })).toThrow(
      /100-99999/,
    );
    expect(() =>
      assertEnterpriseIndices({ orgIndex: 150, vaultIndex: -1 }),
    ).toThrow(/vault index/);
    expect(() =>
      assertEnterpriseIndices({ orgIndex: 150, addressIndexes: [2 ** 31] }),
    ).toThrow(/address index/);
    expect(enterpriseIndicesError({ orgIndex: 150, vaultIndex: 'x' })).toMatch(
      /vault index/,
    );
    expect(enterpriseIndicesError({ orgIndex: 150, vaultIndex: 1 })).toBeNull();
  });

  it('inputAddressIndex defaults only an ABSENT index to 0', () => {
    expect(inputAddressIndex({})).toBe(0);
    expect(inputAddressIndex(undefined)).toBe(0);
    expect(inputAddressIndex({ addressIndex: 7 })).toBe(7);
    expect(() => inputAddressIndex({ addressIndex: '7' })).toThrow();
    expect(() => inputAddressIndex({ addressIndex: -1 })).toThrow();
    expect(() => inputAddressIndex({ addressIndex: null })).toThrow();
  });
});
