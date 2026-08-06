/**
 * Fetching ssp-key's recovery account xpub.
 *
 * The wallet needs it to seal a recovery envelope. ssp-key publishes it to a
 * persistent relay record on every app open, and the wallet reads that record
 * whenever it needs one — no live round trip with the phone, so the two apps
 * never have to be awake at the same moment.
 *
 * The relay is storage only — the record it serves is checked against ssp-key's
 * signature before use, which happens in `storeRecoveryXpub`. This module just
 * fetches it.
 */

import axios from 'axios';

const REQUEST_TIMEOUT_MS = 15_000;
/**
 * A wallet pairing for the first time can reach this before ssp-key has
 * published, so a miss is retried briefly rather than written off until the
 * next unlock.
 */
const RETRY_DELAYS_MS = [0, 4_000, 12_000];

export interface RecoveryPubRecord {
  recoveryXpub: string;
  /**
   * ssp-key's detached signature over the xpub. Deliberately NOT called
   * `signature` on the wire: that name belongs to the relay's request-auth
   * envelope and is stripped from bodies before any handler sees them.
   */
  xpubSignature: string;
}

interface RelayRecoveryPubResponse {
  recoveryXpub?: unknown;
  xpubSignature?: unknown;
}

async function fetchOnce(
  relay: string,
  wkIdentity: string,
): Promise<RecoveryPubRecord | null> {
  try {
    const res = await axios.get<RelayRecoveryPubResponse>(
      `https://${relay}/v1/recoverypub/${wkIdentity}`,
      { timeout: REQUEST_TIMEOUT_MS },
    );
    const record = res.data;
    if (
      !record ||
      typeof record.recoveryXpub !== 'string' ||
      typeof record.xpubSignature !== 'string' ||
      !record.recoveryXpub ||
      !record.xpubSignature
    ) {
      return null;
    }
    return {
      recoveryXpub: record.recoveryXpub,
      xpubSignature: record.xpubSignature,
    };
  } catch {
    // Nothing published yet is the common case, and it 404s.
    return null;
  }
}

/**
 * Read ssp-key's recovery account xpub record from the relay.
 *
 * @returns the record, or null when nothing is published yet — the caller
 *   verifies it and simply tries again in a later session.
 */
export async function requestRecoveryXpub(params: {
  wkIdentity: string;
  relay: string;
  /** Aborts the retry loop early, e.g. when the view unmounts. */
  isCancelled?: () => boolean;
}): Promise<RecoveryPubRecord | null> {
  const { wkIdentity, relay, isCancelled } = params;
  if (!wkIdentity) return null;

  for (const delay of RETRY_DELAYS_MS) {
    if (isCancelled?.()) return null;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (isCancelled?.()) return null;
    }
    const record = await fetchOnce(relay, wkIdentity);
    if (record) return record;
  }
  return null;
}
