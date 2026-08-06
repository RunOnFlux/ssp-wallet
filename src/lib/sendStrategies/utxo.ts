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
import { parseAmount } from './amount';

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
 * Minimum fee, in coin units, that a Replace-by-Fee replacement must pay.
 *
 * BIP125 rule 4: a replacement must pay at least the replaced transaction's fee
 * PLUS the replacement's own size at the minimum relay rate. RBF previously
 * recomputed a byte-identical fee to the original send (the preset defaults to
 * 'normal' and the size barely changes), so the node rejected the replacement
 * and the stuck transaction stayed stuck with no explanation.
 *
 * @param txSizeVBytes    measured vsize of the replacement
 * @param replacedFeeSats fee of the transaction being replaced, in BASE units
 * @param minFeePerByte   chain's minimum relay rate (sat/vB)
 * @param decimals        chain decimals, to return coin units
 * @returns the floor in coin units, or null when it cannot be computed
 */
export function rbfFeeFloor(
  txSizeVBytes: number,
  replacedFeeSats: string,
  minFeePerByte: number,
  decimals: number,
): string | null {
  if (!txSizeVBytes || txSizeVBytes <= 0) {
    return null;
  }
  // Validate BEFORE constructing: this bignumber.js build THROWS on a
  // non-numeric string rather than yielding NaN, so an isFinite() check after
  // the fact never runs. The replaced fee originates from chain-explorer data.
  if (
    typeof replacedFeeSats !== 'string' ||
    !/^\d+(\.\d+)?$/.test(replacedFeeSats.trim())
  ) {
    return null;
  }
  const replaced = new BigNumber(replacedFeeSats);
  const minBumpSats = new BigNumber(txSizeVBytes)
    .multipliedBy(minFeePerByte)
    .integerValue(BigNumber.ROUND_CEIL);
  return replaced
    .plus(minBumpSats)
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

/**
 * Insufficient-balance check for the live amount validation: a UTXO send must
 * cover amount + fee out of the spendable balance. Amount and fee are
 * user-typed strings ('' and half-typed values like '.' reach this while the
 * user edits), so an unparseable amount/fee/balance is NOT reported as
 * exceeding — the amount field's own "invalid amount" rule owns that case.
 * Mirrors evmAmountExceedsBalance / solAmountExceedsBalance.
 */
export function utxoAmountExceedsBalance(
  sendingAmount: string,
  feeUnits: string,
  spendableSats: string,
  decimals: number,
): boolean {
  const amount = parseAmount(sendingAmount || '0');
  const fee = parseAmount(feeUnits || '0');
  const spendable = parseAmount(spendableSats || '0');
  if (!amount || !fee || !spendable) {
    return false;
  }
  return amount.plus(fee).isGreaterThan(spendable.dividedBy(10 ** decimals));
}
