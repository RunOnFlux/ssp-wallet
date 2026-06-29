// SIMULATION_DECODE_MISMATCH detection.
//
// Compares the server-computed advisory `simulation` (recipients/amounts as
// implied by its `decodedCall`) against the device's OWN trustless decode
// (VaultDecodedTx from transactions.ts). On divergence we raise a synthetic
// critical SIMULATION_DECODE_MISMATCH warning so the user is told the server
// preview cannot be trusted.
//
// EVM-ONLY: the server-implied recipient set is derived from `decodedCall`,
// which only the EVM provider populates. UTXO/native providers emit a single
// aggregate balanceChanges entry with no per-recipient `address`, so this guard
// never fires for UTXO chains — those rely solely on the device's authoritative
// VaultDecodedTx (design §6/§7.2).
//
// SAFETY:
//  - DISPLAY-ONLY. This never blocks signing. The device decode stays
//    authoritative; this only DOWNRANKS the server preview and surfaces a
//    banner.
//  - Conservative. We only flag a mismatch when we are confident the server
//    contradicts the device. Missing/partial server data (e.g. status
//    'pending'/'unavailable', no decodedCall) is NOT a mismatch — that is
//    handled as a degradation state, not a contradiction.

import type { VaultDecodedTx } from './transactions';
import type { ProposalSimulation, SimWarning } from '../types/simulation';

function normAddr(a: string | undefined | null): string {
  return (a ?? '').trim().toLowerCase();
}

/**
 * Best-effort set of outbound recipient addresses the SERVER simulation
 * implies, drawn from decodedCall args (transfer/approve recipients/spenders).
 *
 * EVM-ONLY: this reads `decodedCall`, which only the EVM provider populates;
 * UTXO/native simulations carry no decodedCall and no per-recipient address, so
 * this returns an empty set for them (decode-mismatch is EVM-only — UTXO relies
 * on the device's authoritative VaultDecodedTx, design §6).
 *
 * We intentionally keep this loose: the goal is to catch the case where the
 * server claims funds flow to an address the device decode never mentions
 * (a relay lying about effects), not to perfectly reconstruct intent.
 */
function serverImpliedRecipients(sim: ProposalSimulation): Set<string> {
  const out = new Set<string>();
  const args = sim.decodedCall?.args ?? {};
  // Common ABI arg names that denote a counterparty address.
  for (const key of [
    'to',
    'recipient',
    'dst',
    'spender',
    'operator',
    'target',
  ]) {
    const val = args[key];
    if (typeof val === 'string' && val.startsWith('0x') && val.length >= 10) {
      out.add(normAddr(val));
    }
  }
  return out;
}

export interface DecodeMismatchResult {
  mismatch: boolean;
  /** Human-readable reasons (English) for logging/detail; not i18n. */
  reasons: string[];
}

/**
 * Compare server simulation against the device's local decode.
 *
 * Returns mismatch=true only when the server simulation actively contradicts
 * the device decode. Returns false when there is simply not enough comparable
 * data (graceful — the degradation states handle "no preview").
 */
export function detectDecodeMismatch(
  sim: ProposalSimulation | null | undefined,
  decoded: VaultDecodedTx | null | undefined,
): DecodeMismatchResult {
  const reasons: string[] = [];
  if (!sim || !decoded) return { mismatch: false, reasons };
  // Only compare when the server actually claims a usable result.
  if (sim.status !== 'ok' && sim.status !== 'reverted') {
    return { mismatch: false, reasons };
  }
  // If the device decode itself failed, we cannot make a confident comparison.
  if (decoded.error) return { mismatch: false, reasons };

  const deviceRecipients = new Set(
    (decoded.recipients ?? []).map((r) => normAddr(r.address)).filter(Boolean),
  );

  // 1) Recipient divergence: a server-implied counterparty that the device
  //    decode never mentions. Only meaningful if we have BOTH sides populated.
  const serverRecipients = serverImpliedRecipients(sim);
  if (serverRecipients.size > 0 && deviceRecipients.size > 0) {
    for (const addr of serverRecipients) {
      if (!deviceRecipients.has(addr)) {
        reasons.push(
          `Server preview references ${addr} which the device decode does not contain`,
        );
      }
    }
  }

  // 2) Recipient-count divergence for native/token transfers: the server
  //    decoded a transfer-like call but to a different single recipient than
  //    the device sees.
  const method = sim.decodedCall?.method?.toLowerCase();
  if (
    (method === 'transfer' || method === 'transferfrom') &&
    serverRecipients.size > 0 &&
    deviceRecipients.size > 0
  ) {
    const overlap = [...serverRecipients].some((a) => deviceRecipients.has(a));
    if (!overlap) {
      reasons.push(
        'Server-decoded transfer recipient does not match any device recipient',
      );
    }
  }

  // De-duplicate reasons.
  const uniqueReasons = [...new Set(reasons)];
  return { mismatch: uniqueReasons.length > 0, reasons: uniqueReasons };
}

/**
 * Build the synthetic critical SIMULATION_DECODE_MISMATCH warning to prepend to
 * the advisory warning list when a divergence is detected. The English message
 * is a fallback; the client renders an i18n string for the banner heading.
 */
export function buildDecodeMismatchWarning(
  result: DecodeMismatchResult,
): SimWarning {
  return {
    code: 'SIMULATION_DECODE_MISMATCH',
    severity: 'critical',
    message:
      'The advisory risk preview disagrees with this device’s own decode of the transaction. Trust the device decode below, not the preview.',
    detail: result.reasons.join('; ') || undefined,
    provider: 'device',
  };
}
