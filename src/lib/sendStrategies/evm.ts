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
