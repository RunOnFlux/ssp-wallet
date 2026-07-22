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

export interface SolFeeSchedule {
  subsequentSendLamports: number;
  firstSendLamports: number;
  splFeeBumpLamports: number;
  minReimbursementLamports: number;
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
