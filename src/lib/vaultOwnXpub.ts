/**
 * This wallet's own enterprise account xpub — what EnterpriseVaultXpub
 * submitted for the vault — computed on this device for VD-3 check 5.
 *
 *  - UTXO / EVM: the BIP32 xpub at m/48'/coin'/orgIndex'/scriptType'.
 *  - Solana: the JSON array of 20 ed25519 pubkeys at that account's
 *    /{vaultIndex}/0..19 slot.
 */

import { HDKey } from '@scure/bip32';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { blockchains } from '@storage/blockchains';
import { getFingerprint } from './fingerprint';
import { getMasterXpriv, generateSolanaPubkeyArray } from './wallet';
import { assertEnterpriseIndices } from './enterpriseIndexGuard';
import type { cryptos } from '../types';

/** Own account xpub from the vault account xpriv this device signs with. */
export function ownVaultAccountXpubFromXpriv(
  vaultXpriv: string,
  chain: string,
  vaultIndex: number,
): string {
  const config = blockchains[chain as keyof cryptos];
  if (!config) throw new Error('Invalid chain');
  if (config.chainType === 'sol') {
    return JSON.stringify(
      generateSolanaPubkeyArray(vaultXpriv, chain as keyof cryptos, vaultIndex),
    );
  }
  return HDKey.fromExtendedKey(vaultXpriv, config.bip32).publicExtendedKey;
}

// Public data, cached per session so the dialog does not decrypt the seed
// twice. Keyed by the wallet's WK identity so another wallet never reuses it.
const ownXpubCache = new Map<string, string>();

/**
 * Decrypt the seed and compute the own account xpub for (chain, orgIndex,
 * vaultIndex). The seed and xpriv never leave this function.
 */
export async function computeOwnVaultAccountXpub(params: {
  passwordBlob: string;
  wkIdentity: string;
  chain: string;
  orgIndex: number;
  vaultIndex: number;
}): Promise<string> {
  const { passwordBlob, wkIdentity, chain, orgIndex, vaultIndex } = params;
  assertEnterpriseIndices({ orgIndex, vaultIndex });
  const cacheKey = `${wkIdentity}|${chain}|${orgIndex}|${vaultIndex}`;
  const cached = ownXpubCache.get(cacheKey);
  if (cached) return cached;

  const config = blockchains[chain as keyof cryptos];
  if (!config) throw new Error('Invalid chain');
  if (!passwordBlob) throw new Error('Not logged in');
  const walSeedBlob = secureLocalStorage.getItem('walletSeed');
  if (!walSeedBlob || typeof walSeedBlob !== 'string') {
    throw new Error('Could not retrieve wallet seed');
  }
  let password = await passworderDecrypt(getFingerprint(), passwordBlob);
  if (typeof password !== 'string')
    throw new Error('Failed to decrypt password');
  let walletSeed = await passworderDecrypt(password, walSeedBlob);
  password = '';
  if (typeof walletSeed !== 'string') {
    throw new Error('Failed to decrypt wallet seed');
  }
  let vaultXpriv = getMasterXpriv(
    walletSeed,
    48,
    config.slip,
    orgIndex,
    config.scriptType,
    chain as keyof cryptos,
  );
  walletSeed = '';
  const xpub = ownVaultAccountXpubFromXpriv(vaultXpriv, chain, vaultIndex);
  vaultXpriv = '';
  ownXpubCache.set(cacheKey, xpub);
  return xpub;
}
