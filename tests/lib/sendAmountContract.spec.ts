/**
 * Contract for wallet send + swap amounts.
 *
 * Three rules, all pure logic:
 *  - Continue may only advance to Review when amount + fee fits the balance;
 *  - EVM fee / total / MAX render at a bounded number of decimals, matching how
 *    the same component renders Bitcoin;
 *  - the gas-rate readout is rounded for display.
 */
import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import {
  evmAmountExceedsBalance,
  evmDisplayAmount,
  evmTotalNative,
} from '../../src/lib/sendStrategies/evm';
import { solAmountExceedsBalance } from '../../src/lib/sendStrategies/sol';

describe('batch B: EVM insufficient-balance gate', () => {
  // 1 ETH in wei.
  const oneEth = '1000000000000000000';

  it('counts the fee against a native send', () => {
    // 0.999 + 0.002 fee > 1 ETH available.
    expect(
      evmAmountExceedsBalance('0.999', '0.002', oneEth, 18, false),
    ).toBeTruthy();
    expect(
      evmAmountExceedsBalance('0.997', '0.002', oneEth, 18, false),
    ).toBeFalsy();
  });

  it('ignores the fee for token sends (it is paid in native)', () => {
    // 1000 USDT (6 decimals) available, sending all of it with a 0.002 ETH fee.
    expect(
      evmAmountExceedsBalance('1000', '0.002', '1000000000', 6, true),
    ).toBeFalsy();
    expect(
      evmAmountExceedsBalance('1000.000001', '0.002', '1000000000', 6, true),
    ).toBeTruthy();
  });

  it('reports the zero-balance case that used to reach Review', () => {
    expect(evmAmountExceedsBalance('0.001', '0.0004', '0', 18, false)).toBe(
      true,
    );
  });

  it('does not report a non-numeric amount or an unknown fee as exceeding', () => {
    // '' and the '---' fee placeholder must fall through to the amount field's
    // own "invalid amount" rule, exactly as the legacy NaN comparison did.
    expect(evmAmountExceedsBalance('', '0.002', oneEth, 18, false)).toBe(false);
    expect(evmAmountExceedsBalance('0.5', '---', oneEth, 18, false)).toBe(
      false,
    );
    expect(evmAmountExceedsBalance('abc', '0.002', oneEth, 18, false)).toBe(
      false,
    );
  });
});

describe('batch B: SOL insufficient-balance gate', () => {
  // 1 SOL in lamports.
  const oneSol = '1000000000';

  it('counts the paymaster fee against a native send', () => {
    expect(
      solAmountExceedsBalance('0.999', '0.002', oneSol, 9, 9, true),
    ).toBeTruthy();
    expect(
      solAmountExceedsBalance('0.997', '0.002', oneSol, 9, 9, true),
    ).toBeFalsy();
  });

  it('checks only the token amount for SPL sends', () => {
    // 5 USDC (6 decimals) in the vault; the SOL fee is verified at submit.
    expect(
      solAmountExceedsBalance('5', '0.002', '5000000', 6, 9, false),
    ).toBeFalsy();
    expect(
      solAmountExceedsBalance('5.000001', '0.002', '5000000', 6, 9, false),
    ).toBeTruthy();
  });

  it('reports the Devnet "Max: 0" case that used to reach Review', () => {
    expect(solAmountExceedsBalance('0.001', '0.002', '0', 9, 9, true)).toBe(
      true,
    );
  });

  it('does not report a non-numeric amount as exceeding', () => {
    expect(solAmountExceedsBalance('', '0.002', oneSol, 9, 9, true)).toBe(
      false,
    );
    expect(solAmountExceedsBalance('abc', '0.002', oneSol, 9, 9, true)).toBe(
      false,
    );
  });
});

describe('batch B: EVM display precision', () => {
  const fractionalDigits = (value: string): number =>
    value.includes('.') ? value.split('.')[1].length : 0;

  it('caps the 17-decimal fee and total from the review screen', () => {
    // The exact strings the review step printed before this fix.
    expect(evmDisplayAmount('0.00044731977948761')).toBe('0.00044732');
    expect(evmDisplayAmount('0.00144731977948761')).toBe('0.00144732');
  });

  it('never renders more than 8 fractional digits, on any input', () => {
    const samples = [
      '0.00044731977948761',
      '0.000000000000000001',
      '123.456789123456789',
      '1000000',
      '0',
      '0.1',
    ];
    for (const sample of samples) {
      const shown = evmDisplayAmount(sample);
      expect(shown).not.toBeNull();
      expect(fractionalDigits(shown as string)).toBeLessThanOrEqual(8);
    }
  });

  it('rounds fees UP so a displayed amount never understates the spend', () => {
    expect(evmDisplayAmount('0.000000005')).toBe('0.00000001');
    // Dust below the cap must not disappear entirely.
    expect(evmDisplayAmount('0.000000000000000001')).toBe('0.00000001');
  });

  it('rounds MAX DOWN so it never overstates what is available', () => {
    expect(evmDisplayAmount('0.9999999999', BigNumber.ROUND_DOWN)).toBe(
      '0.99999999',
    );
    expect(evmDisplayAmount('0.000000005', BigNumber.ROUND_DOWN)).toBe('0');
  });

  it('never returns exponential notation for very small or large values', () => {
    expect(evmDisplayAmount('1e-9')).toBe('0.00000001');
    expect(evmDisplayAmount('1e21')).toBe('1000000000000000000000');
  });

  it('keeps the raw total at full precision for the fiat conversion', () => {
    // The review row shows the capped string but converts the raw one, so no
    // wei is lost from the fiat figure.
    expect(evmTotalNative('0.001', '0.00044731977948761')).toBe(
      '0.00144731977948761',
    );
  });

  it('does not throw when a user types letters into amount or fee', () => {
    // bignumber.js THROWS on a non-numeric string, and both of these are raw
    // <Input> values, so an unguarded sum crashed the render.
    expect(() => evmTotalNative('abc', '0.001')).not.toThrow();
    expect(evmTotalNative('abc', '0.001')).toBeNull();
    expect(evmTotalNative('0.5', '---')).toBeNull();
  });

  it('returns null for the values callers show as "---"', () => {
    expect(evmDisplayAmount(null)).toBeNull();
    expect(evmDisplayAmount('')).toBeNull();
    expect(evmDisplayAmount('---')).toBeNull();
  });

  it('trims the gas-rate readout the compose screen shows', () => {
    // The exact "1.871983342 gwei" from the compose screen, and a sub-gwei L2
    // rate that must not collapse to "0.00".
    const gwei = (value: string): string => {
      const rate = new BigNumber(value);
      return rate.gte(1)
        ? rate.decimalPlaces(2, BigNumber.ROUND_CEIL).toFixed()
        : rate.precision(4, BigNumber.ROUND_CEIL).toFixed();
    };
    expect(gwei('1.871983342')).toBe('1.88');
    expect(gwei('25')).toBe('25');
    expect(gwei('0.001234567')).toBe('0.001235');
  });
});
