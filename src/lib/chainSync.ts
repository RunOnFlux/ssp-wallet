/**
 * Multi-chain batch sync ("chainsyncrequest") — wallet side.
 *
 * Protocol (version 1), riding the EXISTING relay action transport for an
 * already-paired wallet+key:
 *   POST /v1/action {
 *     action: 'chainsyncrequest',
 *     payload: JSON.stringify({ version: 1, chains: [{ chain, xpubWallet }] }),
 *     chain: <identity chain>, path: '', wkIdentity,
 *   }
 *
 * The key answers per chain through the EXISTING POST /v1/sync mechanism —
 * the wallet keeps polling GET /v1/sync/<walletIdentity> exactly as it does
 * for single-chain sync, so the response path is unchanged and old
 * wallets/keys keep working. If the key declines (or speaks a newer
 * protocol), it posts a 'chainsyncrejected' action which the wallet detects
 * by polling GET /v1/action/<wkIdentity>. An old key never answers at all —
 * the wallet falls back to the per-chain QR flow after a timeout.
 *
 * Crypto functions (getMasterXpriv/getMasterXpub/generateMultisigAddress/
 * generateSolanaPubkeyArray) are CALLED here with the same inputs as the
 * existing chain-switching flow — never modified (invariant 1). Storage
 * writes use the exact same keys and encodings as the existing per-chain
 * flow (append-only storage, invariant 6).
 */

import axios from 'axios';
import localForage from 'localforage';
import secureLocalStorage from 'react-secure-storage';
import { HDKey } from '@scure/bip32';
import utxolib from '@runonflux/utxo-lib';
import { Buffer } from 'buffer';
import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import { getFingerprint } from './fingerprint';
import {
  getMasterXpriv,
  getMasterXpub,
  generateMultisigAddress,
  generateSolanaPubkeyArray,
  getScriptType,
  getLibId,
} from './wallet';
import { verifyMessageSignature } from './relayAuth';
import { setXpubWallet, setXpubKey, store } from '../store';
import type { cryptos, publicNonce } from '../types';

export const CHAIN_SYNC_VERSION = 1;
export const CHAIN_SYNC_MAX_CHAINS = 20;
/**
 * How long the wallet waits for ANY key response (a per-chain sync doc or a
 * chainsyncrejected action) before surfacing the per-chain QR fallback UI:
 * "Your SSP Key app needs an update for one-tap sync — or scan below".
 * Polling continues after the fallback shows — a slow approval still lands.
 */
export const CHAIN_SYNC_FALLBACK_TIMEOUT_MS = 30_000;
/**
 * How long the wallet keeps waiting for further chains once syncing has
 * started (the key needs ~6s per not-yet-derived chain — xpriv + xpub
 * derivations — plus 3s spacing between posts).
 */
export const CHAIN_SYNC_STALL_TIMEOUT_MS = 60_000;

export interface ChainSyncRequestEntry {
  chain: keyof cryptos;
  xpubWallet: string;
}

/** Build the versioned chainsyncrequest payload (version field from day one). */
export function buildChainSyncRequestPayload(
  entries: ChainSyncRequestEntry[],
): string {
  if (entries.length < 1 || entries.length > CHAIN_SYNC_MAX_CHAINS) {
    throw new Error('Invalid chain sync request size');
  }
  return JSON.stringify({
    version: CHAIN_SYNC_VERSION,
    chains: entries.map((entry) => ({
      chain: entry.chain,
      xpubWallet: entry.xpubWallet,
    })),
  });
}

export interface ChainSyncRejection {
  version: number;
  reason?: string;
}

