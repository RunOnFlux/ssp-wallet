/**
 * useRelayAuth Hook
 *
 * Provides authentication capabilities for SSP Relay communication.
 * This hook handles the encryption/decryption of keys and signing of messages.
 */

import { useCallback } from 'react';
import { useAppSelector } from '../hooks';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../lib/fingerprint';
import { generateAddressKeypair, getScriptType } from '../lib/wallet';
import {
  signMessage,
  createSignaturePayload,
  computeBodyHash,
  AuthFields,
  SignaturePayload,
} from '../lib/relayAuth';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';

interface UseRelayAuthResult {
  /**
   * Create authentication fields for a wkIdentity request.
   * Returns null if authentication fails.
   *
   * @param action - The action type (sync, action, token, join)
   * @param wkIdentity - The wkIdentity to authenticate
   * @param requestBody - Optional request body to hash and bind to signature
   * @param chain - The blockchain (defaults to identityChain)
   */
  createWkIdentityAuth: (
    action: SignaturePayload['action'],
    wkIdentity: string,
    requestBody?: Record<string, unknown>,
    chain?: keyof cryptos,
  ) => Promise<AuthFields | null>;

  /**
   * Check if authentication is available (user is logged in with password).
   */
  isAuthAvailable: boolean;
}

/**
 * Hook for creating authenticated relay requests.
 *
 * Usage:
 * ```
 * const { createWkIdentityAuth } = useRelayAuth();
 *
 * const sendAction = async () => {
 *   const auth = await createWkIdentityAuth('action', wkIdentity);
 *   if (!auth) {
 *     console.error('Auth failed');
 *     return;
 *   }
 *   await axios.post('/v1/action', { ...data, ...auth });
 * };
 * ```
 */
export function useRelayAuth(): UseRelayAuthResult {
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const {
    identityChain,
    sspWalletKeyInternalIdentity,
    sspWalletKeyInternalIdentityWitnessScript: witnessScript,
  } = useAppSelector((state) => state.sspState);

  const isAuthAvailable = Boolean(
    passwordBlob && sspWalletKeyInternalIdentity && witnessScript,
  );

  /**
   * Get the decrypted xpriv for the identity chain.
   */
  const getDecryptedXpriv = useCallback(async (): Promise<string | null> => {
    if (!passwordBlob) {
      console.warn('No password blob available for authentication');
      return null;
    }

    try {
      const identityChainConfig = blockchains[identityChain];
      const xprivKey = `xpriv-48-${identityChainConfig.slip}-0-${getScriptType(
        identityChainConfig.scriptType,
      )}-${identityChainConfig.id}`;

      const xprivEncrypted = secureLocalStorage.getItem(xprivKey);
      if (!xprivEncrypted || typeof xprivEncrypted !== 'string') {
        console.warn('No encrypted xpriv found');
        return null;
      }

      const fingerprint = getFingerprint();
      const password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        console.warn('Failed to decrypt password');
        return null;
      }

      const xpriv = await passworderDecrypt(password, xprivEncrypted);
      if (typeof xpriv !== 'string') {
        console.warn('Failed to decrypt xpriv');
        return null;
      }

      return xpriv;
    } catch (error) {
      console.error('Error decrypting xpriv:', error);
      return null;
    }
  }, [passwordBlob, identityChain]);

  /**
   * Create authentication fields for a wkIdentity request.
   */
  const createWkIdentityAuth = useCallback(
    async (
      action: SignaturePayload['action'],
      wkIdentity: string,
      requestBody?: Record<string, unknown>,
      chain: keyof cryptos = identityChain,
    ): Promise<AuthFields | null> => {
      try {
        // Check stored witness script is available
        if (!witnessScript) {
          console.error('witnessScript not available in state');
          return null;
        }

        // Get the decrypted xpriv
        const xpriv = await getDecryptedXpriv();
        if (!xpriv) {
          console.error('Could not get xpriv for authentication');
          return null;
        }

        // Generate identity keypair for signing (typeIndex=10 for internal identity)
        const identityKeypair = generateAddressKeypair(xpriv, 10, 0, chain);

        // Compute body hash if request body is provided
        const dataHash = requestBody ? computeBodyHash(requestBody) : undefined;

        // Create the signature payload (includes body hash for tamper protection)
        const payload = createSignaturePayload(action, wkIdentity, dataHash);
        const message = JSON.stringify(payload);

        // Sign the message
        const signature = signMessage(message, identityKeypair.privKey, 'btc');

        return {
          signature,
          message,
          publicKey: identityKeypair.pubKey,
          witnessScript,
        };
      } catch (error) {
        console.error('Error creating wkIdentity auth:', error);
        return null;
      }
    },
    [getDecryptedXpriv, witnessScript, identityChain],
  );

  return {
    createWkIdentityAuth,
    isAuthAvailable,
  };
}

export default useRelayAuth;
