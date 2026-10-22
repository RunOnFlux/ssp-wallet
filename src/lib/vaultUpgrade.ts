/**
 * Upgrade legacy password-encrypted blobs to the current PBKDF2 cost
 * (security review WEXT-8).
 *
 * Wallets created while the extension shipped @metamask/browser-passworder 4.x
 * (2023-07 → 2024-04) encrypted the seed, the xprivs and the other secrets with
 * PBKDF2-SHA256 at 10,000 iterations — those blobs carry no `keyMetadata`, and
 * passworder never upgrades them by itself. Current blobs use 900,000. After a
 * successful unlock the wallet holds the password, so it re-encrypts every
 * legacy blob it finds at the current cost.
 *
 * Safety properties:
 *  - Verified: every new blob is decrypted again (with a freshly derived key)
 *    and must yield exactly the plaintext of the old blob before anything is
 *    written.
 *  - Atomic: nothing is written unless EVERY candidate was re-encrypted and
 *    verified; a failed write restores every value already replaced.
 *  - Serialised: every secret-blob rewrite runs under one cross-view Web Lock
 *    (VAULT_BLOB_LOCK); without Web Locks nothing is rewritten (fail closed).
 *  - Compare-and-swap against what is PERSISTED: blobs are read from, and
 *    compared with, the raw localStorage value (for react-secure-storage the
 *    ciphertext), never a per-view cache — another wallet view may have
 *    replaced a blob after this view loaded its cache. A blob changed while
 *    this ran is left alone.
 */

import {
  type EncryptionResult,
  decrypt as passworderDecrypt,
  decryptWithKey,
  encrypt as passworderEncrypt,
  generateSalt,
  isVaultUpdated,
  keyFromPassword,
} from '@metamask/browser-passworder';
import { blockchains } from '@storage/blockchains';
import { getScriptType } from './wallet';

/** passworder's current default (DEFAULT_DERIVATION_PARAMS in 6.x). */
export const CURRENT_KEY_DERIVATION = {
  algorithm: 'PBKDF2',
  params: { iterations: 900_000 },
} as const;

/**
 * The storage this runs over (adapters in vaultStorage.ts). Reads never go
 * through a per-view cache: `getRaw` is the persisted representation every
 * wallet view sees (compare-and-swap runs against it) and `getFresh` the
 * value decoded from it.
 */
export interface VaultStorage {
  /** Persisted representation of `key` (raw localStorage string), or null. */
  getRaw: (key: string) => string | null;
  /** The value decoded from the persisted representation, or null. */
  getFresh: (key: string) => unknown;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

/** Cross-view lock held around every secret-blob rewrite. */
export const VAULT_BLOB_LOCK = 'ssp-vault-blobs';
const VAULT_LOCK_TIMEOUT_MS = 120_000;

/** The subset of the Web Locks API used here. */
export interface VaultLockManager {
  request<T>(
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<T>,
  ): Promise<T>;
}

export class VaultLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultLockError';
  }
}

export interface VaultLockOptions {
  /** Defaults to navigator.locks. `null`: treated as unavailable. */
  lockManager?: VaultLockManager | null;
  /** Further locks taken after VAULT_BLOB_LOCK, in this order. */
  extraLocks?: string[];
}

function defaultLockManager(): VaultLockManager | null {
  const nav = (globalThis as { navigator?: { locks?: VaultLockManager } })
    .navigator;
  return nav?.locks && typeof nav.locks.request === 'function'
    ? nav.locks
    : null;
}

