/**
 * useRelayAuth Hook
 *
 * Provides authentication capabilities for SSP Relay communication.
 * This hook handles the encryption/decryption of keys and signing of messages.
 */

import { useCallback, useEffect } from 'react';
import { useAppSelector } from '../hooks';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../lib/fingerprint';
import { generateAddressKeypair, getScriptType } from '../lib/wallet';
import {
  signMessage,
  createSignaturePayload,
  computeBodyHash,
  createReadAuthHeaders as buildReadAuthHeaders,
  AuthFields,
  SignaturePayload,
  ReadAuthHeaders,
} from '../lib/relayAuth';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';
import { store } from '../store';

/**
 * The auth-relevant state as it is NOW. Callers such as polling intervals and
 * multi-step pairing flows hold a callback created several renders ago; reading
 * the store at call time (instead of the render-captured selector values)
 * means a witness script or identity that landed since is still used.
 */
function liveAuthState() {
  const state = store.getState();
  return {
    passwordBlob: state.passwordBlob.passwordBlob,
    identityChain: state.sspState.identityChain,
    walletIdentity: state.sspState.sspWalletInternalIdentity,
    wkIdentity: state.sspState.sspWalletKeyInternalIdentity,
    witnessScript: state.sspState.sspWalletKeyInternalIdentityWitnessScript,
  };
}

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
   * Build the RA-4 read-auth headers for a GET poll of `url`.
   *
   * - kind 'wk': `identity` is the wkIdentity (GET /v1/action/<wk>); signed by
   *   the wallet's /10/0 key, with the 2-of-2 witness script.
   * - kind 'wallet': `identity` is the wallet's single-sig walletIdentity
   *   (GET /v1/sync/<walletIdentity>); same /10/0 key, no witness script.
   *
   * Returns null when the key material is not available yet (not logged in,
   * or no witness script before pairing) — the caller then sends the GET
   * unauthenticated, which the relay serves only in its `log` mode.
   */
  createReadAuthHeaders: (
    kind: 'wk' | 'wallet',
    identity: string,
    url: string,
  ) => Promise<ReadAuthHeaders | null>;

  /**
   * Check if authentication is available (user is logged in with password).
   */
  isAuthAvailable: boolean;
}

interface IdentityKeypair {
  privKey: string;
  pubKey: string;
}

/**
 * The wallet's /10/0 identity keypair, cached for read-auth signing only.
 *
 * GET polls run every second while pairing or waiting for SSP Key, and every
 * read needs a fresh nonce and therefore a fresh signature. Deriving the key
 * means two passworder decrypts at 900k PBKDF2 iterations each, which cannot
 * run once a second. The cache is keyed by the session password blob (so a
 * logout or re-login drops it) and expires after a few minutes. It holds the
 * same key material the page can already derive from the in-memory password
 * blob, so it adds no new exposure.
 */
const IDENTITY_KEY_CACHE_MS = 5 * 60 * 1000;
let identityKeyCache: {
  passwordBlob: string;
  chain: keyof cryptos;
  keypair: IdentityKeypair;
  expiresAt: number;
} | null = null;

