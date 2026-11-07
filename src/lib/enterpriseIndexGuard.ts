/**
 * H-1 (wallet side, defence in depth): enterprise derivation indices.
 *
 * Enterprise keys live at m/48'/coin'/orgIndex'/scriptType'/vaultIndex/
 * addressIndex with orgIndex in 100..99999. orgIndex 0 is the consumer
 * account and 99 the recovery account, so a request that smuggles either in
 * would make an "enterprise" dialog sign with consumer or recovery keys.
 * sspConnectContext already caps orgIndex at receipt; every enterprise
 * handler re-checks at sign time, rejecting non-number types.
 */

export const ENTERPRISE_ORG_INDEX_MIN = 100;
export const ENTERPRISE_ORG_INDEX_MAX = 99999;
/** Non-hardened BIP32 child index bound. */
export const BIP32_CHILD_INDEX_LIMIT = 2 ** 31;

export function isValidEnterpriseOrgIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= ENTERPRISE_ORG_INDEX_MIN &&
    value <= ENTERPRISE_ORG_INDEX_MAX
  );
}

export function isValidChildIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < BIP32_CHILD_INDEX_LIMIT
  );
}

/** Printable form of an untrusted index value (never "[object Object]"). */
function describeIndex(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string'
    ? String(value)
    : typeof value;
}

export class EnterpriseIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnterpriseIndexError';
  }
}

/**
 * Throws EnterpriseIndexError unless orgIndex is an integer in 100..99999 and
 * every supplied vault/address index is an integer in [0, 2^31).
 */
export function assertEnterpriseIndices(indices: {
  orgIndex: unknown;
  vaultIndex?: unknown;
  addressIndexes?: unknown[];
}): void {
  if (!isValidEnterpriseOrgIndex(indices.orgIndex)) {
    throw new EnterpriseIndexError(
      `Invalid organisation index ${describeIndex(indices.orgIndex)} — enterprise requests must use 100-99999`,
    );
  }
  if ('vaultIndex' in indices && !isValidChildIndex(indices.vaultIndex)) {
    throw new EnterpriseIndexError(
      `Invalid vault index ${describeIndex(indices.vaultIndex)}`,
    );
  }
  for (const addressIndex of indices.addressIndexes ?? []) {
    if (!isValidChildIndex(addressIndex)) {
      throw new EnterpriseIndexError(
        `Invalid address index ${describeIndex(addressIndex)}`,
      );
    }
  }
}

/** Non-throwing check for render-time gating. */
export function enterpriseIndicesError(indices: {
  orgIndex: unknown;
  vaultIndex?: unknown;
  addressIndexes?: unknown[];
}): string | null {
  try {
    assertEnterpriseIndices(indices);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid enterprise index';
  }
}

/**
 * Address index of an input-details entry: undefined means the legacy default
 * 0; anything else must be a valid child index (non-number types rejected).
 */
export function inputAddressIndex(input: unknown): number {
  const value =
    input && typeof input === 'object'
      ? (input as { addressIndex?: unknown }).addressIndex
      : undefined;
  if (value === undefined) return 0;
  if (!isValidChildIndex(value)) {
    throw new EnterpriseIndexError(
      `Invalid address index ${describeIndex(value)}`,
    );
  }
  return value;
}