/** Parse a chainsyncrejected payload. Returns null when malformed. */
export function parseChainSyncRejection(
  payload: unknown,
): ChainSyncRejection | null {
  if (typeof payload !== 'string' || !payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.version !== 'number') return null;
    return {
      version: obj.version,
      reason: typeof obj.reason === 'string' ? obj.reason : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Timeout-based fallback decision: no response of any kind within the window
 * → show the per-chain QR fallback UI (old key, old relay, phone off...).
 */
export function shouldShowQrFallback(
  startedAtMs: number,
  nowMs: number,
  receivedAnyResponse: boolean,
): boolean {
  return (
    !receivedAnyResponse &&
    nowMs - startedAtMs >= CHAIN_SYNC_FALLBACK_TIMEOUT_MS
  );
}

/** Stall detection once chains started arriving. */
export function isBatchStalled(
  lastProgressAtMs: number,
  nowMs: number,
): boolean {
  return nowMs - lastProgressAtMs >= CHAIN_SYNC_STALL_TIMEOUT_MS;
}

/**
 * Batch lifecycle phases, shared with components/Key/Key.tsx so the polling
 * and verification-gate policies below can be expressed over them (and tested).
 */
export type BatchPhase =
  | 'idle'
  | 'preparing'
  | 'awaiting'
  | 'syncing'
  | 'done'
  | 'rejected'
  | 'fallback';

/**
 * Phases in which the wallet must keep polling the key. 'fallback' included:
 * the per-chain QR path shown there is only an ALTERNATIVE — the key may still
 * approve (slow tap) or decline late, and a late decline is what puts the
 * verification gate back on screen (see requiresVerificationGate).
 */
export function isBatchPollablePhase(phase: BatchPhase): boolean {
  return phase === 'awaiting' || phase === 'syncing' || phase === 'fallback';
}

// ---------------------------------------------------------------------------
// Chain-sync attestation (security fix contract CS-1 / CS-2)
// ---------------------------------------------------------------------------

/**
 * The exact text SSP Key signs, with its identity key (…/10/0 of the identity
 * account — the key behind wkIdentity), for every chain it syncs. Byte-identical
 * to ssp-key's copy.
 */
export function chainSyncAttestationMessage(
  chain: string,
  walletXpub: string,
  keyXpub: string,
): string {
  return `SSP_CHAIN_SYNC:${chain}:${walletXpub}:${keyXpub}`;
}

/**
 * SSP Key's identity pubkey (hex, compressed) derived from the identity-chain
 * key xpub the wallet stored at identity pairing. Null when it can't be derived.
 */
export function deriveKeyIdentityPubKey(
  keyIdentityXpub: string,
  identityChain: keyof cryptos,
): string | null {
  if (!keyIdentityXpub || typeof keyIdentityXpub !== 'string') return null;
  const config = blockchains[identityChain];
  if (!config) return null;
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(keyIdentityXpub, config.bip32);
  } catch {
    try {
      const network = utxolib.networks[getLibId(identityChain)];
      if (!network?.bip32) return null;
      node = HDKey.fromExtendedKey(keyIdentityXpub, network.bip32);
    } catch {
      return null;
    }
  }
  try {
    const child = node.deriveChild(10).deriveChild(0);
    if (!child.publicKey) return null;
    return Buffer.from(child.publicKey).toString('hex');
  } catch {
    return null;
  }
}

/**
 * Is `signature` SSP Key's attestation that `keyXpub` is its xpub for `chain`,
 * paired with OUR `walletXpub`?
 *
 * The verifying key is derived from `keyIdentityXpub` — the identity-chain key
 * xpub this wallet stored at (verification-code gated) identity pairing — and
 * never from anything in the sync doc, so a relay that substitutes `keyXpub`
 * cannot produce a valid attestation. Fails closed on any malformed input.
 */
export function verifyChainSyncAttestation(params: {
  chain: string;
  walletXpub: string;
  keyXpub: string;
  signature: unknown;
  keyIdentityXpub: string;
  identityChain: keyof cryptos;
}): boolean {
  const { chain, walletXpub, keyXpub, signature, keyIdentityXpub } = params;
  const { identityChain } = params;
  if (
    typeof signature !== 'string' ||
    !signature ||
    !chain ||
    !walletXpub ||
    !keyXpub
  ) {
    return false;
  }
  const expectedPubKeyHex = deriveKeyIdentityPubKey(
    keyIdentityXpub,
    identityChain,
  );
  if (!expectedPubKeyHex) return false;
  const prefixes = [
    blockchains[identityChain]?.messagePrefix,
    blockchains.btc?.messagePrefix,
  ].filter((prefix): prefix is string => typeof prefix === 'string');
  return verifyMessageSignature({
    message: chainSyncAttestationMessage(chain, walletXpub, keyXpub),
    signature,
    expectedPubKeyHex,
    messagePrefixes: prefixes,
  });
}

/** One chain whose key material landed (was stored) during this session. */
export interface SessionLandedChain {
  chain: string;
  /** keyXpubSignature verified against the stored Key identity pubkey. */
  attested: boolean;
  /** Delivered as a batch sync doc (SSP Key approved a batch request). */
  fromBatch: boolean;
}

/**
 * Must the user pass the out-of-band verification-code gate before this
 * session's pairing is treated as done? (CS-2)
 *
 * The wallet shows the code exactly when SSP Key shows its side, so the two
 * can always be compared — and released SSP Key 2.1.1 keeps working:
 * - an identity pairing: SSP Key shows the code (every version);
 * - a batch that SSP Key approved and delivered: SSP Key shows the code
 *   after it (every version).
 * A single-chain activation (QR, manual or fallback) shows no code on SSP
 * Key, so none is shown here; the key xpub is then protected by SSP Key's
 * attestation when it carries one (see singleChainUnattested).
 *
 * There is NO other way to finish a session that stored key material.
 */
export function sessionRequiresVerificationCode(input: {
  identityPairedThisSession: boolean;
  landed: SessionLandedChain[];
}): boolean {
  if (input.identityPairedThisSession) return true;
  return input.landed.some((entry) => entry.fromBatch);
}

/**
 * Did SSP Key attest every chain stored this session? Never true for an
 * identity pairing: the identity xpub is the root every later attestation is
 * checked against, so nothing can vouch for it. Display-only (badge on the
 * verification code); it does not skip the code.
 */
export function sessionFullyAttested(input: {
  identityPairedThisSession: boolean;
  landed: SessionLandedChain[];
}): boolean {
  if (input.identityPairedThisSession) return false;
  return (
    input.landed.length > 0 && input.landed.every((entry) => entry.attested)
  );
}

/**
 * Chains this session activated without a code AND without an SSP Key
 * attestation — what an SSP Key older than 2.2.0 sends for a single-chain
 * sync. Accepted for compatibility (as before 2.2.0); the caller tells the
 * user to update SSP Key.
 */
export function singleChainUnattested(input: {
  identityPairedThisSession: boolean;
  landed: SessionLandedChain[];
}): string[] {
  if (sessionRequiresVerificationCode(input)) return [];
  return input.landed
    .filter((entry) => !entry.attested)
    .map((entry) => entry.chain);
}

// ---------------------------------------------------------------------------
// Pairing sessions
//
// A sync session is one opening of the pairing view in one wallet view. Every
// key-xpub write carries the session it belongs to, and is dropped when that
// session finished, was discarded or its view went away while the write was
// waiting on PBKDF2 — a late write must never land after the user confirmed
// or rejected the verification code (security review: pairing race).
//
// A live session holds the Web Lock `ssp-pairing-session:<id>` for its whole
// life; the browser releases it when the view closes. That is how another
// view tells a pairing in progress from one that was abandoned.
// ---------------------------------------------------------------------------

export const PAIRING_SESSION_LOCK_PREFIX = 'ssp-pairing-session:';

export interface PairingSession {
  readonly id: string;
  /** False once ended: writes captured under it must be dropped. */
  isActive(): boolean;
  /** End the session and release its liveness lock (idempotent). */
  end(): void;
}

interface PairingLockManager {
  request(name: string, callback: () => Promise<void>): Promise<void>;
  query?: () => Promise<{ held?: Array<{ name?: string }> }>;
}

function pairingLocks(): PairingLockManager | null {
  const nav = (globalThis as { navigator?: { locks?: PairingLockManager } })
    .navigator;
  return nav?.locks && typeof nav.locks.request === 'function'
    ? nav.locks
    : null;
}

function newSessionId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('hex');
}

