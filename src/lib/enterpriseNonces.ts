import axios from 'axios';
import secureLocalStorage from 'react-secure-storage';
import {
  encrypt as passworderEncrypt,
  decrypt as passworderDecrypt,
} from '@metamask/browser-passworder';
import { sspConfig } from '@storage/ssp';
import { getFingerprint } from './fingerprint';
import { generatePublicNonce } from './wallet';
import type { publicPrivateNonce } from '../types';

const TARGET_COUNT = 50;
const STORAGE_KEY = 'enterpriseNoncesWallet';

let replenishing = false;

/**
 * Decrypt enterprise nonces from encrypted storage.
 * Returns empty array if not found or decryption fails.
 */
export async function loadEncryptedNonces(
  passwordBlob: string,
): Promise<publicPrivateNonce[]> {
  try {
    const encrypted = secureLocalStorage.getItem(STORAGE_KEY) as string | null;
    if (!encrypted) return [];
    const fingerprint = getFingerprint();
    const password = await passworderDecrypt(fingerprint, passwordBlob);
    if (typeof password !== 'string') return [];
    const decrypted = await passworderDecrypt(password, encrypted);
    if (typeof decrypted !== 'string') return [];
    return JSON.parse(decrypted) as publicPrivateNonce[];
  } catch {
    return [];
  }
}

/**
 * Encrypt and store enterprise nonces.
 */
export async function saveEncryptedNonces(
  nonces: publicPrivateNonce[],
  passwordBlob: string,
): Promise<void> {
  const fingerprint = getFingerprint();
  const password = await passworderDecrypt(fingerprint, passwordBlob);
  if (typeof password !== 'string') {
    throw new Error('Failed to decrypt password for nonce storage');
  }
  const encrypted = await passworderEncrypt(password, JSON.stringify(nonces));
  secureLocalStorage.setItem(STORAGE_KEY, encrypted);
}

/**
 * Check enterprise nonce pool status and replenish wallet nonces if below threshold.
 * Fetches server-side pool count, generates enough to reach TARGET_COUNT on the server,
 * stores them locally, and submits public parts to the relay.
 *
 * @param forceReplace - If true, delete all existing nonces and generate a fresh full set.
 *   Used by the manual "Sync Nonces" action from the enterprise app.
 */
export async function replenishWalletEnterpriseNonces(
  wkIdentity: string,
  passwordBlob: string,
  forceReplace = false,
): Promise<void> {
  if (replenishing) return;
  replenishing = true;
  try {
    // Check server-side pool status to know how many nonces the server actually has
    let serverAvailable = 0;
    try {
      const statusRes = await axios.get(
        `https://${sspConfig().relay}/v1/nonces/status/${wkIdentity}`,
      );
      const poolData = statusRes.data as
        | { data?: { wallet?: { available?: number } } }
        | undefined;
      if (poolData?.data?.wallet?.available != null) {
        serverAvailable = poolData.data.wallet.available;
      }
    } catch {
      // If status check fails, fall back to local count
    }

    // Load existing enterprise nonces (encrypted)
    let existingNonces = await loadEncryptedNonces(passwordBlob);

    if (forceReplace) {
      // Force replace: purge ALL server nonces and clear local nonces
      try {
        await axios.post(`https://${sspConfig().relay}/v1/nonces/reconcile`, {
          wkIdentity,
          source: 'wallet',
          localNonces: [], // empty = purge all server nonces
        });
      } catch {
        // Best-effort purge
      }
      existingNonces = [];
      serverAvailable = 0;
    } else {
      // Reconcile: tell server which nonces we actually have locally.
      // This purges server-side 'available' nonces that we don't have
      // (e.g. local save failed after relay submission, extension reinstalled).
      if (existingNonces.length > 0 || serverAvailable > 0) {
        try {
          const localPublicKeys = existingNonces.map((n) => ({
            kPublic: n.kPublic,
            kTwoPublic: n.kTwoPublic,
          }));
          const reconcileRes = await axios.post(
            `https://${sspConfig().relay}/v1/nonces/reconcile`,
            {
              wkIdentity,
              source: 'wallet',
              localNonces: localPublicKeys,
            },
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
    }

    // Generate based on what the SERVER needs, not just local count.
    // This handles the case where server nonces were deleted but local still has them.
    const toGenerate = Math.max(
      TARGET_COUNT - existingNonces.length,
      TARGET_COUNT - serverAvailable,
      0,
    );
    if (toGenerate <= 0) return;

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
    await axios.post(`https://${sspConfig().relay}/v1/nonces`, {
      wkIdentity,
      source: 'wallet',
      nonces: publicParts,
    });

    // Only store locally after successful relay submission
    const allNonces = [...existingNonces, ...newNonces];
    await saveEncryptedNonces(allNonces, passwordBlob);

    console.log(
      `[Enterprise Nonces] Wallet: Generated and submitted ${toGenerate} nonces (server had ${serverAvailable}, local had ${existingNonces.length})`,
    );
  } catch (error) {
    console.log('[Enterprise Nonces] Wallet replenish error:', error);
  } finally {
    replenishing = false;
  }
}
