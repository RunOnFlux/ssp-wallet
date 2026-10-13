/**
 * Review KAS-7: bignumber.js reads '0x10' as 16 and '1e2' as 100, so a typed
 * amount could differ from the digits a user sees. parseAmount refuses radix
 * prefixes everywhere; user-typed amounts additionally go through the strict
 * plain-decimal parser (no exponent, sign, whitespace or separators) — in the
 * Kaspa and TRON send strategies too (unitsToSompi, tronUnitsToBase).
 */
import { describe, it, expect } from 'vitest';
import {
  isPlainDecimalAmount,
  parseAmount,
  parsePlainDecimal,
} from '../../src/lib/sendStrategies/amount';
import {
  kasAmountExceedsBalance,
  unitsToSompi,
} from '../../src/lib/sendStrategies/kas';
import { tronUnitsToBase } from '../../src/lib/sendStrategies/tron';

describe('KAS-7: amount parsing', () => {
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

describe('KAS-7: the Kaspa and TRON send strategies parse typed amounts strictly', () => {
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

  it('unitsToSompi (KAS) refuses hex / exponent / signed / spaced amounts', () => {
    for (const bad of BAD) {
      expect(unitsToSompi(bad, 8), bad).toBeNull();
    }
    expect(unitsToSompi('16', 8)).toBe(1_600_000_000n);
    expect(unitsToSompi('.5', 8)).toBe(50_000_000n);
    expect(unitsToSompi('1.', 8)).toBe(100_000_000n);
    expect(unitsToSompi('0.00000001', 8)).toBe(1n);
    expect(unitsToSompi('0.000000001', 8)).toBeNull(); // > 8 decimals
    expect(unitsToSompi('0', 8)).toBeNull(); // not positive
  });

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

  it('kasAmountExceedsBalance never reads a hex / exponent amount as a number', () => {
    // '0x10' would be 16 KAS and '1e9' a billion: neither may count as an
    // amount (the field's own strict rule reports them as invalid instead).
    expect(kasAmountExceedsBalance('0x10', '0', '100000000', 8)).toBe(false);
    expect(kasAmountExceedsBalance('1e9', '0', '100000000', 8)).toBe(false);
    expect(kasAmountExceedsBalance('2', '0', '100000000', 8)).toBe(true);
    expect(kasAmountExceedsBalance('0.5', '0.01', '100000000', 8)).toBe(false);
  });
});
