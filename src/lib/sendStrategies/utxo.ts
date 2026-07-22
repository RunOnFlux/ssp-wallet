/**
 * UTXO send strategy — pure helpers.
 *
 * Fee model: fee = txSize (vBytes) × rate (sat/vB). "Normal" is exactly the
 * automatic fee the legacy Send page used (networkFees[chain].base); Slow and
 * Fast are derived from that same relay-provided base rate. Custom keeps the
 * legacy manual semantics (user edits the total fee in coin units).
 *
 * Transaction construction/signing is NOT here — the stateful strategy hook
 * calls the existing lib/constructTx functions unchanged.
 */
import BigNumber from 'bignumber.js';

export type FeePresetKey = 'slow' | 'normal' | 'fast' | 'custom';

/** Multipliers applied to the relay base sat/vB rate. Normal = today's auto fee. */
export const UTXO_RATE_MULTIPLIERS: Record<
  Exclude<FeePresetKey, 'custom'>,
  number
> = {
  slow: 0.75,
  normal: 1,
  fast: 1.5,
};

/**
 * sat/vB rate for a preset. Slow is floored at 1 sat/vB so the transaction
 * still relays; Normal returns the base rate untouched (bit-identical to the
 * legacy automatic path).
 */
export function presetRateUtxo(
  preset: Exclude<FeePresetKey, 'custom'>,
  baseRate: number,
): string {
  if (preset === 'normal') {
    return new BigNumber(baseRate).toFixed();
  }
  const rate = new BigNumber(baseRate).multipliedBy(
    UTXO_RATE_MULTIPLIERS[preset],
  );
  return BigNumber.max(rate, 1).decimalPlaces(2).toFixed();
}

/** Fee in coin units for a given tx size + rate. Null when size unknown. */
export function utxoFeeForRate(
  txSizeVBytes: number,
  rate: string,
  decimals: number,
): string | null {
  if (!txSizeVBytes || txSizeVBytes <= 0) {
    return null;
  }
  return new BigNumber(txSizeVBytes)
    .multipliedBy(rate)
    .dividedBy(10 ** decimals)
    .toFixed();
}

/**
 * MAX amount for a UTXO send — lifted math from the legacy Send.tsx
 * useMaximum effect: spendable (sats) converted to units minus the fee,
 * floored at 0.
 */
export function computeUtxoMax(
  spendableSats: string,
  decimals: number,
  feeUnits: string,
): string {
  const maxSpendable = new BigNumber(spendableSats).dividedBy(10 ** decimals);
  const fee = new BigNumber(feeUnits || '0');
  return maxSpendable.minus(fee).isGreaterThan(0)
    ? maxSpendable.minus(fee).toFixed()
    : '0';
}