/** Start a sync session (see above). */
export function startPairingSession(): PairingSession {
  const id = newSessionId();
  let active = true;
  let release: (() => void) | null = null;
  const locks = pairingLocks();
  if (locks) {
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Held until end(); without Web Locks the session simply counts as
    // abandoned for other views, which discard its keys (fail closed).
    locks
      .request(`${PAIRING_SESSION_LOCK_PREFIX}${id}`, () => held)
      .catch(() => undefined);
  }
  return {
    id,
    isActive: () => active,
    end: () => {
      if (!active) return;
      active = false;
      release?.();
    },
  };
}

/**
 * Ids of the sessions that are alive in some wallet view, or null when that
 * cannot be determined (no Web Locks) — callers then treat every session as
 * abandoned.
 */
async function liveSessionIds(): Promise<Set<string> | null> {
  const locks = pairingLocks();
  if (!locks?.query) return null;
  try {
    const snapshot = await locks.query();
    const live = new Set<string>();
    for (const lock of snapshot.held ?? []) {
      if (
        typeof lock.name === 'string' &&
        lock.name.startsWith(PAIRING_SESSION_LOCK_PREFIX)
      ) {
        live.add(lock.name.slice(PAIRING_SESSION_LOCK_PREFIX.length));
      }
    }
    return live;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Unverified-pairing marker
//
// Key xpubs are persisted as they arrive, before the verification gate. If the
// wallet closes while the gate is open (popup dismissed, auto-logout), those
// records would otherwise be read back as a finished pairing and never gated.
// Every chain is marked here BEFORE its key xpub is written, under the session
// that wrote it; finishing the session clears ITS entries, and the next unlock
// discards whatever abandoned sessions left marked. Entries of a session that
// is still alive in another view are left alone.
// ---------------------------------------------------------------------------

export const UNVERIFIED_PAIRING_STORAGE_KEY = 'ssp_unverified_pairing';
/** Session id given to markers written before markers were per session. */
export const LEGACY_PAIRING_SESSION_ID = 'legacy';

type PairingMarker = Record<string, string[]>;

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((chain): chain is string => typeof chain === 'string')
    : [];
}

function readUnverifiedPairing(): PairingMarker {
  try {
    const raw = localStorage.getItem(UNVERIFIED_PAIRING_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Pre-session marker: owned by no live session.
      const chains = stringList(parsed);
      return chains.length ? { [LEGACY_PAIRING_SESSION_ID]: chains } : {};
    }
    if (!parsed || typeof parsed !== 'object') return {};
    const sessions = (parsed as { sessions?: unknown }).sessions;
    if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) {
      return {};
    }
    const marker: PairingMarker = {};
    for (const [sessionId, chains] of Object.entries(
      sessions as Record<string, unknown>,
    )) {
      const list = stringList(chains);
      if (list.length) marker[sessionId] = list;
    }
    return marker;
  } catch {
    return {};
  }
}

