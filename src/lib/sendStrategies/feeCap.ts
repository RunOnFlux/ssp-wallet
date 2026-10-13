/**
 * Consumer (2-of-2) fee ceiling shared with the SSP Key.
 *
 * The Key refuses consumer transactions whose fee exceeds
 * min(chain maxFee, USD 100) (UTXO) or min(0.05 SOL, USD 100) (Solana
 * paymaster reimbursement). The wallet must never BUILD anything above that,
 * whatever the user configured as maxTxFeeUSD, or the Key would refuse the
 * request after the user already approved it in the wallet.
 */
export const CONSUMER_FEE_USD_CEILING = 100;

/** min(configured maxTxFeeUSD, USD 100); a bad config falls back to 100. */
export function effectiveMaxFeeUsd(maxTxFeeUSD: number | undefined): number {
  if (
    typeof maxTxFeeUSD !== 'number' ||
    !Number.isFinite(maxTxFeeUSD) ||
    maxTxFeeUSD <= 0
  ) {
    return CONSUMER_FEE_USD_CEILING;
  }
  return Math.min(maxTxFeeUSD, CONSUMER_FEE_USD_CEILING);
}
