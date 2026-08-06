/**
 * EVM send strategy — pure helpers.
 *
 * Fee model: total fee (ETH) = totalGas × (baseGasPrice + priorityGasPrice)
 * where gas prices are in gwei — the exact math of the legacy SendEVM
 * calculateTxFee. Presets vary ONLY the priority tip (Slow ½×, Normal 1×,
 * Fast 2×) over the same relay-provided fee data; the base gas price always
 * stays at the network value so the transaction remains includable. Custom
 * exposes the legacy manual inputs (base/priority gwei + the three gas
 * components) unchanged.
 */
import BigNumber from 'bignumber.js';
import { parseAmount, totalNative } from './amount';
import type { FeePresetKey } from './utxo';

/** Priority-tip multipliers. Normal = today's automatic fee. */
export const EVM_PRIORITY_MULTIPLIERS: Record<
  Exclude<FeePresetKey, 'custom'>,
  number
> = {
  slow: 0.5,
  normal: 1,
  fast: 2,
};

/** Gas prices (gwei, as strings) for a preset over the relay fee data. */
export function presetGasEvm(
  preset: Exclude<FeePresetKey, 'custom'>,
  baseGwei: string | number,
  priorityGwei: string | number,
): { base: string; priority: string } {
  const base = new BigNumber(baseGwei).toFixed();
  if (preset === 'normal') {
    return { base, priority: new BigNumber(priorityGwei).toFixed() };
  }
  return {
    base,
    priority: new BigNumber(priorityGwei)
      .multipliedBy(EVM_PRIORITY_MULTIPLIERS[preset])
      .toFixed(),
  };
}

/**
 * Total max fee in ETH — mirrors legacy calculateTxFee byte-for-byte:
 * totalGas × (base + priority) gwei → wei → ETH. Returns null on NaN
 * (legacy showed '---').
 */
export function evmFeeTotalEth(
  totalGas: string | number,
  baseGwei: string | number,
  priorityGwei: string | number,
): string | null {
  try {
    const gas = new BigNumber(totalGas.toString());
    const totalGasPrice = new BigNumber(baseGwei.toString())
      .plus(priorityGwei.toString())
      .multipliedBy(10 ** 9);
    const totalFee = gas.multipliedBy(totalGasPrice);
    const totalFeeETH = totalFee.dividedBy(10 ** 18).toFixed();
    if (totalFee.isNaN() || !totalFeeETH) {
      return null;
    }
    return totalFeeETH;
  } catch {
    return null;
  }
}

/**
 * MAX for native-asset sends — lifted math from SendEVM's useMaximum effect:
 * spendable (wei) to units minus fee, floored at 0.
 */
export function computeEvmMaxNative(
  spendableWei: string,
  decimals: number,
  feeEth: string,
): string {
  const maxSpendable = new BigNumber(spendableWei).dividedBy(10 ** decimals);
  const fee = new BigNumber(feeEth || '0');
  return maxSpendable.minus(fee).isGreaterThan(0)
    ? maxSpendable.minus(fee).toFixed()
    : '0';
}

/** MAX for token sends — full token balance (fee is paid in native). */
export function computeEvmMaxToken(
  balanceBase: string,
  tokenDecimals: number,
): string {
  return new BigNumber(balanceBase).dividedBy(10 ** tokenDecimals).toFixed();
}

/**
 * Insufficient-balance check shared by the live amount validation and the
 * compose → review gate: a native send must cover amount + fee out of the
 * same balance, a token send only the amount (the fee is paid in native).
 * An unparseable amount/fee/balance is NOT reported as exceeding — the amount
 * field's own "invalid amount" rule owns that case.
 */
export function evmAmountExceedsBalance(
  sendingAmount: string,
  feeEth: string,
  spendableBase: string,
  decimals: number,
  isToken: boolean,
): boolean {
  const amount = parseAmount(sendingAmount || '0');
  const fee = isToken ? new BigNumber(0) : parseAmount(feeEth || '0');
  const spendable = parseAmount(spendableBase || '0');
  if (!amount || !fee || !spendable) {
    return false;
  }
  return amount.plus(fee).isGreaterThan(spendable.dividedBy(10 ** decimals));
}

/**
 * amount + fee in native units (full precision — this is what the fiat
 * conversion consumes), or null when either side is not a number yet. Both are
 * user-typed strings and the fee also carries the '---' placeholder, so the
 * sum has to be parsed defensively rather than thrown from render.
 */
export function evmTotalNative(
  sendingAmount: string,
  feeEth: string,
): string | null {
  return totalNative(sendingAmount, feeEth);
}

/**
 * Display cap for EVM amounts. Wei-precision values carry up to 18 decimals
 * ("0.00044731977948761 ETH"), which is noise on the very rows where the user
 * verifies a spend and reads inconsistently next to the 8-decimal UTXO rows in
 * the same component. Fees and totals round UP so the displayed number never
 * understates what leaves the wallet; MAX rounds DOWN so it never overstates
 * what is available. Returns null for a value that is not a finite number
 * (callers keep their own '---' placeholder for that).
 */
export function evmDisplayAmount(
  value: string | null,
  rounding: BigNumber.RoundingMode = BigNumber.ROUND_CEIL,
  maxDecimals = 8,
): string | null {
  if (value === null || value === '') {
    return null;
  }
  const numeric = parseAmount(value);
  if (!numeric) {
    return null;
  }
  return numeric.decimalPlaces(maxDecimals, rounding).toFixed();
}
