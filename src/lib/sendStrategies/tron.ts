/**
 * TRON send strategy — pure helpers.
 *
 * Fee model (TRON_SSP_CONTRACT.md §4, §6): SSP's sponsor pays the energy and
 * the vault pays SSP a fee inside the same signed Op, TRX by default and USDT
 * only when the vault has no TRX. The fee is a relay quote, not a speed
 * market, so there are no Slow/Fast presets: the user picks the fee TOKEN (when
 * both are possible) or, in Advanced, pays the network fee themselves (SSP Key
 * self-submits from its own TRON account; fee 0 in the Op).
 *
 * Quote, Op building and signing live in lib/tron.ts; the stateful hook
 * (useTronSendStrategy) calls them.
 */
import { parseAmount } from './amount';
import { TRON_TRX_FEE_TOKEN } from '../tron';

/**
 * User-typed units → base units, or null when not a positive amount with at
 * most `decimals` fractional digits. Exact (no floating point).
 */
export function tronUnitsToBase(
  units: string,
  decimals: number,
): bigint | null {
  const parsed = parseAmount(units || '');
  if (!parsed || parsed.lte(0)) return null;
  const base = parsed.multipliedBy(10 ** decimals);
  if (!base.isInteger()) return null;
  return BigInt(base.toFixed(0));
}

/** Whether a fee token is the same asset as the one being sent. */
export function tronFeeIsSendAsset(
  feeToken: string,
  assetContract: string,
): boolean {
  if (!assetContract) return feeToken === TRON_TRX_FEE_TOKEN;
  return feeToken === assetContract;
}

/**
 * Amount (+ fee when it is paid in the same asset) exceeds the balance of that
 * asset? A fee in the OTHER asset must fit that asset's balance. Unknown
 * inputs are not reported as exceeding (the field's own rule owns that).
 */
export function tronAmountExceedsBalance(p: {
  amountBase: bigint | null;
  assetBalance: bigint;
  fee: { token: string; amount: bigint } | null;
  assetContract: string;
  feeTokenBalance: bigint | null;
}): boolean {
  if (p.amountBase === null) return false;
  const sameAsset = p.fee
    ? tronFeeIsSendAsset(p.fee.token, p.assetContract)
    : false;
  const needed = p.amountBase + (sameAsset && p.fee ? p.fee.amount : 0n);
  if (needed > p.assetBalance) return true;
  if (p.fee && !sameAsset && p.feeTokenBalance !== null) {
    return p.fee.amount > p.feeTokenBalance;
  }
  return false;
}

/**
 * Send-max: the relay's `maxSendable` when it is for this asset, otherwise
 * balance − fee for a same-asset fee, otherwise the whole balance.
 */
export function tronMaxSendable(p: {
  balance: bigint;
  assetContract: string;
  fee: { token: string; amount: bigint } | null;
  maxSendable?: { token: string; amount: string };
}): bigint {
  const ms = p.maxSendable;
  if (ms && /^[0-9]+$/.test(ms.amount)) {
    const forAsset = p.assetContract
      ? ms.token === p.assetContract
      : ms.token === '' ||
        ms.token === 'TRX' ||
        ms.token === TRON_TRX_FEE_TOKEN;
    if (forAsset) {
      const amount = BigInt(ms.amount);
      return amount > p.balance ? p.balance : amount;
    }
  }
  if (p.fee && tronFeeIsSendAsset(p.fee.token, p.assetContract)) {
    const rest = p.balance - p.fee.amount;
    return rest > 0n ? rest : 0n;
  }
  return p.balance;
}

/** TronError `code` (lib/tron.ts) → send-namespace translation key. */
export function tronSendErrorKey(error: unknown): string | null {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  switch (code) {
    case 'NOT_LIVE':
    case 'NOT_DEPLOYED':
      return 'send:err_tron_not_live';
    case 'QUOTE_FAILED':
      return 'send:err_tron_quote_failed';
    case 'QUOTE_INVALID':
    case 'POLICY':
    case 'INVALID_OP':
      return 'send:err_tron_quote_invalid';
    case 'QUOTE_EXPIRED':
      return 'send:err_tron_quote_expired';
    case 'SPONSOR_UNAVAILABLE':
      return 'send:tron_sponsor_unavailable';
    case 'VAULT_MISMATCH':
    case 'NOT_MEMBER':
      return 'send:err_tron_vault_mismatch';
    case 'FEE_TOO_HIGH':
      return 'send:err_tron_fee_too_high';
    case 'RECIPIENT_BLACKLISTED':
      return 'send:err_tron_recipient_blacklisted';
    case 'VAULT_FROZEN':
      return 'send:err_tron_vault_frozen';
    case 'NETWORK':
    case 'RPC':
    case 'NO_NONCE':
      return 'send:err_tron_network';
    case 'INVALID_ADDRESS':
      return 'send:err_invalid_receiver';
    default:
      return null;
  }
}