function writeUnverifiedPairing(marker: PairingMarker): void {
  if (!Object.keys(marker).length) {
    localStorage.removeItem(UNVERIFIED_PAIRING_STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    UNVERIFIED_PAIRING_STORAGE_KEY,
    JSON.stringify({ v: 2, sessions: marker }),
  );
}

/**
 * Record that `chain`'s key xpub is about to be stored by `sessionId`, not yet
 * verified. Throws when storage is unavailable — the write must then not
 * happen.
 */
export function markUnverifiedPairing(sessionId: string, chain: string): void {
  const marker = readUnverifiedPairing();
  const chains = marker[sessionId] ?? [];
  if (!chains.includes(chain)) chains.push(chain);
  marker[sessionId] = chains;
  writeUnverifiedPairing(marker);
}

/** The session's pairing was verified (or discarded) — drop ITS entries. */
export function clearUnverifiedPairing(sessionId: string): void {
  try {
    const marker = readUnverifiedPairing();
    if (!(sessionId in marker)) return;
    delete marker[sessionId];
    writeUnverifiedPairing(marker);
  } catch {
    // storage unavailable — nothing marked
  }
}

/** Every chain some session still has marked unverified. */
export function unverifiedPairingChains(): string[] {
  return Array.from(new Set(Object.values(readUnverifiedPairing()).flat()));
}

function discardSessions(
  marker: PairingMarker,
  sessionIds: string[],
): string[] {
  const discarded: string[] = [];
  const keep = Object.entries(marker).filter(
    ([sessionId]) => !sessionIds.includes(sessionId),
  );
  // A chain another (kept) session is pairing right now is not ours to wipe.
  const keptChains = new Set(keep.flatMap(([, chains]) => chains));
  for (const sessionId of sessionIds) {
    for (const chain of marker[sessionId] ?? []) {
      if (keptChains.has(chain) || discarded.includes(chain)) continue;
      const storageKey = keyXpubStorageKey(chain as keyof cryptos);
      if (!storageKey) continue;
      try {
        secureLocalStorage.removeItem(storageKey);
        discarded.push(chain);
      } catch (error) {
        console.log(error);
      }
    }
  }
  try {
    writeUnverifiedPairing(Object.fromEntries(keep));
  } catch (error) {
    console.log(error);
  }
  return discarded;
}

/**
 * Discard every key xpub `sessionId` stored that never passed its gate
 * (cancel / code mismatch). Other sessions' entries are untouched.
 *
 * @returns the chains whose key xpub was discarded.
 */
export function discardUnverifiedPairings(sessionId: string): string[] {
  return discardSessions(readUnverifiedPairing(), [sessionId]);
}

/**
 * At unlock, BEFORE any key xpub is read back: discard what abandoned sessions
 * left marked. Sessions alive in another view keep their entries; their chains
 * are reported as `pendingElsewhere` — still unverified, never to be treated
 * as paired.
 */
export async function discardOrphanedUnverifiedPairings(): Promise<{
  discarded: string[];
  pendingElsewhere: string[];
}> {
  const marker = readUnverifiedPairing();
  const sessionIds = Object.keys(marker);
  if (!sessionIds.length) return { discarded: [], pendingElsewhere: [] };
  const live = await liveSessionIds();
  const orphaned = sessionIds.filter((sessionId) => !live?.has(sessionId));
  // Re-read: a live session may have marked more chains meanwhile.
  const discarded = discardSessions(readUnverifiedPairing(), orphaned);
  return { discarded, pendingElsewhere: unverifiedPairingChains() };
}

/** Storage key of a chain's SSP Key xpub record. */
export function keyXpubStorageKey(chain: keyof cryptos): string | null {
  const config = blockchains[chain];
  if (!config) return null;
  return `2-xpub-48-${config.slip}-0-${getScriptType(config.scriptType)}-${
    config.id
  }`;
}

/**
 * Does a batch that stopped the wallet's wait still owe the user the anti-MITM
 * verification gate?
 *
 * The gate is a security control — the only thing that catches a relay
 * substituting its own key material during pairing — so EVERY path that ends
 * the wait must reach it whenever key material actually landed this session
 * (`activeChainDone`): a completed batch ('done') and equally one the key
 * DECLINED ('rejected'), where the key shows its identity-only code. Phases in
 * which the key is still expected to answer ('awaiting'/'syncing'/'fallback')
 * deliberately do NOT gate: a code built there would aggregate fewer chains
 * than the key's and could never match.
 */
export function requiresVerificationGate(
  phase: BatchPhase,
  activeChainDone: boolean,
): boolean {
  if (!activeChainDone) return false;
  return phase === 'done' || phase === 'rejected';
}

export interface BatchSyncDoc {
  chain: string;
  keyXpub: string;
  wkIdentity?: string;
  generatedAddress?: string;
  walletXpub?: string;
  witnessScript?: string;
  redeemScript?: string;
}

export type BatchVerifyResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Verify a per-chain sync doc for a NON-identity batch chain. Mirrors the
 * non-identity-chain verification in components/Key/Key.tsx checkSynced —
 * the same comparisons in the same order with the same conditional guards
 * (walletXpub / generatedAddress / witnessScript / redeemScript are only
 * checked when present in the response, exactly like the existing code):
 * derive the first multisig address (index 0,0) from our wallet xpub and the
 * received key xpub and require everything the key reported to match.
 */
export function verifyBatchSyncDoc(
  doc: BatchSyncDoc,
  expectedXpubWallet: string,
): BatchVerifyResult {
  const chain = doc.chain as keyof cryptos;
  if (!(chain in blockchains)) {
    return { valid: false, reason: 'unknown chain' };
  }
  if (!doc.keyXpub || typeof doc.keyXpub !== 'string') {
    return { valid: false, reason: 'missing keyXpub' };
  }
  if (doc.keyXpub.trim() === expectedXpubWallet.trim()) {
    // key echoed our own wallet xpub — different seed phrases are required
    return { valid: false, reason: 'keyXpub equals walletXpub' };
  }
  // Verify ssp-key received correct wallet xpub
  if (doc.walletXpub && doc.walletXpub !== expectedXpubWallet) {
    return { valid: false, reason: 'sspKeyWalletXpub mismatch' };
  }
  let generatedAddress;
  try {
    generatedAddress = generateMultisigAddress(
      expectedXpubWallet,
      doc.keyXpub,
      0,
      0,
      chain,
    );
  } catch {
    return { valid: false, reason: 'address generation failed' };
  }
  const sspKeyGeneratedAddress = doc.generatedAddress;
  if (
    sspKeyGeneratedAddress &&
    generatedAddress.address !== sspKeyGeneratedAddress
  ) {
    return { valid: false, reason: 'generatedAddress mismatch' };
  }
  // Script verification - not strictly needed but extra assurance
  if (
    doc.witnessScript &&
    generatedAddress.witnessScript &&
    doc.witnessScript !== generatedAddress.witnessScript
  ) {
    return { valid: false, reason: 'witnessScript mismatch' };
  }
  if (
    doc.redeemScript &&
    generatedAddress.redeemScript &&
    doc.redeemScript !== generatedAddress.redeemScript
  ) {
    return { valid: false, reason: 'redeemScript mismatch' };
  }
  return { valid: true };
}

async function decryptSessionPassword(passwordBlob: string): Promise<string> {
  const fingerprint: string = getFingerprint();
  const password = await passworderDecrypt(fingerprint, passwordBlob);
  if (typeof password !== 'string') {
    throw new Error('Invalid password');
  }
  return password;
}

/**
 * Ensure the wallet-side xpub for a chain exists (redux → secure storage →
 * derive from seed) and return it decrypted. Mirrors
 * lib/chainSwitching.ts loadChainFromStorage/generateNewChainData storage
 * behavior exactly (same keys, same encodings) WITHOUT switching the active
 * chain.
 */
export async function ensureWalletChainKeys(
  chain: keyof cryptos,
  passwordBlob: string,
): Promise<string> {
  const currentState = store.getState();
  const existing = currentState[chain]?.xpubWallet;
  if (existing) {
    return existing;
  }
  const blockchainConfig = blockchains[chain];
  const suffix = `48-${blockchainConfig.slip}-0-${getScriptType(
    blockchainConfig.scriptType,
  )}-${blockchainConfig.id}`;
  const password = await decryptSessionPassword(passwordBlob);
  const xpubEncrypted = secureLocalStorage.getItem(`xpub-${suffix}`);
  if (xpubEncrypted && typeof xpubEncrypted === 'string') {
    const xpubChainWallet = await passworderDecrypt(password, xpubEncrypted);
    if (xpubChainWallet && typeof xpubChainWallet === 'string') {
      setXpubWallet(chain, xpubChainWallet);
      return xpubChainWallet;
    }
  }
  // Derive from the wallet seed — same calls with the same inputs as
  // chainSwitching.ts generateNewChainData.
  const walSeedBlob = secureLocalStorage.getItem('walletSeed');
  if (!walSeedBlob || typeof walSeedBlob !== 'string') {
    throw new Error('Invalid wallet seed');
  }
  let walletSeed = await passworderDecrypt(password, walSeedBlob);
  if (typeof walletSeed !== 'string') {
    throw new Error('Invalid wallet seed decryption');
  }
  let xprivWallet = getMasterXpriv(
    walletSeed,
    48,
    blockchainConfig.slip,
    0,
    blockchainConfig.scriptType,
    chain,
  );
  const xpubWallet = getMasterXpub(
    walletSeed,
    48,
    blockchainConfig.slip,
    0,
    blockchainConfig.scriptType,
    chain,
  );
  walletSeed = '';
  let xpubWalletForChain = xpubWallet;
  if (blockchainConfig.chainType === 'sol') {
    const solanaPubkeys = generateSolanaPubkeyArray(xprivWallet, chain, 0);
    xpubWalletForChain = JSON.stringify(solanaPubkeys);
  }
  const xprivBlob = await passworderEncrypt(password, xprivWallet);
  xprivWallet = '';
  const xpubBlob = await passworderEncrypt(password, xpubWalletForChain);
  secureLocalStorage.setItem(`xpriv-${suffix}`, xprivBlob);
  secureLocalStorage.setItem(`xpub-${suffix}`, xpubBlob);
  setXpubWallet(chain, xpubWalletForChain);
  return xpubWalletForChain;
}

/**
 * Does the wallet already hold an SSP Key xpub for this chain?
 *
 * Redux only hydrates a chain's xpubKey when the chain is switched to
 * (lib/chainSwitching.ts), so the store is NOT a reliable "already synced"
 * signal for chains never visited this session. The encrypted
 * `2-xpub-48-…` secure-storage record IS — it is written exactly once per
 * synced chain (manual, QR and batch flows all end in the same write).
 * Presence check only; nothing is decrypted.
 */
export function hasStoredKeyXpub(chain: keyof cryptos): boolean {
  const key = keyXpubStorageKey(chain);
  if (!key) return false;
  try {
    return !!secureLocalStorage.getItem(key);
  } catch {
    return false;
  }
}

/**
 * Store a verified key xpub for a (possibly non-active) chain — the exact
 * same redux + secure-storage writes the manual/QR flow performs in
 * Key.tsx handleOkModalKey.
 *
 * `isCurrent` is re-checked AFTER the PBKDF2 work and immediately before the
 * marker and the writes: a session that finished or was discarded meanwhile
 * gets nothing written.
 *
 * @returns false when the write was dropped for a stale session.
 */
export async function storeKeyXpubForChain(
  chain: keyof cryptos,
  keyXpub: string,
  passwordBlob: string,
  session: { id: string; isCurrent: () => boolean },
): Promise<boolean> {
  const blockchainConfig = blockchains[chain];
  const derivationPath = `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
    blockchainConfig.scriptType,
  )}-${blockchainConfig.id}`;
  if (!session.isCurrent()) return false;
  const password = await decryptSessionPassword(passwordBlob);
  const encryptedXpub2 = await passworderEncrypt(password, keyXpub);
  if (!session.isCurrent()) return false;
  // Marked BEFORE the write: until the session's gate passes (or the chain's
  // attestation verified and the session finished) this is not a pairing.
  markUnverifiedPairing(session.id, chain);
  secureLocalStorage.setItem(`2-${derivationPath}`, encryptedXpub2);
  setXpubKey(chain, keyXpub);
  return true;
}

/**
 * Store the Schnorr public-nonce pool a batch sync doc carries — the exact
 * same localForage write the classic per-chain flow performs in
 * components/Key/Key.tsx checkSynced.
 *
 * The pool is per-INSTALL, not per-chain: ONE localForage key here, ONE redux
 * slot on the key side, and every EVM send draws from it regardless of chain.
 * The key regenerates the pool when it syncs an EVM chain and keeps only the
 * last one it generated, so a batch doc's pool MUST be ingested here — without
 * it the wallet keeps a pool the key already discarded and every EVM send waits
 * forever on a nonce the key does not have. The key generates the pool once per
 * batch and reports the same one for every EVM chain of that batch, so both
 * sides converge on the same pool whichever docs the wallet observed.
 *
 * A doc without a pool (non-EVM chain) or with an empty one leaves the stored
 * pool untouched — never wipe a working pool on a degenerate response.
 */
export async function storeKeyPublicNonces(
  publicNonces: publicNonce[] | undefined,
): Promise<void> {
  if (!Array.isArray(publicNonces) || !publicNonces.length) return;
  await localForage
    .setItem('sspKeyPublicNonces', publicNonces)
    .catch((error) => console.log(error)); // we do not need to throw an error
}

/**
 * Fetch the latest pending action for the wkIdentity — used to detect a
 * 'chainsyncrejected' answer from the key. Works against old relays too
 * (action storage/GET are generic over action types). Returns null when
 * nothing is pending.
 */
export async function fetchChainSyncRejection(
  wkIdentity: string,
  getReadHeaders?: (
    url: string,
  ) => Promise<Record<string, string> | null | undefined>,
): Promise<ChainSyncRejection | null> {
  try {
    const url = `https://${sspConfig().relay}/v1/action/${wkIdentity}`;
    // RA-4: sign the poll whenever the key material is there.
    const headers = getReadHeaders ? await getReadHeaders(url) : null;
    const response = await axios.get<{ action?: string; payload?: unknown }>(
      url,
      headers ? { headers } : undefined,
    );
    if (response.data?.action !== 'chainsyncrejected') {
      return null;
    }
    return parseChainSyncRejection(response.data.payload);
  } catch {
    return null;
  }
}
