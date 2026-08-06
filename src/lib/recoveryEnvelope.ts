/**
 * Recovery Envelope — setup, persistence, and decryption helpers.
 *
 * The recovery envelope protects `randomParams` with two factors:
 *   1. User password — PBKDF2+AES-GCM inner layer (@metamask/browser-passworder)
 *   2. ssp-key-derived sk_r — secp256k1 ECIES outer layer (recoveryCrypto)
 *
 * Envelope is persisted to plain localStorage so it survives a browser
 * fingerprint drift (the event that makes recovery necessary in the first
 * place). All values stored plain are either public keys, public on-chain
 * addresses, or ciphertext that requires both factors to decrypt.
 */

import { HDKey } from '@scure/bip32';
import utxolib from '@runonflux/utxo-lib';
import {
  encrypt as passworderEncrypt,
  decrypt as passworderDecrypt,
} from '@metamask/browser-passworder';
import { Buffer } from 'buffer';

import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';
import { eciesEncrypt, eciesDecrypt } from './recoveryCrypto';
import { verifyRecoveryXpubSignature } from './recoveryXpubVerify';
import { getFingerprint } from './fingerprint';
import { getLibId } from './wallet';

const STORAGE_KEY = 'recovery_v2';
/** Earlier storage key, cleared when the current envelope is written. */
const LEGACY_STORAGE_KEY = 'recovery_v1';
const IDENTITY_TYPE_INDEX = 10;
const FIXED_ADDRESS_INDEX = 0;
/**
 * Non-hardened levels under the recovery account (m/48'/coin'/99'/scriptType').
 * The wallet holds that account's xpub, so it derives pk_r(i) itself and can
 * use a fresh index for each envelope.
 */
const RECOVERY_CHANGE_INDEX = 0;
/** Where the key-side recovery account xpub is cached between sessions. */
const XPUB_STORAGE_KEY = 'recovery_kx';
/** Which index under RECOVERY_CHANGE_INDEX the current envelope uses. */
const INDEX_STORAGE_KEY = 'recovery_ix';
/** Non-hardened child indices are 31-bit. */
const MAX_CHILD_INDEX = 0x7fffffff;

/**
 * Cache ssp-key's recovery account xpub.
 *
 * This is the ONLY way the xpub enters storage, and it is gated on ssp-key's
 * signature over it — checked against the identity pubkey the wallet derives
 * itself from `xpubKeyIdentity`, never anything the relay supplied. So a
 * substituted or malformed record is dropped rather than stored, leaving the
 * next session free to fetch again.
 *
 * @returns whether a usable xpub is now cached.
 */
export function storeRecoveryXpub(params: {
  recoveryXpub: string;
  signature: string;
  wkIdentity: string;
  xpubKeyIdentity: string;
  identityChain: keyof cryptos;
}): boolean {
  const {
    recoveryXpub,
    signature,
    wkIdentity,
    xpubKeyIdentity,
    identityChain,
  } = params;
  if (!recoveryXpub || typeof recoveryXpub !== 'string') return false;
  if (!signature || !wkIdentity || !xpubKeyIdentity) return false;

  let expectedPubKeyHex: string;
  try {
    const identityChild = parseHdKey(xpubKeyIdentity, identityChain)
      .deriveChild(IDENTITY_TYPE_INDEX)
      .deriveChild(FIXED_ADDRESS_INDEX);
    if (!identityChild.publicKey) return false;
    expectedPubKeyHex = Buffer.from(identityChild.publicKey).toString('hex');
  } catch (error) {
    console.log('[recovery] could not derive identity pubkey:', error);
    return false;
  }

  if (
    !verifyRecoveryXpubSignature({
      wkIdentity,
      recoveryXpub,
      signature,
      expectedPubKeyHex,
      identityChain,
    })
  ) {
    console.log('[recovery] account xpub failed verification');
    return false;
  }

  const current = localStorage.getItem(XPUB_STORAGE_KEY);
  if (current === recoveryXpub) return true;
  try {
    const probe = parseHdKey(recoveryXpub, identityChain)
      .deriveChild(RECOVERY_CHANGE_INDEX)
      .deriveChild(0);
    if (!probe.publicKey) return false;
    if (probe.privateKey) {
      // An account-level PUBLIC key is what belongs here.
      return false;
    }
  } catch (error) {
    console.log('[recovery] unusable account xpub:', error);
    return false;
  }
  localStorage.setItem(XPUB_STORAGE_KEY, recoveryXpub);
  // A different account means every index under the old one is meaningless.
  localStorage.removeItem(INDEX_STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  return true;
}

export function readRecoveryXpub(): string | null {
  return localStorage.getItem(XPUB_STORAGE_KEY);
}

/**
 * Pick an index at random rather than counting up.
 *
 * A counter would have to survive every wipe of this origin's storage to stay
 * meaningful — and it does not: a password change reuses the restore pipeline,
 * which clears localStorage. Drawing from the full 31-bit space instead means a
 * fresh envelope lands on an index it has not used before whether or not any
 * previous value survived.
 */
function freshRecoveryIndex(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] & MAX_CHILD_INDEX;
}

