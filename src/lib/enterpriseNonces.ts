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
 * Loads existing nonces from encrypted storage, generates new ones, stores them,
 * and submits public parts to the relay.
 */
export async function replenishWalletEnterpriseNonces(
  wkIdentity: string,
  passwordBlob: string,
): Promise<void> {
  try {
    // Load existing enterprise nonces (encrypted)
    const existingNonces = await loadEncryptedNonces(passwordBlob);

    const toGenerate = TARGET_COUNT - existingNonces.length;
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
      `[Enterprise Nonces] Wallet: Generated and submitted ${toGenerate} nonces`,
    );
  } catch (error) {
    console.log('[Enterprise Nonces] Wallet replenish error:', error);
  }
}
