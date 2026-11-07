/**
 * 2026-10 security review (amount parsing): bignumber.js reads '0x10' as 16 and '1e2' as 100, so a typed
 * amount could differ from the digits a user sees. parseAmount refuses radix
 * prefixes everywhere; user-typed amounts additionally go through the strict
 * plain-decimal parser (no exponent, sign, whitespace or separators) — in the
 * TRON send strategy too (tronUnitsToBase).
 */
import { describe, it, expect } from 'vitest';
import {
  isPlainDecimalAmount,
  parseAmount,
  parsePlainDecimal,
} from '../../src/lib/sendStrategies/amount';
import { tronUnitsToBase } from '../../src/lib/sendStrategies/tron';

describe('amount parsing (2026-10 security review)', () => {
  it('parseAmount refuses hex / binary / octal literals', () => {
    for (const v of ['0x10', '0X10', '0b1', '0o7', '-0x1', '+0x1', ' 0x1']) {
      expect(parseAmount(v)).toBeNull();
    }
    expect(parseAmount('16')?.toFixed()).toBe('16');
    // machine-produced exponent strings still parse (fees, history)
    expect(parseAmount('1e-7')?.toFixed()).toBe('0.0000001');
  });

  it('the strict parser accepts plain decimals only', () => {
    for (const ok of ['1', '0.5', '.5', '1.', '12.34567891', '1.00000001']) {
      expect(isPlainDecimalAmount(ok)).toBe(true);
      expect(parsePlainDecimal(ok)).not.toBeNull();
    }
    for (const bad of [
      '0x10',
      '1e2',
      '1E2',
      ' 1',
      '1 ',
      '+1',
      '-1',
      '1_000',
      '1,000',
      '',
      '.',
      'Infinity',
      'NaN',
      '1.2.3',
    ]) {
      expect(isPlainDecimalAmount(bad)).toBe(false);
      expect(parsePlainDecimal(bad)).toBeNull();
    }
    expect(parsePlainDecimal('12.34567891')?.toFixed()).toBe('12.34567891');
  });
});

describe('the TRON send strategy parses typed amounts strictly', () => {
  const BAD = [
    '0x10',
    '0X1',
    '0b1',
    '0o7',
    '1e2',
    '1E-2',
    '5e-1',
    ' 1',
    '1 ',
    '+1',
    '-1',
    '1_000',
    '1,000',
    'Infinity',
    'NaN',
    '.',
    '',
  ];

  it('tronUnitsToBase (TRX / TRC-20) refuses hex / exponent / signed / spaced amounts', () => {
    for (const bad of BAD) {
      expect(tronUnitsToBase(bad, 6), bad).toBeNull();
    }
    expect(tronUnitsToBase('16', 6)).toBe(16_000_000n);
    expect(tronUnitsToBase('0.000001', 6)).toBe(1n);
    expect(tronUnitsToBase('0.0000001', 6)).toBeNull(); // > 6 decimals
    expect(tronUnitsToBase('12.5', 18)).toBe(12_500_000_000_000_000_000n);
    expect(tronUnitsToBase('0', 6)).toBeNull();
  });
});