/**
 * The index the current envelope is sealed to, choosing and persisting one if
 * there isn't a usable value stored.
 */
function readRecoveryIndex(): number {
  const raw = localStorage.getItem(INDEX_STORAGE_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_CHILD_INDEX) {
    return parsed;
  }
  const chosen = freshRecoveryIndex();
  localStorage.setItem(INDEX_STORAGE_KEY, String(chosen));
  return chosen;
}

/**
 * Move to a new index and drop the envelope sealed to the previous one.
 * Call once a released key has served its purpose, so the next envelope seals
 * to an index of its own.
 */
export function advanceRecoveryIndex(): void {
  localStorage.setItem(INDEX_STORAGE_KEY, String(freshRecoveryIndex()));
  localStorage.removeItem(STORAGE_KEY);
}

export interface RecoveryEnvelopeV2 {
  version: 2;
  wkIdentity: string;
  keyIdentityPubKey: string; // hex, 33-byte compressed — ssp-key /10/0 pubkey used for ECDH in recovery
  /** ssp-key's recovery account xpub (m/48'/coin'/99'/scriptType'). */
  recoveryXpub: string;
  /** Which pk_r(i) under that account this envelope is sealed to. */
  recoveryIndex: number;
  blob: string; // hex, ECIES(pk_r, passworderEncrypt(userPassword, randomParams))
  createdAt: number;
}

/**
 * Parse an xpub with the chain's SSP-custom BIP32 version bytes, falling
 * back to utxolib's network-standard version bytes if the xpub was encoded
 * under the standard scheme. Mirrors the try/catch pattern in wallet.ts's
 * `generateMultisigAddress` — xpubs in SSP can be either encoding.
 */
function parseHdKey(xpub: string, identityChain: keyof cryptos): HDKey {
  const bipParams = blockchains[identityChain].bip32;
  try {
    return HDKey.fromExtendedKey(xpub, bipParams);
  } catch (e) {
    console.log('[recovery] xpub parse fallback:', e);
    const libID = getLibId(identityChain);
    const networkBipParams = utxolib.networks[libID].bip32;
    return HDKey.fromExtendedKey(xpub, networkBipParams);
  }
}

/**
 * Derive the ssp-key-side pubkeys needed for the envelope and later recovery:
 *   - pk_r(i) from the RECOVERY account xpub: target of the ECIES outer wrap.
 *   - identity pub at /10/0 of the identity account: the ECDH peer key when
 *     unwrapping the transit-wrapped sk_r from ssp-key.
 *
 * They come from different accounts by design: the recovery account exists to
 * hold keys that get released, and nothing else.
 */
function deriveKeyPubKeys(
  xpubKeyIdentity: string,
  recoveryXpub: string,
  recoveryIndex: number,
  identityChain: keyof cryptos,
): { pkR: Buffer; keyIdentityPub: Buffer } {
  const recoveryChild = parseHdKey(recoveryXpub, identityChain)
    .deriveChild(RECOVERY_CHANGE_INDEX)
    .deriveChild(recoveryIndex);
  const identityChild = parseHdKey(xpubKeyIdentity, identityChain)
    .deriveChild(IDENTITY_TYPE_INDEX)
    .deriveChild(FIXED_ADDRESS_INDEX);

  if (!recoveryChild.publicKey || !identityChild.publicKey) {
    throw new Error('Failed to derive recovery/identity pubkeys');
  }
  return {
    pkR: Buffer.from(recoveryChild.publicKey),
    keyIdentityPub: Buffer.from(identityChild.publicKey),
  };
}