/** Drop the cached identity keypair (logout, password change, tests). */
export function clearRelayAuthKeyCache(): void {
  identityKeyCache = null;
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
    sspWalletInternalIdentity,
    sspWalletKeyInternalIdentity,
    sspWalletKeyInternalIdentityWitnessScript: witnessScript,
  } = useAppSelector((state) => state.sspState);

  const isAuthAvailable = Boolean(
    passwordBlob && sspWalletKeyInternalIdentity && witnessScript,
  );

  useEffect(() => {
    if (!passwordBlob) {
      clearRelayAuthKeyCache();
    }
  }, [passwordBlob]);

  /**
   * Get the decrypted xpriv for the identity chain.
   */
  const getDecryptedXpriv = useCallback(async (): Promise<string | null> => {
    const live = liveAuthState();
    const currentPasswordBlob = live.passwordBlob || passwordBlob;
    const currentIdentityChain = live.identityChain || identityChain;
    if (!currentPasswordBlob) {
      console.warn('No password blob available for authentication');
      return null;
    }

    try {
      const identityChainConfig = blockchains[currentIdentityChain];
      const xprivKey = `xpriv-48-${identityChainConfig.slip}-0-${getScriptType(
        identityChainConfig.scriptType,
      )}-${identityChainConfig.id}`;

      const xprivEncrypted = secureLocalStorage.getItem(xprivKey);
      if (!xprivEncrypted || typeof xprivEncrypted !== 'string') {
        console.warn('No encrypted xpriv found');
        return null;
      }

      const fingerprint = getFingerprint();
      const password = await passworderDecrypt(
        fingerprint,
        currentPasswordBlob,
      );
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
        const currentWitnessScript =
          liveAuthState().witnessScript || witnessScript;
        if (!currentWitnessScript) {
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
          witnessScript: currentWitnessScript,
        };
      } catch (error) {
        console.error('Error creating wkIdentity auth:', error);
        return null;
      }
    },
    [getDecryptedXpriv, witnessScript, identityChain],
  );

  /**
   * The /10/0 identity keypair, from the short-lived cache when possible.
   */
  const getCachedIdentityKeypair =
    useCallback(async (): Promise<IdentityKeypair | null> => {
      const live = liveAuthState();
      const currentPasswordBlob = live.passwordBlob || passwordBlob;
      const currentIdentityChain = live.identityChain || identityChain;
      if (!currentPasswordBlob) {
        clearRelayAuthKeyCache();
        return null;
      }
      const now = Date.now();
      if (
        identityKeyCache &&
        identityKeyCache.passwordBlob === currentPasswordBlob &&
        identityKeyCache.chain === currentIdentityChain &&
        identityKeyCache.expiresAt > now
      ) {
        return identityKeyCache.keypair;
      }
      const xpriv = await getDecryptedXpriv();
      if (!xpriv) return null;
      const derived = generateAddressKeypair(
        xpriv,
        10,
        0,
        currentIdentityChain,
      );
      const keypair = { privKey: derived.privKey, pubKey: derived.pubKey };
      identityKeyCache = {
        passwordBlob: currentPasswordBlob,
        chain: currentIdentityChain,
        keypair,
        expiresAt: now + IDENTITY_KEY_CACHE_MS,
      };
      return keypair;
    }, [passwordBlob, identityChain, getDecryptedXpriv]);

  const createReadAuthHeaders = useCallback(
    async (
      kind: 'wk' | 'wallet',
      identity: string,
      url: string,
    ): Promise<ReadAuthHeaders | null> => {
      try {
        if (!identity) return null;
        const live = liveAuthState();
        const currentWitnessScript = live.witnessScript || witnessScript;
        const currentWkIdentity =
          live.wkIdentity || sspWalletKeyInternalIdentity;
        const currentWalletIdentity =
          live.walletIdentity || sspWalletInternalIdentity;
        // Only sign for the identity this wallet actually holds: a header set
        // the relay can't verify is answered with 401 even in its `log` mode,
        // whereas an unauthenticated read is still served there.
        if (kind === 'wk') {
          if (!currentWitnessScript || identity !== currentWkIdentity) {
            return null;
          }
        } else if (identity !== currentWalletIdentity) {
          return null;
        }
        const keypair = await getCachedIdentityKeypair();
        if (!keypair) return null;
        return buildReadAuthHeaders({
          identity,
          url,
          privateKeyWIF: keypair.privKey,
          publicKey: keypair.pubKey,
          witnessScript: kind === 'wk' ? currentWitnessScript : undefined,
        });
      } catch (error) {
        console.error('Error creating read auth headers:', error);
        return null;
      }
    },
    [
      getCachedIdentityKeypair,
      witnessScript,
      sspWalletInternalIdentity,
      sspWalletKeyInternalIdentity,
    ],
  );

  return {
    createWkIdentityAuth,
    createReadAuthHeaders,
    isAuthAvailable,
  };
}

export default useRelayAuth;
