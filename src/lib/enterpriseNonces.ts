import axios from 'axios';
import secureLocalStorage from 'react-secure-storage';
import {
  encrypt as passworderEncrypt,
  decrypt as passworderDecrypt,
} from '@metamask/browser-passworder';
import { sspConfig } from '@storage/ssp';
import { getFingerprint } from './fingerprint';
import { generatePublicNonce } from './wallet';
import {
  RelayAuthUnavailableError,
  attachRequiredWkAuth,
  type WkAuthCreator,
} from './relayRequestAuth';
import type { publicPrivateNonce } from '../types';

/**
 * Enterprise (vault) Schnorr nonce pool of this wallet — H-19 / EVM-6 / K2.
 *
 * A MuSig2 nonce pair (k, kTwo) must be used for AT MOST ONE signature: three
 * partial signatures with the same pair reveal the vault key. The pool used to
 * live in react-secure-storage, whose values are loaded ONCE per extension view
 * into an in-memory cache, so a side panel or popup opened earlier kept signing
 * with — and writing back — nonces another view had already burned.
 *
 * Invariants now:
 *  1. Every access reads the pool straight from localStorage (no per-view
 *     cache). The value is the passworder-encrypted JSON of the pool.
 *  2. Every check-and-burn and every replenish write runs inside a cross-view
 *     Web Lock (navigator.locks spans every page of the extension origin).
 *  3. A persistent, append-only set of burned nonce ids is consulted before any
 *     use and filtered out of EVERY write, so no stale snapshot can resurrect a
 *     used nonce.
 *  4. A nonce is burned durably (burned set + pool written) BEFORE its partial
 *     signature is computed, i.e. strictly before anything is posted.
 */

const TARGET_COUNT = 50;
/** Legacy react-secure-storage key — read once for migration, then removed. */
const LEGACY_SECURE_STORAGE_KEY = 'enterpriseNoncesWallet';
/** localStorage key of the passworder-encrypted pool (no per-view cache). */
export const NONCE_POOL_STORAGE_KEY = 'sspEnterpriseNoncesWalletV2';
/** localStorage key of the append-only burned-nonce id list (public data). */
export const BURNED_NONCES_STORAGE_KEY = 'sspEnterpriseNoncesBurnedV1';

/**
 * localStorage key of the partial signatures made with burned nonces (public
 * data, posted to the relay anyway) — lets a failed post be retried with the
 * SAME partial instead of stranding the proposal.
 */
export const NONCE_PARTIALS_STORAGE_KEY = 'sspEnterpriseNoncePartialsV1';
const NONCE_PARTIALS_MAX = 100;
const NONCE_PARTIALS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Cross-view lock guarding the pool, the burned set and the partials. */
export const NONCE_POOL_LOCK = 'ssp-enterprise-nonce-pool';
const POOL_LOCK = NONCE_POOL_LOCK;
const REPLENISH_LOCK = 'ssp-enterprise-nonce-replenish';
const POOL_LOCK_TIMEOUT_MS = 60_000;
const FORCE_REPLENISH_WAIT_MS = 30_000;
const RELAY_TIMEOUT_MS = 30_000;

/**
 * Outcome of a replenish attempt. The function never rejects — background
 * callers fire-and-forget it — so callers that need to know whether nonces
 * actually reached the relay (the manual "Sync Nonces" dialog) read this
 * instead of relying on a thrown error. Mirrors the SSP Key side
 * (ssp-key nonceActions.ts EnterpriseNonceSyncResult).
 */
export interface EnterpriseNonceSyncResult {
  ok: boolean;
  generated: number;
  reason?: 'busy' | 'not_needed' | 'submit_failed' | 'auth_unavailable';
}

/**
 * Relay authentication for the nonce endpoints (RA-2 / RA-4).
 * `createAuth` is useRelayAuth().createWkIdentityAuth.
 * `readHeaders` (optional) returns the RA-4 headers for a signed GET of the
 * given full URL (e.g. useRelayAuth().createReadAuthHeaders('wk', wk, url)).
 */
