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
import secureLocalStorage from 'react-secure-storage';
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
} from './wallet';
import { setXpubWallet, setXpubKey, store } from '../store';
import type { cryptos } from '../types';

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
 * started (the key needs ~3s per not-yet-derived chain plus 1.5s spacing).
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
  const blockchainConfig = blockchains[chain];
  if (!blockchainConfig) return false;
  const key = `2-xpub-48-${blockchainConfig.slip}-0-${getScriptType(
    blockchainConfig.scriptType,
  )}-${blockchainConfig.id}`;
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
 */
export async function storeKeyXpubForChain(
  chain: keyof cryptos,
  keyXpub: string,
  passwordBlob: string,
): Promise<void> {
  const blockchainConfig = blockchains[chain];
  const derivationPath = `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
    blockchainConfig.scriptType,
  )}-${blockchainConfig.id}`;
  const password = await decryptSessionPassword(passwordBlob);
  const encryptedXpub2 = await passworderEncrypt(password, keyXpub);
  secureLocalStorage.setItem(`2-${derivationPath}`, encryptedXpub2);
  setXpubKey(chain, keyXpub);
}

/**
 * Fetch the latest pending action for the wkIdentity — used to detect a
 * 'chainsyncrejected' answer from the key. Works against old relays too
 * (action storage/GET are generic over action types). Returns null when
 * nothing is pending.
 */
export async function fetchChainSyncRejection(
  wkIdentity: string,
): Promise<ChainSyncRejection | null> {
  try {
    const response = await axios.get<{ action?: string; payload?: unknown }>(
      `https://${sspConfig().relay}/v1/action/${wkIdentity}`,
    );
    if (response.data?.action !== 'chainsyncrejected') {
      return null;
    }
    return parseChainSyncRejection(response.data.payload);
  } catch {
    return null;
  }
}
