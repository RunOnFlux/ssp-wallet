/**
 * Pairing verification — presentation helpers around the (untouched) crypto in
 * `verificationCode.ts`. This file adds NO cryptography: it only composes the
 * existing `batchVerificationWords` into a single per-session code, formats the
 * scan-to-verify QR payload, and compares a scanned code against this device's
 * own words. Display-only — never logs codes or xpubs.
 *
 * ONE code per pairing session: every chain synced in the session (the identity
 * chain plus any batch/activated chains) is one entry, and the single code is
 * `batchVerificationWords` over that combined set. Both devices aggregate over
 * the same set, so the codes are equal iff no relay substitution happened.
 *
 * This module is kept byte-identical to ssp-key's copy so both devices produce
 * the same code and parse the same QR.
 */
import { batchVerificationWords } from './verificationCode';

export interface VerifyEntry {
  chain: string;
  walletXpub: string;
  keyXpub: string;
}

// Prefix on the scan-to-verify QR payload so the reader can tell a verification
// code apart from an xpub/transaction QR. The code is NOT secret — it is shown
// for machine comparison — so the payload is the plaintext 6-word string.
export const VERIFY_QR_PREFIX = 'sspverify:';

// Per-position accent colours for the numbered word chips. Identical on both
// devices so position 3 looks the same on Wallet and Key, making a side-by-side
// eyeball comparison fast. Applied to the small index badge only (subtle).
export const VERIFY_ACCENTS = [
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
];

/**
 * The single unified verification code covering every chain synced this
 * session. Just `batchVerificationWords` over the combined entry list — the
 * identity chain is one entry among the rest.
 */
export function sessionVerificationWords(entries: VerifyEntry[]): string[] {
  return batchVerificationWords(entries);
}

/** QR payload encoding a verification code for machine comparison. */
export function verificationQrValue(words: string[]): string {
  return `${VERIFY_QR_PREFIX}${words.join(' ')}`;
}

/**
 * Normalise a scanned payload to a bare space-joined code, tolerating a missing
 * prefix and stray whitespace/casing. Returns null for empty input.
 */
export function parseVerificationQr(scanned: string): string | null {
  const trimmed = scanned.trim();
  const body = trimmed.startsWith(VERIFY_QR_PREFIX)
    ? trimmed.slice(VERIFY_QR_PREFIX.length)
    : trimmed;
  const normalised = body.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalised.length ? normalised : null;
}

/**
 * True iff a scanned verification payload equals this device's own words. Any
 * relay substitution, or a scan of the wrong QR, yields false → the UI must
 * fail closed (warn, do NOT proceed). String equality is the comparison
 * primitive: both devices derive their words from their own key view.
 */
export function verificationMatches(
  ownWords: string[],
  scanned: string,
): boolean {
  const scannedCode = parseVerificationQr(scanned);
  if (!scannedCode) return false;
  return scannedCode === ownWords.join(' ').trim().toLowerCase();
}
