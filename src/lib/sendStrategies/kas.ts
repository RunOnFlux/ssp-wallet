/**
 * Kaspa send strategy — pure helpers.
 *
 * Fee model: fee = exact transaction mass (grams) × rate (sompi/gram), computed
 * by kaspa-core's planner before any key is touched. The three presets map to
 * the node's fee-estimate buckets (economy / normal / fast, clamped by
 * pickFeeRate). There is no Custom preset: the planner owns the fee, and a
 * hand-typed total could not be honoured exactly under mass-based pricing.
 *
 * Planning and signing live in lib/kaspa.ts (planKasSend / signKasSend); the
 * stateful hook calls them.
 */
import BigNumber from 'bignumber.js';
import { parseAmount } from './amount';
import type { FeePresetKey } from './utxo';
import type { KasFeeTier } from '../kaspa';
import type { Plan } from '@runonflux/kaspa-core';

export type KasPresetKey = Exclude<FeePresetKey, 'custom'>;

/** Preset → fee-estimate bucket. */
export const KAS_PRESET_TIERS: Record<KasPresetKey, KasFeeTier> = {
  slow: 'economy',
  normal: 'normal',
  fast: 'fast',
};

export const KAS_PRESETS: KasPresetKey[] = ['slow', 'normal', 'fast'];

/** sompi → coin units string (exact, no floating point). */
export function sompiToUnits(sompi: bigint, decimals: number): string {
  return new BigNumber(sompi.toString()).dividedBy(10 ** decimals).toFixed();
}

/**
 * User-typed coin units → sompi, or null when not a positive amount with at
 * most `decimals` fractional digits.
 */
export function unitsToSompi(units: string, decimals: number): bigint | null {
  const parsed = parseAmount(units || '');
  if (!parsed || parsed.lte(0)) return null;
  const base = parsed.multipliedBy(10 ** decimals);
  if (!base.isInteger()) return null;
  return BigInt(base.toFixed(0));
}

/**
 * Per-transaction fee ceiling in sompi: min(maxTxFeeUSD worth of KAS, the
 * chain's maxFee) — same rule as the UTXO strategy. An unknown price leaves
 * only the chain cap.
 */
export function kasMaxFeeSompi(
  maxFeeUSD: number,
  priceUSD: number,
  decimals: number,
  chainMaxFee: number,
): bigint {
  const cap = new BigNumber(chainMaxFee);
  let limit = cap;
  if (priceUSD > 0 && Number.isFinite(priceUSD)) {
    const usdLimit = new BigNumber(maxFeeUSD)
      .dividedBy(priceUSD)
      .multipliedBy(10 ** decimals);
    limit = BigNumber.min(usdLimit, cap);
  }
  return BigInt(limit.integerValue(BigNumber.ROUND_FLOOR).toFixed(0));
}

/**
 * Amount + fee exceeds the spendable balance? Unparseable input is NOT
 * reported as exceeding (the amount field's own rule owns that case).
 * Mirrors utxoAmountExceedsBalance.
 */
export function kasAmountExceedsBalance(
  sendingAmount: string,
  feeUnits: string,
  spendableSompi: string,
  decimals: number,
): boolean {
  const amount = parseAmount(sendingAmount || '0');
  const fee = parseAmount(feeUnits || '0');
  const spendable = parseAmount(spendableSompi || '0');
  if (!amount || !fee || !spendable) {
    return false;
  }
  return amount.plus(fee).isGreaterThan(spendable.dividedBy(10 ** decimals));
}

/**
 * Does a freshly built plan pay exactly what the user reviewed? The first
 * output is the recipient (the planner keeps output order; change is
 * appended), and the fee must equal the displayed fee to the sompi. Any
 * difference means the coins moved since the review: the caller refreshes
 * and asks the user to confirm again — never signs a different fee or amount.
 */
export function kasPlanMatchesReview(
  plan: Pick<Plan, 'final'>,
  amountSompi: bigint,
  feeSompi: bigint,
): boolean {
  const out = plan.final.tx.outputs[0]?.value;
  return out === amountSompi && plan.final.fee === feeSompi;
}

/** kaspa-core error `code` → send-namespace translation key. */
export function kasPlanErrorKey(error: unknown): string | null {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
      return 'send:err_kas_insufficient_funds';
    case 'NEEDS_CONSOLIDATION':
    case 'MASS_CAP_EXCEEDED':
      return 'send:err_kas_needs_consolidation';
    case 'FEE_TOO_HIGH':
      return 'send:err_kas_fee_too_high';
    case 'CHANGE_WOULD_BE_DUST':
      return 'send:err_kas_change_dust';
    case 'INVALID_ADDRESS':
      return 'send:err_invalid_receiver';
    case 'ENTRY_MISMATCH':
    case 'REST':
      return 'send:err_kas_network';
    default:
      return null;
  }
}
