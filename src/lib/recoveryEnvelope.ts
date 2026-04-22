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
import {
  encrypt as passworderEncrypt,
  decrypt as passworderDecrypt,
} from '@metamask/browser-passworder';
import { Buffer } from 'buffer';

import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';
import { eciesEncrypt, eciesDecrypt } from './recoveryCrypto';
import { getFingerprint } from './fingerprint';

const STORAGE_KEY = 'recovery_v1';
const RECOVERY_TYPE_INDEX = 11;
const IDENTITY_TYPE_INDEX = 10;
const FIXED_ADDRESS_INDEX = 0;

export interface RecoveryEnvelopeV1 {
  version: 1;
  wkIdentity: string;
  keyIdentityPubKey: string; // hex, 33-byte compressed — ssp-key /10/0 pubkey used for ECDH in recovery
  blob: string; // hex, ECIES(pk_r, passworderEncrypt(userPassword, randomParams))
  createdAt: number;
}

/**
 * Derive the ssp-key-side pubkeys needed for the envelope and later recovery:
 *   - pk_r at /11/0: target of the ECIES outer wrap.
 *   - identity pub at /10/0: used at recovery time as the ECDH peer key
 *     when unwrapping the transit-wrapped sk_r from ssp-key. Same key the
 *     wallet already derives implicitly for wkIdentity multisig.
 */
function deriveKeyPubKeys(
  xpubKeyIdentity: string,
  identityChain: keyof cryptos,
): { pkR: Buffer; keyIdentityPub: Buffer } {
  const bipParams = blockchains[identityChain].bip32;
  const masterHdKey = HDKey.fromExtendedKey(xpubKeyIdentity, bipParams);

  const recoveryChild = masterHdKey
    .deriveChild(RECOVERY_TYPE_INDEX)
    .deriveChild(FIXED_ADDRESS_INDEX);
  const identityChild = masterHdKey
    .deriveChild(IDENTITY_TYPE_INDEX)
    .deriveChild(FIXED_ADDRESS_INDEX);

  if (!recoveryChild.publicKey || !identityChild.publicKey) {
    throw new Error('Failed to derive pubkeys from xpubKeyIdentity');
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
 * @param wkIdentity 2-of-2 multisig identity address (public).
 * @param identityChain the identity chain key (e.g., 'btc').
 */
export async function buildRecoveryEnvelope(params: {
  userPassword: string;
  randomParams: string;
  xpubKeyIdentity: string;
  wkIdentity: string;
  identityChain: keyof cryptos;
}): Promise<RecoveryEnvelopeV1> {
  const {
    userPassword,
    randomParams,
    xpubKeyIdentity,
    wkIdentity,
    identityChain,
  } = params;

  if (randomParams.length !== 128) {
    throw new Error(
      `randomParams must be 128 hex chars, got ${randomParams.length}`,
    );
  }
  if (!userPassword) {
    throw new Error('userPassword is required');
  }

  const { pkR, keyIdentityPub } = deriveKeyPubKeys(
    xpubKeyIdentity,
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
    version: 1,
    wkIdentity,
    keyIdentityPubKey: keyIdentityPub.toString('hex'),
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
  envelope: RecoveryEnvelopeV1;
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
export function persistRecoveryEnvelope(envelope: RecoveryEnvelopeV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

/**
 * Read the envelope from plain localStorage. Returns null if not present
 * or unparseable, or if the version is unknown. This is intentionally
 * permissive on missing data (caller falls back to L5 error), but strict
 * on malformed structures (bugs should surface, not get silently ignored).
 */
export function readRecoveryEnvelope(): RecoveryEnvelopeV1 | null {
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
  if (obj.version !== 1) return null;
  if (
    typeof obj.wkIdentity !== 'string' ||
    typeof obj.keyIdentityPubKey !== 'string' ||
    typeof obj.blob !== 'string' ||
    typeof obj.createdAt !== 'number'
  ) {
    return null;
  }
  return {
    version: 1,
    wkIdentity: obj.wkIdentity,
    keyIdentityPubKey: obj.keyIdentityPubKey,
    blob: obj.blob,
    createdAt: obj.createdAt,
  };
}

/**
 * Remove the stored envelope. Used when the user resets the wallet.
 */
export function clearRecoveryEnvelope(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Build and persist the recovery envelope if it doesn't already exist.
 *
 * Called from Home.tsx once WK pairing provides xpubKeyIdentity and a
 * `passwordBlob` session cache exists. Covers both first-time setup
 * (new Create/Restore installs) and migration for existing users who
 * predate this feature — their next successful login populates the
 * envelope automatically.
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

  if (readRecoveryEnvelope()) return;
  if (!passwordBlob || !xpubKeyIdentity || !wkIdentity) return;

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
      wkIdentity,
      identityChain,
    });
    persistRecoveryEnvelope(envelope);
  } catch (error) {
    // Best-effort — don't block login on envelope build failure.
    console.warn('[recovery] ensureRecoveryEnvelope failed:', error);
  }
}