/**
 * Build the recovery envelope. Call this at wallet setup (after WK pairing
 * delivers xpubKeyIdentity) or at login as a migration for existing users
 * whose randomParams was successfully decrypted.
 *
 * @param userPassword raw password from the form field — NOT the
 *   `password + randomParams` concatenation used elsewhere in the codebase.
 * @param randomParams 128-char hex string (plaintext, 64 bytes).
 * @param xpubKeyIdentity ssp-key's xpub at m/48'/coin_id'/0'/scriptType'.
 * @param recoveryXpub ssp-key's recovery account xpub, from the sync record.
 * @param recoveryIndex which pk_r(i) to seal to.
 * @param wkIdentity 2-of-2 multisig identity address (public).
 * @param identityChain the identity chain key (e.g., 'btc').
 */
export async function buildRecoveryEnvelope(params: {
  userPassword: string;
  randomParams: string;
  xpubKeyIdentity: string;
  recoveryXpub: string;
  recoveryIndex?: number;
  wkIdentity: string;
  identityChain: keyof cryptos;
}): Promise<RecoveryEnvelopeV2> {
  const {
    userPassword,
    randomParams,
    xpubKeyIdentity,
    recoveryXpub,
    wkIdentity,
    identityChain,
  } = params;
  const recoveryIndex = params.recoveryIndex ?? 0;

  if (randomParams.length !== 128) {
    throw new Error(
      `randomParams must be 128 hex chars, got ${randomParams.length}`,
    );
  }
  if (!userPassword) {
    throw new Error('userPassword is required');
  }
  if (!recoveryXpub) {
    throw new Error('recoveryXpub is required');
  }

  const { pkR, keyIdentityPub } = deriveKeyPubKeys(
    xpubKeyIdentity,
    recoveryXpub,
    recoveryIndex,
    identityChain,
  );

  // Inner: password-gated encryption of randomParams. Passworder returns
  // a JSON string containing iv/salt/ciphertext; we treat the whole string
  // as opaque bytes for the ECIES layer.
  const innerString = await passworderEncrypt(userPassword, randomParams);
  const innerBytes = Buffer.from(innerString, 'utf8');

  // Outer: ECIES to pk_r. Only holder of sk_r (ssp-key after biometric)
  // can peel this layer.
  const blobHex = eciesEncrypt(pkR, innerBytes);

  return {
    version: 2,
    wkIdentity,
    keyIdentityPubKey: keyIdentityPub.toString('hex'),
    recoveryXpub,
    recoveryIndex,
    blob: blobHex,
    createdAt: Date.now(),
  };
}

/**
 * Decrypt the recovery envelope once sk_r has been obtained from ssp-key.
 * Returns the plaintext randomParams (128 hex chars).
 *
 * Throws if:
 *   - skR doesn't match the pk_r used at build time (ECIES tag fails)
 *   - userPassword is wrong (passworder throws)
 *   - envelope is malformed
 */
export async function decryptRecoveryEnvelope(params: {
  envelope: RecoveryEnvelopeV2;
  userPassword: string;
  skR: Buffer;
}): Promise<string> {
  const { envelope, userPassword, skR } = params;

  const innerBytes = eciesDecrypt(skR, envelope.blob);
  const innerString = innerBytes.toString('utf8');
  const randomParams = await passworderDecrypt(userPassword, innerString);

  if (typeof randomParams !== 'string' || randomParams.length !== 128) {
    throw new Error('decrypted randomParams has unexpected shape');
  }
  return randomParams;
}

/**
 * Persist the envelope to plain localStorage. Single key so migrations and
 * versioning are clean.
 */
export function persistRecoveryEnvelope(envelope: RecoveryEnvelopeV2): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  // One envelope at a time: writing the current one clears the earlier key so
  // no stale copy is left behind.
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

