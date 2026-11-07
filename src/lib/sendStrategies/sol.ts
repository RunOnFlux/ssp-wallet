/**
 * Solana send strategy — pure helpers.
 *
 * Fee model: the fee is a paymaster reimbursement from a relay-provided
 * schedule (first-send vs subsequent tier + optional SPL ATA-creation bump),
 * NOT a speed market — paying more does not confirm faster. The unified flow
 * therefore exposes only Normal (the schedule-derived automatic fee, exactly
 * the legacy SendSOL behavior) and Custom (manual fee with the same
 * at-least-the-floor rule the legacy page enforced at submit).
 */
import BigNumber from 'bignumber.js';
import { parseAmount } from './amount';
import { effectiveMaxFeeUsd } from './feeCap';

export interface SolFeeSchedule {
  subsequentSendLamports: number;
  firstSendLamports: number;
  splFeeBumpLamports: number;
  minReimbursementLamports: number;
}

/**
 * CHN-7: absolute ceiling on the consumer Solana paymaster reimbursement
 * (vault -> paymaster) the wallet will build and sign, whatever fee schedule
 * the relay serves. A legitimate first send with an SPL ATA bump is ~0.0057
 * SOL; 0.05 SOL matches the enterprise vault ceiling.
 */
export const SOL_CONSUMER_MAX_FEE_LAMPORTS = 50_000_000;

/**
 * Effective cap = min(0.05 SOL, min(maxTxFeeUSD, USD 100) worth of SOL) — the
 * same ceiling the SSP Key enforces, so the wallet never builds a send the Key
 * refuses. A missing or non-finite price leaves the absolute ceiling in force.
 */
export function solPaymasterFeeCapLamports(
  solUsdPrice: number | undefined,
  maxTxFeeUSD: number | undefined,
  decimals = 9,
): bigint {
  let cap = BigInt(SOL_CONSUMER_MAX_FEE_LAMPORTS);
  const usdLimit = effectiveMaxFeeUsd(maxTxFeeUSD);
  if (
    typeof solUsdPrice === 'number' &&
    Number.isFinite(solUsdPrice) &&
    solUsdPrice > 0
  ) {
    const usdCap = new BigNumber(usdLimit)
      .dividedBy(solUsdPrice)
      .multipliedBy(new BigNumber(10).pow(decimals))
      .integerValue(BigNumber.ROUND_FLOOR);
    if (usdCap.isFinite() && usdCap.isLessThan(cap.toString())) {
      cap = BigInt(usdCap.toFixed(0));
    }
  }
  return cap;
}

/**
 * Throws when the reimbursement is not a base-unit integer or exceeds the cap
 * (never more than the absolute ceiling, whatever cap is passed in).
 */
export function assertSolPaymasterFeeWithinCap(
  feeLamports: string,
  capLamports: bigint = BigInt(SOL_CONSUMER_MAX_FEE_LAMPORTS),
): void {
  if (typeof feeLamports !== 'string' || !/^\d+$/.test(feeLamports)) {
    throw new Error('Invalid Solana paymaster fee');
  }
  const absolute = BigInt(SOL_CONSUMER_MAX_FEE_LAMPORTS);
  const cap = capLamports > absolute ? absolute : capLamports;
  if (BigInt(feeLamports) > cap) {
    throw new Error(
      `Solana fee ${new BigNumber(feeLamports)
        .dividedBy(1e9)
        .toFixed()} SOL exceeds the maximum allowed fee of ${new BigNumber(
        cap.toString(),
      )
        .dividedBy(1e9)
        .toFixed()} SOL`,
    );
  }
}

/**
 * The `tx` action payload the SSP Key co-signs for a consumer Solana send.
 *
 * Native SOL stays bare base64 (old Keys handle it unchanged). SPL sends are
 * JSON-wrapped with the token metadata plus, per the SOL-SPL contract (H-3):
 *  - splRecipientOwner: the base58 OWNER address the user typed, so the Key
 *    derives the destination ATA itself, requires it to equal the
 *    TransferChecked destination in the bytes, and displays the owner;
 *  - splMint: the mint the Key derives that ATA for.
 * The Key ignores the wallet-supplied symbol (it uses its own token list).
 */
export function buildSolKeyActionPayload(
  signedTxBase64: string,
  token?: {
    mint: string;
    symbol: string;
    decimals: number;
    recipientOwner: string;
  },
): string {
  if (!token) {
    return signedTxBase64;
  }
  return JSON.stringify({
    unsignedTxBase64: signedTxBase64,
    tokenMint: token.mint,
    tokenSymbol: token.symbol,
    tokenDecimals: token.decimals,
    splRecipientOwner: token.recipientOwner,
    splMint: token.mint,
  });
}

/** Base58 recipient check — lifted from legacy SendSOL validateRecipient. */
export function validateSolRecipient(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

/**
 * Schedule-derived automatic fee in SOL — lifted math from the legacy
 * SendSOL autoFee effect. destAtaExists === true drops the SPL bump; null
 * (unknown) keeps it defensively.
 */
export function computeSolAutoFee(
  schedule: SolFeeSchedule | null,
  needsInit: boolean,
  isSpl: boolean,
  destAtaExists: boolean | null,
  decimals: number,
): string {
  if (!schedule) {
    return '0';
  }
  const baseLamports = needsInit
    ? schedule.firstSendLamports
    : schedule.subsequentSendLamports;
  const needsAtaBump = isSpl && destAtaExists !== true;
  const totalLamports =
    baseLamports + (needsAtaBump ? schedule.splFeeBumpLamports : 0);
  return new BigNumber(totalLamports).dividedBy(10 ** decimals).toFixed();
}

/**
 * MAX — lifted math from the legacy SendSOL useMaximum effect. Native SOL:
 * balance minus fee (both from the vault SOL balance); SPL tokens: full
 * token balance (fee comes from vault SOL).
 */
export function computeSolMax(
  spendableBase: string,
  decimals: number,
  isNative: boolean,
  feeSol: string,
): string {
  const max = new BigNumber(spendableBase).dividedBy(10 ** decimals);
  if (isNative) {
    const remaining = max.minus(new BigNumber(feeSol || '0'));
    return remaining.isGreaterThan(0) ? remaining.toFixed() : '0';
  }
  return max.toFixed();
}

/**
 * Insufficient-balance check shared by the live amount validation and the
 * compose → review gate. Native SOL: amount + paymaster fee both come out of
 * the vault SOL balance. SPL: only the token amount is checked here (the fee
 * is paid in vault SOL and is verified at submit time). An unparseable
 * amount/fee/balance is NOT reported as exceeding — the amount field's own
 * "invalid amount" rule owns that case.
 */
export function solAmountExceedsBalance(
  sendingAmount: string,
  feeSol: string,
  spendableBase: string,
  tokenDecimals: number,
  chainDecimals: number,
  isNative: boolean,
): boolean {
  const amount = parseAmount(sendingAmount || '0');
  const fee = isNative ? parseAmount(feeSol || '0') : new BigNumber(0);
  const spendable = parseAmount(spendableBase || '0');
  if (!amount || !fee || !spendable) {
    return false;
  }
  const totalBase = amount
    .multipliedBy(10 ** tokenDecimals)
    .plus(fee.multipliedBy(10 ** chainDecimals));
  return totalBase.isGreaterThan(spendable);
}