export interface NonceRelayAuth {
  createAuth: WkAuthCreator;
  readHeaders?: (url: string) => Promise<Record<string, string> | null>;
}

export type EnterpriseNonceErrorCode =
  | 'not_found'
  | 'already_used'
  | 'storage'
  | 'lock';

export class EnterpriseNonceError extends Error {
  readonly code: EnterpriseNonceErrorCode;

  constructor(code: EnterpriseNonceErrorCode, message: string) {
    super(message);
    this.name = 'EnterpriseNonceError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Cross-view lock
// ---------------------------------------------------------------------------

interface LockManagerLike {
  request<T>(
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<T> | T,
  ): Promise<T>;
}

function getLockManager(): LockManagerLike | null {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } })
    .navigator;
  if (nav?.locks && typeof nav.locks.request === 'function') {
    return nav.locks;
  }
  return null;
}

function isBrowserPage(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// In-process fallback for NON-browser contexts only (unit tests / tooling).
// Every supported browser implements the Web Locks API in extension pages;
// a browser page without it refuses to touch the pool (fail closed).
const fallbackLocks = new Map<string, Promise<void>>();

async function fallbackRequest<T>(
  name: string,
  ifAvailable: boolean,
  timeoutMs: number,
  fn: (acquired: boolean) => Promise<T>,
): Promise<T> {
  const previous = fallbackLocks.get(name);
  if (previous && ifAvailable) {
    return fn(false);
  }
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = (previous ?? Promise.resolve()).then(() => current);
  fallbackLocks.set(name, chained);
  try {
    if (previous) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = await Promise.race([
        previous.then(() => false),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(true), timeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (timedOut) {
        throw new EnterpriseNonceError('lock', 'Nonce storage is busy');
      }
    }
    return await fn(true);
  } finally {
    release();
    if (fallbackLocks.get(name) === chained) {
      fallbackLocks.delete(name);
    }
  }
}

/**
 * Run `fn` holding the named cross-view lock. With `ifAvailable`, `fn` gets
 * `false` immediately when another view holds it.
 */
async function withLock<T>(
  name: string,
  options: { ifAvailable?: boolean; timeoutMs?: number },
  fn: (acquired: boolean) => Promise<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? POOL_LOCK_TIMEOUT_MS;
  const locks = getLockManager();
  if (!locks) {
    if (isBrowserPage()) {
      throw new EnterpriseNonceError(
        'lock',
        'Web Locks API unavailable — refusing to use enterprise nonces',
      );
    }
    return fallbackRequest(name, !!options.ifAvailable, timeoutMs, fn);
  }
  if (options.ifAvailable) {
    return locks.request(name, { ifAvailable: true }, (lock) => fn(!!lock));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await locks.request(name, { signal: controller.signal }, () => {
      clearTimeout(timer);
      return fn(true);
    });
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof EnterpriseNonceError)) {
      throw new EnterpriseNonceError('lock', 'Nonce storage is busy');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Direct storage access (no per-view cache)
// ---------------------------------------------------------------------------

function storage(): Storage {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  if (!ls) {
    throw new EnterpriseNonceError('storage', 'Persistent storage unavailable');
  }
  return ls;
}

/**
 * Compact id of a nonce in the burned set: lowercase prefix of kPublic (the
 * compressed public nonce point) — 1 parity byte + 19 bytes of x, collision-free
 * for any realistic pool while keeping the append-only list small.
 */
export function burnedNonceId(kPublic: string): string {
  return String(kPublic).trim().toLowerCase().slice(0, 40);
}

function readBurnedIds(): Set<string> {
  const raw = storage().getItem(BURNED_NONCES_STORAGE_KEY);
  if (raw === null) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupted burned set must not silently re-enable used nonces.
    throw new EnterpriseNonceError('storage', 'Burned-nonce record corrupted');
  }
  if (!Array.isArray(parsed)) {
    throw new EnterpriseNonceError('storage', 'Burned-nonce record corrupted');
  }
  return new Set(parsed.filter((x): x is string => typeof x === 'string'));
}

/** Append ids to the persistent burned set (read fresh, union, write). */
function appendBurnedIds(ids: string[]): void {
  const current = readBurnedIds();
  let changed = false;
  for (const id of ids) {
    if (!current.has(id)) {
      current.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  // Throws on quota errors — the caller must then refuse to sign.
  storage().setItem(BURNED_NONCES_STORAGE_KEY, JSON.stringify([...current]));
}

/** True when this nonce has ever been used for a signature on this device. */
export function isEnterpriseNonceBurned(kPublic: string): boolean {
  return readBurnedIds().has(burnedNonceId(kPublic));
}

async function decryptPassword(passwordBlob: string): Promise<string> {
  const fingerprint = getFingerprint();
  const password = await passworderDecrypt(fingerprint, passwordBlob);
  if (typeof password !== 'string') {
    throw new EnterpriseNonceError(
      'storage',
      'Failed to decrypt password for nonce storage',
    );
  }
  return password;
}

function isNonceRecord(x: unknown): x is publicPrivateNonce {
  if (!x || typeof x !== 'object') return false;
  const n = x as Record<string, unknown>;
  return (
    typeof n.k === 'string' &&
    typeof n.kTwo === 'string' &&
    typeof n.kPublic === 'string' &&
    typeof n.kTwoPublic === 'string'
  );
}

/**
 * One-time migration of the legacy react-secure-storage pool. MUST run under
 * POOL_LOCK: it re-checks the new key inside the lock, so two views can never
 * both migrate, and a migration can never land on top of a pool another view
 * already burned nonces from. Returns the current pool blob, or null.
 */
function migrateLegacyPoolLocked(ls: Storage): string | null {
  const current = ls.getItem(NONCE_POOL_STORAGE_KEY);
  if (current !== null) return current;
  const legacy = secureLocalStorage.getItem(LEGACY_SECURE_STORAGE_KEY);
  if (typeof legacy !== 'string' || !legacy) {
    return null;
  }
  // The legacy value is the same passworder blob.
  ls.setItem(NONCE_POOL_STORAGE_KEY, legacy);
  secureLocalStorage.removeItem(LEGACY_SECURE_STORAGE_KEY);
  return legacy;
}

/**
 * Read the pool straight from storage. Burned nonces are filtered out.
 *
 * @param lockHeld true when the caller already holds POOL_LOCK (Web Locks are
 *   not re-entrant); otherwise the one-time legacy migration takes the lock.
 */
async function readPool(
  passwordBlob: string,
  lockHeld: boolean,
): Promise<publicPrivateNonce[]> {
  const ls = storage();
  let encrypted = ls.getItem(NONCE_POOL_STORAGE_KEY);
  if (encrypted === null) {
    encrypted = lockHeld
      ? migrateLegacyPoolLocked(ls)
      : await withLock(POOL_LOCK, {}, () =>
          Promise.resolve(migrateLegacyPoolLocked(ls)),
        );
    if (encrypted === null) {
      return [];
    }
  }
  const password = await decryptPassword(passwordBlob);
  const decrypted = await passworderDecrypt(password, encrypted);
  if (typeof decrypted !== 'string') {
    throw new EnterpriseNonceError('storage', 'Failed to decrypt nonce pool');
  }
  const parsed: unknown = JSON.parse(decrypted);
  if (!Array.isArray(parsed)) {
    throw new EnterpriseNonceError('storage', 'Nonce pool corrupted');
  }
  const burned = readBurnedIds();
  return parsed
    .filter(isNonceRecord)
    .filter((n) => !burned.has(burnedNonceId(n.kPublic)));
}

/** Write the pool, dropping burned and duplicate nonces. Throws on failure. */
async function writePool(
  nonces: publicPrivateNonce[],
  passwordBlob: string,
): Promise<void> {
  const burned = readBurnedIds();
  const seen = new Set<string>();
  const clean: publicPrivateNonce[] = [];
  for (const n of nonces) {
    if (!isNonceRecord(n) || !n.k || !n.kTwo) continue;
    const id = burnedNonceId(n.kPublic);
    if (burned.has(id) || seen.has(id)) continue;
    seen.add(id);
    clean.push({
      k: n.k,
      kTwo: n.kTwo,
      kPublic: n.kPublic,
      kTwoPublic: n.kTwoPublic,
    });
  }
  const password = await decryptPassword(passwordBlob);
  const encrypted = await passworderEncrypt(password, JSON.stringify(clean));
  storage().setItem(NONCE_POOL_STORAGE_KEY, encrypted);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decrypt the enterprise nonce pool, read fresh from storage (burned nonces
 * excluded). Returns an empty array if not found or decryption fails.
 * Snapshot only — never use it to pick a nonce for signing; use
 * consumeEnterpriseNonce, which checks and burns atomically.
 */
export async function loadEncryptedNonces(
  passwordBlob: string,
): Promise<publicPrivateNonce[]> {
  try {
    return await readPool(passwordBlob, false);
  } catch {
    return [];
  }
}

/**
 * Encrypt and store enterprise nonces under the cross-view lock. Burned
 * nonces are always filtered out, so a stale snapshot cannot resurrect them.
 */
export async function saveEncryptedNonces(
  nonces: publicPrivateNonce[],
  passwordBlob: string,
): Promise<void> {
  await withLock(POOL_LOCK, {}, async () => {
    await writePool(nonces, passwordBlob);
  });
}

/**
 * Atomically check, burn and use the reserved enterprise nonce.
 *
 * Under the cross-view pool lock: read the pool fresh from storage, refuse a
 * nonce that is in the burned set, locate the reserved pair, then DURABLY
 * record it as burned and remove it from the pool. Only after both writes
 * succeeded is `sign` invoked with the private nonce, so a partial signature
 * can never exist for a nonce that is still usable anywhere. The private
 * halves are wiped afterwards. A failed `sign` leaves the nonce burned (lost,
 * never reused).
 */
export async function consumeEnterpriseNonce<R>(
  reserved: { kPublic: string; kTwoPublic: string },
  passwordBlob: string,
  sign: (nonce: publicPrivateNonce) => R | Promise<R>,
): Promise<R> {
  if (!reserved?.kPublic || !reserved?.kTwoPublic) {
    throw new EnterpriseNonceError('not_found', 'No reserved nonce supplied');
  }
  const nonce = await withLock(POOL_LOCK, {}, async () => {
    const id = burnedNonceId(reserved.kPublic);
    if (readBurnedIds().has(id)) {
      throw new EnterpriseNonceError(
        'already_used',
        'Enterprise nonce was already used for a signature — refusing to reuse it',
      );
    }
    const pool = await readPool(passwordBlob, true);
    const idx = pool.findIndex(
      (n) =>
        n.kPublic === reserved.kPublic && n.kTwoPublic === reserved.kTwoPublic,
    );
    if (idx === -1) {
      throw new EnterpriseNonceError(
        'not_found',
        'Reserved enterprise nonce not found locally',
      );
    }
    const found = { ...pool[idx] };
    // Burn FIRST (append-only set), then drop it from the pool. Both writes
    // are synchronous localStorage writes that throw on failure.
    appendBurnedIds([id]);
    pool.splice(idx, 1);
    await writePool(pool, passwordBlob);
    return found;
  });
  try {
    return await sign(nonce);
  } finally {
    nonce.k = '';
    nonce.kTwo = '';
  }
}

// ---------------------------------------------------------------------------
// Partial signatures of burned nonces (retry after a failed post)
// ---------------------------------------------------------------------------

/** What a partial signature commits to, besides the nonce itself. */
export interface NoncePartialBinding {
  /** The exact digest that is signed (user operation hash / message digest). */
  message: string;
  /** The Schnorr signer set and its nonces, in signing order. */
  signingKeys: string[];
  signingNonces: Array<{ kPublic: string; kTwoPublic: string }>;
}

interface StoredNoncePartial {
  nonceId: string;
  kPublic: string;
  kTwoPublic: string;
  message: string;
  binding: string;
  requestId: string;
  sigOne: string;
  challenge: string;
  storedAt: number;
}

export interface NoncePartialResult {
  sigOne: string;
  challenge: string;
  /** The relay request id the partial was (or is to be) posted under. */
  requestId: string;
  /** true: an earlier partial for this nonce and message, nothing re-signed. */
  replayed: boolean;
}

function normalizeHex(value: string): string {
  return String(value).trim().toLowerCase();
}

function partialBindingKey(binding: NoncePartialBinding): string {
  return JSON.stringify({
    keys: binding.signingKeys.map(normalizeHex),
    nonces: binding.signingNonces.map((n) => [
      normalizeHex(n.kPublic),
      normalizeHex(n.kTwoPublic),
    ]),
  });
}

function isStoredPartial(value: unknown): value is StoredNoncePartial {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.nonceId === 'string' &&
    typeof r.kPublic === 'string' &&
    typeof r.kTwoPublic === 'string' &&
    typeof r.message === 'string' &&
    typeof r.binding === 'string' &&
    typeof r.requestId === 'string' &&
    typeof r.sigOne === 'string' &&
    typeof r.challenge === 'string' &&
    typeof r.storedAt === 'number'
  );
}

/** Unreadable records only cost the retry convenience (no replay = refusal). */
function readPartials(): StoredNoncePartial[] {
  try {
    const raw = storage().getItem(NONCE_PARTIALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStoredPartial) : [];
  } catch {
    return [];
  }
}

/** Record a partial made with a burned nonce. Must run under POOL_LOCK. */
function rememberPartialLocked(record: StoredNoncePartial): void {
  const now = Date.now();
  const kept = readPartials().filter(
    (entry) =>
      entry.nonceId !== record.nonceId &&
      now - entry.storedAt < NONCE_PARTIALS_TTL_MS,
  );
  kept.push(record);
  storage().setItem(
    NONCE_PARTIALS_STORAGE_KEY,
    JSON.stringify(kept.slice(-NONCE_PARTIALS_MAX)),
  );
}

/**
 * The partial an earlier attempt made with this (burned) nonce — only when it
 * was made for EXACTLY this message and signer set. Never anything else.
 */
export function findReplayableNoncePartial(
  reserved: { kPublic: string; kTwoPublic: string },
  binding: NoncePartialBinding,
): NoncePartialResult | null {
  const nonceId = burnedNonceId(reserved.kPublic);
  const stored = readPartials().find((entry) => entry.nonceId === nonceId);
  if (
    !stored ||
    normalizeHex(stored.kPublic) !== normalizeHex(reserved.kPublic) ||
    normalizeHex(stored.kTwoPublic) !== normalizeHex(reserved.kTwoPublic) ||
    stored.message !== normalizeHex(binding.message) ||
    stored.binding !== partialBindingKey(binding) ||
    !stored.sigOne
  ) {
    return null;
  }
  return {
    sigOne: stored.sigOne,
    challenge: stored.challenge,
    requestId: stored.requestId,
    replayed: true,
  };
}

/**
 * consumeEnterpriseNonce for a vault partial signature, with retry safety.
 *
 * First use: burn the nonce, sign, and persist `{requestId, sigOne,
 * challenge}` with the message and signer set it was made for. A retry after a
 * failed post finds the nonce burned (`already_used`) and gets the SAME stored
 * partial back — same nonce and same message give the same partial, so
 * re-posting it reveals nothing new. A different message (or signer set) for a
 * burned nonce is never signed and never replayed: it stays `already_used`.
 */
export async function consumeEnterpriseNonceForPartial(
  reserved: { kPublic: string; kTwoPublic: string },
  passwordBlob: string,
  binding: NoncePartialBinding,
  requestId: string,
  sign: (
    nonce: publicPrivateNonce,
  ) =>
    | { sigOne: string; challenge: string }
    | Promise<{ sigOne: string; challenge: string }>,
): Promise<NoncePartialResult> {
  let result: { sigOne: string; challenge: string };
  try {
    result = await consumeEnterpriseNonce(reserved, passwordBlob, sign);
  } catch (error) {
    if (
      error instanceof EnterpriseNonceError &&
      error.code === 'already_used'
    ) {
      const replay = findReplayableNoncePartial(reserved, binding);
      if (replay) return replay;
    }
    throw error;
  }
  try {
    await withLock(POOL_LOCK, {}, () => {
      rememberPartialLocked({
        nonceId: burnedNonceId(reserved.kPublic),
        kPublic: reserved.kPublic,
        kTwoPublic: reserved.kTwoPublic,
        message: normalizeHex(binding.message),
        binding: partialBindingKey(binding),
        requestId,
        sigOne: result.sigOne,
        challenge: result.challenge,
        storedAt: Date.now(),
      });
      return Promise.resolve();
    });
  } catch (error) {
    // Only the retry convenience is lost: a later retry is refused as
    // already_used, exactly as before.
    console.log('[Enterprise Nonces] could not record partial:', error);
  }
  return { ...result, requestId, replayed: false };
}

/**
 * Check enterprise nonce pool status and replenish wallet nonces if below threshold.
 * Reconciles the server pool against what this device actually holds (purging
 * server-side 'available' orphans this device can never sign with), then
 * generates enough to reach TARGET_COUNT on the server, stores them locally,
 * and submits public parts to the relay.
 *
 * Only one replenish runs at a time across ALL extension views (Web Lock).
 * The local write merges the new nonces into a FRESH read of the pool under
 * the pool lock (never `[...staleSnapshot, ...new]`) and drops burned ones.
 *
 * @param forceReplace - Manual "Sync Nonces" action from the enterprise app:
 *   waits out any in-flight replenish instead of skipping.
 * @param relayAuth - RA-2 auth for POST /v1/nonces and /v1/nonces/reconcile.
 */
export async function replenishWalletEnterpriseNonces(
  wkIdentity: string,
  passwordBlob: string,
  forceReplace = false,
  relayAuth?: NonceRelayAuth,
): Promise<EnterpriseNonceSyncResult> {
  try {
    return await withLock(
      REPLENISH_LOCK,
      {
        ifAvailable: !forceReplace,
        timeoutMs: FORCE_REPLENISH_WAIT_MS,
      },
      async (acquired): Promise<EnterpriseNonceSyncResult> => {
        if (!acquired) {
          return { ok: false, generated: 0, reason: 'busy' };
        }
        return replenishLocked(wkIdentity, passwordBlob, relayAuth);
      },
    );
  } catch (error) {
    if (error instanceof EnterpriseNonceError && error.code === 'lock') {
      return { ok: false, generated: 0, reason: 'busy' };
    }
    console.log('[Enterprise Nonces] Wallet replenish error:', error);
    return { ok: false, generated: 0, reason: 'submit_failed' };
  }
}

async function signedBody(
  body: Record<string, unknown>,
  wkIdentity: string,
  relayAuth: NonceRelayAuth | undefined,
): Promise<Record<string, unknown>> {
  if (!relayAuth) {
    // RA-2: never post a nonce body unsigned — the caller reports
    // auth_unavailable and nothing is sent.
    throw new RelayAuthUnavailableError(
      'Relay authentication not supplied for the nonce endpoints',
    );
  }
  return attachRequiredWkAuth(body, wkIdentity, relayAuth.createAuth);
}

async function replenishLocked(
  wkIdentity: string,
  passwordBlob: string,
  relayAuth: NonceRelayAuth | undefined,
): Promise<EnterpriseNonceSyncResult> {
  try {
    // Check server-side pool status to know how many nonces the server actually has
    let serverAvailable = 0;
    try {
      const statusUrl = `https://${sspConfig().relay}/v1/nonces/status/${wkIdentity}`;
      // RA-4: signed GET (headers bind `GET <path>`).
      const headers = relayAuth?.readHeaders
        ? await relayAuth.readHeaders(statusUrl)
        : null;
      const statusRes = await axios.get(statusUrl, {
        timeout: RELAY_TIMEOUT_MS,
        ...(headers ? { headers } : {}),
      });
      const poolData = statusRes.data as
        | { data?: { wallet?: { available?: number } } }
        | undefined;
      if (poolData?.data?.wallet?.available != null) {
        serverAvailable = poolData.data.wallet.available;
      }
    } catch {
      // If status check fails, fall back to local count
    }

    // Fresh read of the pool (burned excluded). A read failure is fatal: we
    // must not report "pool empty" and overwrite real nonces.
    const existingNonces = await readPool(passwordBlob, false);

    // Reconcile: tell server which nonces we actually have locally.
    // This purges server-side 'available' nonces that we don't have
    // (e.g. local save failed after relay submission, extension reinstalled)
    // while leaving reserved/used ones untouched.
    if (existingNonces.length > 0 || serverAvailable > 0) {
      let reconcileBody: Record<string, unknown>;
      try {
        reconcileBody = await signedBody(
          {
            wkIdentity,
            source: 'wallet',
            localNonces: existingNonces.map((n) => ({
              kPublic: n.kPublic,
              kTwoPublic: n.kTwoPublic,
            })),
          },
          wkIdentity,
          relayAuth,
        );
      } catch {
        return { ok: false, generated: 0, reason: 'auth_unavailable' };
      }
      try {
        const reconcileRes = await axios.post(
          `https://${sspConfig().relay}/v1/nonces/reconcile`,
          reconcileBody,
          { timeout: RELAY_TIMEOUT_MS },
        );
        const reconcileData = reconcileRes.data as
          | { data?: { purged?: number } }
          | undefined;
        const purged = reconcileData?.data?.purged ?? 0;
        if (purged > 0) {
          console.log(
            `[Enterprise Nonces] Wallet: Purged ${purged} orphaned server nonces`,
          );
          // Update serverAvailable after purge
          serverAvailable = Math.max(serverAvailable - purged, 0);
        }
      } catch {
        // Reconcile is best-effort — don't block replenishment
      }
    }

    // Generate based on what the SERVER needs, not just local count.
    // This handles the case where server nonces were deleted but local still has them.
    const toGenerate = Math.max(
      TARGET_COUNT - existingNonces.length,
      TARGET_COUNT - serverAvailable,
      0,
    );
    if (toGenerate <= 0) {
      // Pool verified healthy and in sync — nothing to submit.
      return { ok: true, generated: 0, reason: 'not_needed' };
    }

    // Generate new nonces
    const newNonces: publicPrivateNonce[] = [];
    for (let i = 0; i < toGenerate; i++) {
      newNonces.push(generatePublicNonce());
    }

    // Submit public parts to relay FIRST — if this fails, we don't save
    // locally, avoiding a desync where wallet has nonces the server doesn't
    const publicParts = newNonces.map((n) => ({
      kPublic: n.kPublic,
      kTwoPublic: n.kTwoPublic,
    }));
    let submitBody: Record<string, unknown>;
    try {
      submitBody = await signedBody(
        { wkIdentity, source: 'wallet', nonces: publicParts },
        wkIdentity,
        relayAuth,
      );
    } catch {
      return { ok: false, generated: 0, reason: 'auth_unavailable' };
    }
    await axios.post(`https://${sspConfig().relay}/v1/nonces`, submitBody, {
      timeout: RELAY_TIMEOUT_MS,
    });

    // Only store locally after successful relay submission. Merge into a
    // FRESH read under the pool lock — another view may have burned (or added)
    // nonces while the relay calls were in flight; writePool drops burned ids.
    await withLock(POOL_LOCK, {}, async () => {
      const current = await readPool(passwordBlob, true);
      await writePool([...current, ...newNonces], passwordBlob);
    });

    console.log(
      `[Enterprise Nonces] Wallet: Generated and submitted ${toGenerate} nonces (server had ${serverAvailable}, local had ${existingNonces.length})`,
    );
    return { ok: true, generated: toGenerate };
  } catch (error) {
    // The mandatory POST /v1/nonces lands here too, so report the failure
    // instead of swallowing it: callers that told the user a sync started
    // must not claim success.
    console.log('[Enterprise Nonces] Wallet replenish error:', error);
    return { ok: false, generated: 0, reason: 'submit_failed' };
  }
}
