/**
 * VD-3 as one call: verify the descriptor (checks 1-5), bind the request to
 * it, and apply the pin (check 6). Used by every enterprise vault dialog at
 * display time and again at sign time.
 */

import {
  VaultDescriptorError,
  assertRequestMatchesDescriptor,
  verifyVaultDescriptor,
  type VerifiedVaultDescriptor,
} from './vaultDescriptor';
import {
  VaultPinConflictError,
  VaultPinStorageError,
  checkVaultPin,
  pinVaultDescriptor,
  type VaultPinRecord,
  type VaultPinStorage,
} from './vaultPins';

export const VAULT_PIN_MISMATCH_MESSAGE =
  'The configuration of this vault changed since you confirmed it. The request was refused.';

export interface VaultGateResult {
  verified: VerifiedVaultDescriptor;
  /** null = first sight: the user must confirm before anything proceeds. */
  pin: VaultPinRecord | null;
}

export interface VaultRequestBinding {
  chain: string;
  orgIndex: number;
  vaultIndex: number;
  /** When the request names a signing mode, it must be the vault's. */
  signingMode?: string;
}

/**
 * Throws VaultDescriptorError ('pin_mismatch' for a changed pinned vault,
 * 'pin_storage' when pins cannot be read).
 */
export function verifyVaultGate(params: {
  descriptor: unknown;
  descriptorHash: unknown;
  wkIdentity: string;
  ownAccountXpub: string;
  request: VaultRequestBinding | null;
  storage?: VaultPinStorage;
}): VaultGateResult {
  const verified = verifyVaultDescriptor(
    params.descriptor,
    params.descriptorHash,
    params.wkIdentity,
    'wallet',
    params.ownAccountXpub,
  );
  if (params.request) {
    assertRequestMatchesDescriptor(verified.descriptor, params.request);
  }
  let pinStatus;
  try {
    pinStatus = checkVaultPin(verified, params.storage);
  } catch (error) {
    throw new VaultDescriptorError(
      'pin_storage',
      error instanceof VaultPinStorageError
        ? error.message
        : 'Vault pins could not be read',
    );
  }
  if (pinStatus.status === 'mismatch') {
    throw new VaultDescriptorError('pin_mismatch', VAULT_PIN_MISMATCH_MESSAGE);
  }
  return {
    verified,
    pin: pinStatus.status === 'match' ? pinStatus.pin : null,
  };
}

const NOT_PINNED_MESSAGE = 'This vault has not been confirmed on this device';

/**
 * Sign-time form: the vault must already be pinned to exactly this hash, or
 * the user confirmed exactly this hash on the pin screen of THIS request
 * (`stagedHash`, not saved yet — see commitVaultPin).
 */
export function verifyPinnedVaultGate(
  params: Parameters<typeof verifyVaultGate>[0],
  stagedHash: string | null = null,
): VerifiedVaultDescriptor {
  const result = verifyVaultGate(params);
  if (result.pin) return result.verified;
  if (stagedHash && stagedHash === result.verified.hash) {
    return result.verified;
  }
  throw new VaultDescriptorError('not_pinned', NOT_PINNED_MESSAGE);
}

/**
 * Save the pin of a first-sight vault, called only once the request passed
 * every sign-time check (VD-3 and VD-4) and right before this device's key is
 * used for it (nonce burn, signature or forwarding to SSP Key). A confirmation
 * that never reaches a signature leaves nothing pinned.
 *
 * Throws VaultDescriptorError: 'pin_mismatch' when the vault or its derivation
 * slot was pinned to another configuration meanwhile, 'not_pinned' without a
 * staged confirmation of exactly this hash, 'pin_storage' when the pin cannot
 * be saved.
 */
export function commitVaultPin(
  verified: VerifiedVaultDescriptor,
  stagedHash: string | null,
  vaultName: string,
  storage?: VaultPinStorage,
): VaultPinRecord {
  let status;
  try {
    status = checkVaultPin(verified, storage);
  } catch (error) {
    throw new VaultDescriptorError(
      'pin_storage',
      error instanceof VaultPinStorageError
        ? error.message
        : 'Vault pins could not be read',
    );
  }
  if (status.status === 'mismatch') {
    throw new VaultDescriptorError('pin_mismatch', VAULT_PIN_MISMATCH_MESSAGE);
  }
  if (status.status === 'match') return status.pin;
  if (!stagedHash || stagedHash !== verified.hash) {
    throw new VaultDescriptorError('not_pinned', NOT_PINNED_MESSAGE);
  }
  try {
    return pinVaultDescriptor(verified, vaultName, storage);
  } catch (error) {
    if (error instanceof VaultPinConflictError) {
      throw new VaultDescriptorError(
        'pin_mismatch',
        VAULT_PIN_MISMATCH_MESSAGE,
      );
    }
    throw new VaultDescriptorError(
      'pin_storage',
      error instanceof Error ? error.message : 'Vault pin not saved',
    );
  }
}

/** errorCodes SSP Enterprise understands for vault refusals (VD). */
export const VAULT_ERROR_CODES = {
  /** A pinned vault's descriptor hash changed. */
  changed: 'VAULT_DESCRIPTOR_CHANGED',
  /** The app sent no descriptor (update required). */
  missing: 'VAULT_DESCRIPTOR_MISSING',
  /** The user cancelled the pin confirmation (or never confirmed). */
  pinRefused: 'VAULT_PIN_REFUSED',
  /** Verification or derivation failed. */
  invalid: 'VAULT_DESCRIPTOR_INVALID',
} as const;

const KNOWN_VAULT_ERROR_CODES: ReadonlySet<string> = new Set(
  Object.values(VAULT_ERROR_CODES),
);

/**
 * SSP Key refusal -> the errorCode to forward to SSP Enterprise. Only the
 * known VD codes pass through; anything else stays the caller's fallback.
 *
 * SSP Key sends `errorCode` (the agreed field). `code` is read too, as a
 * defensive fallback for a Key build that posted it under that name.
 */
export function vaultErrorCodeFromKey(raw: unknown): string | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return KNOWN_VAULT_ERROR_CODES.has(raw) ? raw : null;
    }
  }
  if (value && typeof value === 'object') {
    for (const field of ['errorCode', 'code'] as const) {
      const code = (value as Record<string, unknown>)[field];
      if (typeof code === 'string' && KNOWN_VAULT_ERROR_CODES.has(code)) {
        return code;
      }
    }
  }
  return null;
}

/**
 * The request an SSP Key `enterprisevaultsignrejected` payload names, or null
 * when it names none (older Key builds post `{}`; such a rejection still
 * applies to the request being waited on).
 */
export function keyRejectionRequestId(raw: unknown): string | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object') {
    const requestId = (value as { requestId?: unknown }).requestId;
    if (typeof requestId === 'string' && requestId) return requestId;
  }
  return null;
}

/** errorCode returned to SSP Enterprise for a refused descriptor. */
export function vaultGateErrorCode(code: VaultDescriptorError['code']): string {
  switch (code) {
    case 'missing':
      return VAULT_ERROR_CODES.missing;
    case 'pin_mismatch':
      return VAULT_ERROR_CODES.changed;
    case 'not_pinned':
      return VAULT_ERROR_CODES.pinRefused;
    default:
      return VAULT_ERROR_CODES.invalid;
  }
}