/** Run `fn` holding VAULT_BLOB_LOCK (then `extraLocks`). Fails closed. */
async function withVaultLocks<T>(
  options: VaultLockOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const manager =
    options?.lockManager === undefined
      ? defaultLockManager()
      : options.lockManager;
  if (!manager) {
    throw new VaultLockError(
      'Web Locks unavailable — refusing to rewrite wallet secrets',
    );
  }
  const names = [VAULT_BLOB_LOCK, ...(options?.extraLocks ?? [])];
  const acquire = async (index: number): Promise<T> => {
    if (index === names.length) return fn();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VAULT_LOCK_TIMEOUT_MS);
    try {
      return await manager.request(
        names[index],
        { signal: controller.signal },
        () => {
          clearTimeout(timer);
          return acquire(index + 1);
        },
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new VaultLockError('Wallet storage is busy');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  return acquire(0);
}

export interface VaultUpgradeResult {
  /** Keys re-encrypted at the current cost. */
  upgraded: string[];
  /** Legacy keys left alone because another view rewrote them meanwhile. */
  skipped: string[];
}

/**
 * Every secure-storage key that holds a long-lived blob encrypted with the
 * wallet password: the seed and each chain's xpriv / xpub / SSP Key xpub.
 *
 * Deliberately NOT the enterprise nonce pool: react-secure-storage serves
 * reads from a per-view cache, so a rewrite here could replace a pool another
 * wallet view just burned nonces from with this view's stale copy — nonce
 * reuse leaks the key. That pool only ever existed with passworder 6.x
 * (900k iterations), so it never needs this upgrade.
 */
export function passwordVaultKeys(): string[] {
  const keys = ['walletSeed'];
  for (const config of Object.values(blockchains)) {
    const suffix = `48-${config.slip}-0-${getScriptType(config.scriptType)}-${
      config.id
    }`;
    keys.push(`xpriv-${suffix}`, `xpub-${suffix}`, `2-xpub-${suffix}`);
  }
  return Array.from(new Set(keys));
}

/** Is `blob` a passworder vault below the current derivation cost? */
export function isLegacyVault(blob: unknown): blob is string {
  if (typeof blob !== 'string' || !blob) return false;
  try {
    const parsed: unknown = JSON.parse(blob);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).data !== 'string' ||
      typeof (parsed as Record<string, unknown>).iv !== 'string' ||
      typeof (parsed as Record<string, unknown>).salt !== 'string'
    ) {
      return false;
    }
    return !isVaultUpdated(blob, CURRENT_KEY_DERIVATION);
  } catch {
    return false;
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Re-encrypt every legacy blob under `keys` with `password` at the current
 * PBKDF2 cost. Throws (and writes nothing) if any legacy blob fails to decrypt
 * or verify, or when Web Locks are unavailable. Costs two key derivations at
 * the current cost in total: one shared salt and key for all re-encrypted
 * blobs (each with its own random IV), plus one fresh derivation to verify.
 */
export async function upgradeLegacyVaults(
  storage: VaultStorage,
  password: string,
  keys: string[],
  options?: VaultLockOptions,
): Promise<VaultUpgradeResult> {
  if (typeof password !== 'string' || !password) {
    throw new Error('Password required');
  }
  return withVaultLocks(options, () =>
    upgradeLegacyVaultsLocked(storage, password, keys),
  );
}

async function upgradeLegacyVaultsLocked(
  storage: VaultStorage,
  password: string,
  keys: string[],
): Promise<VaultUpgradeResult> {
  const candidates: {
    key: string;
    raw: string | null;
    oldBlob: string;
    plaintext: unknown;
  }[] = [];
  for (const key of keys) {
    // The persisted value, never this view's cache.
    const raw = storage.getRaw(key);
    const blob = storage.getFresh(key);
    if (!isLegacyVault(blob)) continue;
    // Throws on a wrong password or a corrupt blob — abort the whole run.
    const plaintext: unknown = await passworderDecrypt(password, blob);
    candidates.push({ key, raw, oldBlob: blob, plaintext });
  }
  if (!candidates.length) return { upgraded: [], skipped: [] };

  const salt = generateSalt();
  const key = await keyFromPassword(
    password,
    salt,
    false,
    CURRENT_KEY_DERIVATION,
  );
  const reEncrypted: {
    key: string;
    raw: string | null;
    oldBlob: string;
    newBlob: string;
  }[] = [];
  for (const candidate of candidates) {
    const newBlob = await passworderEncrypt(
      password,
      candidate.plaintext,
      key,
      salt,
    );
    reEncrypted.push({
      key: candidate.key,
      raw: candidate.raw,
      oldBlob: candidate.oldBlob,
      newBlob,
    });
  }

  // Verify with a key derived afresh from the password and the new salt, so a
  // bug in the shared-key path cannot pass its own check.
  const verifyKey = await keyFromPassword(
    password,
    salt,
    false,
    CURRENT_KEY_DERIVATION,
  );
  for (let i = 0; i < reEncrypted.length; i += 1) {
    const entry = reEncrypted[i];
    if (!isVaultUpdated(entry.newBlob, CURRENT_KEY_DERIVATION)) {
      throw new Error(`Upgrade produced a legacy blob for ${entry.key}`);
    }
    const roundTrip: unknown =
      i === 0
        ? await passworderDecrypt(password, entry.newBlob)
        : await decryptWithKey(
            verifyKey,
            JSON.parse(entry.newBlob) as EncryptionResult,
          );
    if (!sameValue(roundTrip, candidates[i].plaintext)) {
      throw new Error(`Upgrade verification failed for ${entry.key}`);
    }
  }

  // Commit synchronously (no await below), so no other code in this view runs
  // in between; compare-and-swap against the PERSISTED value, so a blob any
  // view (or any writer that does not take the lock) changed is left alone.
  const upgraded: string[] = [];
  const skipped: string[] = [];
  const written: { key: string; oldBlob: string }[] = [];
  try {
    for (const entry of reEncrypted) {
      if (storage.getRaw(entry.key) !== entry.raw) {
        skipped.push(entry.key);
        continue;
      }
      storage.setItem(entry.key, entry.newBlob);
      written.push({ key: entry.key, oldBlob: entry.oldBlob });
      if (storage.getFresh(entry.key) !== entry.newBlob) {
        throw new Error(`Storage did not keep the upgraded ${entry.key}`);
      }
      upgraded.push(entry.key);
    }
  } catch (error) {
    // Roll back everything this run replaced.
    for (const { key: writtenKey, oldBlob } of written.reverse()) {
      try {
        storage.setItem(writtenKey, oldBlob);
      } catch {
        // best effort — the new blob decrypts with the same password anyway
      }
    }
    throw error;
  }
  return { upgraded, skipped };
}

// ---------------------------------------------------------------------------
// Password rotation (KEY-5 residual: rotate randomParams after a recovery)
// ---------------------------------------------------------------------------

/** One password-encrypted blob: which storage, which key. */
export interface VaultLocation {
  storage: VaultStorage;
  key: string;
}

/**
 * A plain value written in the same all-or-nothing commit as the blobs. It is
 * compare-and-swapped like them: a change by anyone else during the rotation
 * aborts it.
 */
export interface VaultExtraWrite {
  storage: VaultStorage;
  key: string;
  value: string;
}

function isPassworderBlob(blob: unknown): blob is string {
  if (typeof blob !== 'string' || !blob) return false;
  try {
    const parsed: unknown = JSON.parse(blob);
    return (
      !!parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).data === 'string' &&
      typeof (parsed as Record<string, unknown>).iv === 'string' &&
      typeof (parsed as Record<string, unknown>).salt === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Re-encrypt EVERY password blob from `oldPassword` to `newPassword`, together
 * with `extraWrites` (the new randomParams blob), as one all-or-nothing commit.
 *
 * Unlike the iteration upgrade, a partial result would brick the wallet (blobs
 * under two different passwords), so:
 *  - it runs under VAULT_BLOB_LOCK (plus `extraLocks`, e.g. the enterprise
 *    nonce pool lock) and refuses to run without Web Locks;
 *  - every location is read from what is persisted, not a per-view cache;
 *  - any blob that fails to decrypt with the old password — or a persisted
 *    value that is not a blob at all — aborts the run before anything is
 *    written;
 *  - every new blob is verified with a key derived afresh from the new password;
 *  - if ANY location or extra write changed since it was read (raw compare,
 *    absent ones included), nothing is written;
 *  - a failed write restores every value already replaced (extras included).
 *
 * @returns the storage keys that now hold blobs under the new password.
 */
export async function rotateVaultPassword(
  params: {
    locations: VaultLocation[];
    oldPassword: string;
    newPassword: string;
    extraWrites?: VaultExtraWrite[];
  } & VaultLockOptions,
): Promise<{ rotated: string[] }> {
  const { oldPassword, newPassword } = params;
  if (!oldPassword || !newPassword || oldPassword === newPassword) {
    throw new Error('Two different passwords required');
  }
  return withVaultLocks(params, () => rotateVaultPasswordLocked(params));
}

async function rotateVaultPasswordLocked(params: {
  locations: VaultLocation[];
  oldPassword: string;
  newPassword: string;
  extraWrites?: VaultExtraWrite[];
}): Promise<{ rotated: string[] }> {
  const { locations, oldPassword, newPassword, extraWrites = [] } = params;

  // Snapshot of every persisted value this commit depends on.
  const snapshot: { storage: VaultStorage; key: string; raw: string | null }[] =
    [...locations, ...extraWrites].map(({ storage, key }) => ({
      storage,
      key,
      raw: storage.getRaw(key),
    }));
  const candidates: {
    location: VaultLocation;
    plaintext: unknown;
  }[] = [];
  for (const location of locations) {
    if (location.storage.getRaw(location.key) === null) continue;
    const blob = location.storage.getFresh(location.key);
    if (!isPassworderBlob(blob)) {
      // Persisted but unreadable: rotating around it would strand it under
      // the old password.
      throw new Error(`${location.key} could not be read — nothing rotated`);
    }
    // Throws on the wrong password or a corrupt blob — abort everything.
    const plaintext: unknown = await passworderDecrypt(oldPassword, blob);
    candidates.push({ location, plaintext });
  }
  if (!candidates.length) {
    throw new Error('No password-encrypted data to rotate');
  }

  const salt = generateSalt();
  const key = await keyFromPassword(
    newPassword,
    salt,
    false,
    CURRENT_KEY_DERIVATION,
  );
  const newBlobs: string[] = [];
  for (const candidate of candidates) {
    newBlobs.push(
      await passworderEncrypt(newPassword, candidate.plaintext, key, salt),
    );
  }

  const verifyKey = await keyFromPassword(
    newPassword,
    salt,
    false,
    CURRENT_KEY_DERIVATION,
  );
  for (let i = 0; i < newBlobs.length; i += 1) {
    const roundTrip: unknown =
      i === 0
        ? await passworderDecrypt(newPassword, newBlobs[i])
        : await decryptWithKey(
            verifyKey,
            JSON.parse(newBlobs[i]) as EncryptionResult,
          );
    if (!sameValue(roundTrip, candidates[i].plaintext)) {
      throw new Error(
        `Rotation verification failed for ${candidates[i].location.key}`,
      );
    }
  }

  // Commit synchronously (no await below); compare-and-swap against the
  // persisted values of every location and extra write.
  for (const entry of snapshot) {
    if (entry.storage.getRaw(entry.key) !== entry.raw) {
      throw new Error(`${entry.key} changed during rotation — nothing written`);
    }
  }
  const writes: VaultExtraWrite[] = [
    ...candidates.map((candidate, i) => ({
      storage: candidate.location.storage,
      key: candidate.location.key,
      value: newBlobs[i],
    })),
    ...extraWrites,
  ];
  const previous: { write: VaultExtraWrite; prior: unknown }[] = [];
  try {
    for (const write of writes) {
      previous.push({ write, prior: write.storage.getFresh(write.key) });
      write.storage.setItem(write.key, write.value);
      if (write.storage.getFresh(write.key) !== write.value) {
        throw new Error(`Storage did not keep the rotated ${write.key}`);
      }
    }
  } catch (error) {
    for (const { write, prior } of previous.reverse()) {
      try {
        if (typeof prior === 'string') {
          write.storage.setItem(write.key, prior);
        } else {
          write.storage.removeItem?.(write.key);
        }
      } catch {
        // best effort
      }
    }
    throw error;
  }
  return { rotated: candidates.map((candidate) => candidate.location.key) };
}