/**
 * Read the envelope from plain localStorage. Returns null if not present
 * or unparseable, or if the version is unknown. This is intentionally
 * permissive on missing data (caller falls back to L5 error), but strict
 * on malformed structures (bugs should surface, not get silently ignored).
 */
export function readRecoveryEnvelope(): RecoveryEnvelopeV2 | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 2) return null;
  if (
    typeof obj.wkIdentity !== 'string' ||
    typeof obj.keyIdentityPubKey !== 'string' ||
    typeof obj.recoveryXpub !== 'string' ||
    typeof obj.recoveryIndex !== 'number' ||
    typeof obj.blob !== 'string' ||
    typeof obj.createdAt !== 'number'
  ) {
    return null;
  }
  return {
    version: 2,
    wkIdentity: obj.wkIdentity,
    keyIdentityPubKey: obj.keyIdentityPubKey,
    recoveryXpub: obj.recoveryXpub,
    recoveryIndex: obj.recoveryIndex,
    blob: obj.blob,
    createdAt: obj.createdAt,
  };
}

/**
 * Remove the stored envelope. Used when the user resets the wallet.
 */
/**
 * Whether the stored envelope belongs to the pairing in use now.
 *
 * An envelope names the wkIdentity it was built for and the account xpub it is
 * sealed under. Re-pairing changes both, and an envelope from the previous
 * pairing can never be opened, so it does not count as one.
 */
export function isRecoveryEnvelopeCurrent(wkIdentity: string): boolean {
  const envelope = readRecoveryEnvelope();
  if (!envelope) return false;
  if (envelope.wkIdentity !== wkIdentity) return false;
  const cachedXpub = readRecoveryXpub();
  return !cachedXpub || envelope.recoveryXpub === cachedXpub;
}

export function clearRecoveryEnvelope(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

/**
 * Build and persist the recovery envelope if it doesn't already exist.
 *
 * Called from WalletShell once WK pairing provides xpubKeyIdentity, a
 * `passwordBlob` session cache exists, and ssp-key's recovery account xpub has
 * been received. Covers both first-time setup and existing installs — their
 * next successful login populates the envelope automatically.
 *
 * The `passwordBlob` is the session-cached `passworderEncrypt(fingerprint,
 * userPassword + randomParams)`; decrypting it with the current fingerprint
 * yields the concatenated string, from which the last 128 chars are
 * `randomParams` and the prefix is the raw user password.
 *
 * Failures are swallowed intentionally — envelope build is best-effort
 * background work. If the fingerprint decrypts fails here, the user will
 * still get a working login now, and the next successful login will retry.
 */
export async function ensureRecoveryEnvelope(params: {
  passwordBlob: string;
  xpubKeyIdentity: string;
  wkIdentity: string;
  identityChain: keyof cryptos;
}): Promise<void> {
  const { passwordBlob, xpubKeyIdentity, wkIdentity, identityChain } = params;

  if (isRecoveryEnvelopeCurrent(wkIdentity)) return;
  // Nothing reads the earlier key, so drop it rather than leave a sealed blob
  // on disk that no longer corresponds to anything.
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  if (!passwordBlob || !xpubKeyIdentity || !wkIdentity) return;
  const recoveryXpub = readRecoveryXpub();
  // Nothing to seal to yet — requestRecoveryXpub() asks ssp-key for it, and the
  // next call here picks it up.
  if (!recoveryXpub) return;

  try {
    const fingerprint = getFingerprint();
    const passwordWithParams = await passworderDecrypt(
      fingerprint,
      passwordBlob,
    );
    if (typeof passwordWithParams !== 'string') return;
    if (passwordWithParams.length < 128) return;

    const userPassword = passwordWithParams.slice(0, -128);
    const randomParams = passwordWithParams.slice(-128);

    const envelope = await buildRecoveryEnvelope({
      userPassword,
      randomParams,
      xpubKeyIdentity,
      recoveryXpub,
      recoveryIndex: readRecoveryIndex(),
      wkIdentity,
      identityChain,
    });
    persistRecoveryEnvelope(envelope);
  } catch (error) {
    // Best-effort — don't block login on envelope build failure.
    console.warn('[recovery] ensureRecoveryEnvelope failed:', error);
  }
}
