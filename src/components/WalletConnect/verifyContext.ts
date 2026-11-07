/**
 * WalletConnect Verify API assessment (security review WEXT-5).
 *
 * A WalletConnect peer DECLARES its own name, URL and icon; any phishing dApp
 * can call itself "Uniswap / https://app.uniswap.org". The Verify API attaches
 * `verifyContext.verified` to every proposal and request: the origin the
 * connection really came from, whether it matches the declared domain
 * (`validation`), and whether it is on the scam list (`isScam`). These helpers
 * turn that into one status every modal renders the same way, and the context
 * enforces (scam → refuse, invalid → explicit confirmation).
 */

export type VerifyStatus = 'valid' | 'unknown' | 'invalid' | 'scam';

export interface VerifyAssessment {
  status: VerifyStatus;
  /** The origin the Verify API saw, when it reported one. */
  verifiedOrigin: string | null;
  /** The peer's self-declared URL, as given. */
  claimedUrl: string | null;
}

interface VerifiedLike {
  origin?: unknown;
  validation?: unknown;
  isScam?: unknown;
}

function originOf(url: string): string | null {
  try {
    const { origin } = new URL(url);
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}

/**
 * Classify a proposal's or request's `verifyContext`.
 *
 * - `scam`: Verify flags the origin as malicious → the request is refused.
 * - `invalid`: the declared domain does not match where the connection came
 *   from (Verify said INVALID, or the reported origin differs from the
 *   declared URL) → shown as a likely impersonation, approval needs an
 *   explicit extra confirmation.
 * - `valid`: Verify confirmed the declared domain.
 * - `unknown`: Verify could not tell (no attestation) → labelled unverified.
 */
export function assessVerifyContext(
  verifyContext: unknown,
  claimedUrl?: string | null,
): VerifyAssessment {
  const verified: VerifiedLike =
    verifyContext &&
    typeof verifyContext === 'object' &&
    (verifyContext as { verified?: unknown }).verified &&
    typeof (verifyContext as { verified?: unknown }).verified === 'object'
      ? ((verifyContext as { verified: VerifiedLike }).verified ?? {})
      : {};
  const verifiedOrigin =
    typeof verified.origin === 'string' && verified.origin
      ? verified.origin
      : null;
  const claimed =
    typeof claimedUrl === 'string' && claimedUrl ? claimedUrl : null;

  let status: VerifyStatus;
  if (verified.isScam === true) {
    status = 'scam';
  } else if (verified.validation === 'INVALID') {
    status = 'invalid';
  } else if (verified.validation === 'VALID') {
    status = 'valid';
  } else {
    status = 'unknown';
  }

  // A reported origin that differs from the declared domain is a mismatch
  // whatever the validation flag says.
  if (status !== 'scam' && verifiedOrigin && claimed) {
    const verifiedOriginNormalised = originOf(verifiedOrigin);
    const claimedOrigin = originOf(claimed);
    if (
      verifiedOriginNormalised &&
      claimedOrigin &&
      verifiedOriginNormalised !== claimedOrigin
    ) {
      status = 'invalid';
    }
  }

  return { status, verifiedOrigin, claimedUrl: claimed };
}

/** Approval impossible: the origin is a known scam. */
export function isVerifyBlocked(assessment: VerifyAssessment): boolean {
  return assessment.status === 'scam';
}

/** Approval needs the user's explicit acknowledgement of the mismatch. */
export function verifyNeedsAcknowledgement(
  assessment: VerifyAssessment,
): boolean {
  return assessment.status === 'invalid';
}

/**
 * The URL to present as the requester: the verified origin when the Verify
 * API reported one, otherwise the declared URL (labelled unverified).
 */
export function displayOrigin(assessment: VerifyAssessment): string {
  return assessment.verifiedOrigin || assessment.claimedUrl || '';
}

/**
 * Lower-cased addresses the session's eip155 namespace grants (CAIP-10
 * `eip155:<chainId>:<address>`), optionally only for one chain (WEXT-6).
 */
export function sessionAccountAddresses(
  accounts: unknown,
  chainId?: number | null,
): string[] {
  if (!Array.isArray(accounts)) return [];
  const out: string[] = [];
  for (const account of accounts) {
    if (typeof account !== 'string') continue;
    const parts = account.split(':');
    if (parts.length !== 3 || parts[0] !== 'eip155') continue;
    const accountChainId = Number(parts[1]);
    if (
      typeof chainId === 'number' &&
      Number.isFinite(chainId) &&
      accountChainId !== chainId
    ) {
      continue;
    }
    const address = parts[2];
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) continue;
    if (
      !out.some((existing) => existing.toLowerCase() === address.toLowerCase())
    ) {
      out.push(address);
    }
  }
  return out;
}

/** Is `address` one of the accounts the user shared with this session? */
export function isSessionAccount(accounts: unknown, address: unknown): boolean {
  if (typeof address !== 'string' || !address) return false;
  const wanted = address.toLowerCase();
  return sessionAccountAddresses(accounts).some(
    (account) => account.toLowerCase() === wanted,
  );
}
