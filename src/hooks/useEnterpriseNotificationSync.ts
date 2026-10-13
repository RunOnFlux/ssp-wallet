/**
 * useEnterpriseNotificationSync Hook
 *
 * Syncs SSP Enterprise notification subscription status on login.
 * - Fetches notification status from relay
 * - Updates local notification config from remote state
 * - Sends xpubs for any chains that are synced locally but missing on server
 */

import { useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAppSelector } from '../hooks';
import { useRelayAuth } from './useRelayAuth';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../lib/fingerprint';
import { getScriptType } from '../lib/wallet';
import { replenishWalletEnterpriseNonces } from '../lib/enterpriseNonces';
import { attachRequiredWkAuth } from '../lib/relayRequestAuth';
import { blockchains } from '@storage/blockchains';
import {
  sspConfig,
  updateEnterpriseNotificationFromStatus,
} from '@storage/ssp';
import { cryptos } from '../types';

interface EnterpriseNotificationStatusResponse {
  status: string;
  data?: {
    subscribed: boolean;
    email?: string;
    subscribedAt?: string;
    preferences?: {
      incomingTx: boolean;
      outgoingTx: boolean;
      largeTransactions: boolean;
      lowBalance: boolean;
      weeklyReport: boolean;
      marketing: boolean;
      largeTransactionThresholdUsd?: number;
      minTxNotificationUsd?: number;
    };
    syncedChains: string[];
  };
}

/**
 * Hook to sync SSP Enterprise notification status on login.
 * Automatically fetches status and sends missing xpubs.
 */
export function useEnterpriseNotificationSync(): void {
  const hasSynced = useRef(false);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity, sspWalletInternalIdentity } =
    useAppSelector((state) => state.sspState);
  const { createWkIdentityAuth, createReadAuthHeaders, isAuthAvailable } =
    useRelayAuth();

  const syncEnterpriseNotificationStatus = useCallback(async () => {
    if (!sspWalletKeyInternalIdentity || !isAuthAvailable || !passwordBlob) {
      return;
    }

    try {
      // Get status from relay
      const statusData: Record<string, unknown> = {
        wkIdentity: sspWalletKeyInternalIdentity,
      };

      // Authentication is mandatory (RA-2): without it nothing is sent.
      const signedStatusData = await attachRequiredWkAuth(
        statusData,
        sspWalletKeyInternalIdentity,
        createWkIdentityAuth,
      );

      const response = await axios.post<EnterpriseNotificationStatusResponse>(
        `https://${sspConfig().relay}/v1/enterprise/subscription`,
        signedStatusData,
      );

      if (response.data?.status !== 'success' || !response.data?.data) {
        console.log(
          '[EnterpriseNotificationSync] Status check failed or not subscribed',
        );
        return;
      }

      const status = response.data.data;

      // Update local config from remote status
      await updateEnterpriseNotificationFromStatus(status);

      // If user is subscribed, check if any xpubs are missing
      if (status.subscribed && status.syncedChains) {
        const syncedSet = new Set(status.syncedChains);

        // Get password for decryption
        const fingerprint = getFingerprint();
        const password = await passworderDecrypt(fingerprint, passwordBlob);
        if (typeof password !== 'string') {
          console.warn(
            '[EnterpriseNotificationSync] Failed to decrypt password',
          );
          return;
        }

        // Find chains that are synced locally but missing on server
        const chainKeys = Object.keys(blockchains) as (keyof cryptos)[];
        const chainsToSync: Record<
          string,
          { walletXpub: string; keyXpub: string }
        > = {};

        for (const chain of chainKeys) {
          // Skip if already synced on server
          if (syncedSet.has(chain)) {
            continue;
          }

          const chainConfig = blockchains[chain];
          const xpubKey = `xpub-48-${chainConfig.slip}-0-${getScriptType(chainConfig.scriptType)}-${chainConfig.id}`;
          const xpub2Key = `2-xpub-48-${chainConfig.slip}-0-${getScriptType(chainConfig.scriptType)}-${chainConfig.id}`;

          const xpubEncrypted = secureLocalStorage.getItem(xpubKey);
          const xpub2Encrypted = secureLocalStorage.getItem(xpub2Key);

          // Only include chains where both wallet and key xpubs are synced
          if (
            xpubEncrypted &&
            typeof xpubEncrypted === 'string' &&
            xpub2Encrypted &&
            typeof xpub2Encrypted === 'string'
          ) {
            try {
              const walletXpub = await passworderDecrypt(
                password,
                xpubEncrypted,
              );
              const keyXpub = await passworderDecrypt(password, xpub2Encrypted);

              if (
                typeof walletXpub === 'string' &&
                typeof keyXpub === 'string'
              ) {
                chainsToSync[chain] = { walletXpub, keyXpub };
              }
            } catch (decryptError) {
              console.warn(
                `[EnterpriseNotificationSync] Failed to decrypt xpubs for chain ${chain}`,
                decryptError,
              );
            }
          }
        }

        // If we have chains to sync, send them via subscribe endpoint
        if (Object.keys(chainsToSync).length > 0) {
          console.log(
            `[EnterpriseNotificationSync] Syncing ${Object.keys(chainsToSync).length} missing chains`,
          );

          // No `preferences` field on purpose: the server preserves the stored
          // preferences when the field is absent. Re-posting defaults here used
          // to clobber choices made in Settings or the SSP Enterprise app.
          const subscribeData: Record<string, unknown> = {
            wkIdentity: sspWalletKeyInternalIdentity,
            walletIdentity: sspWalletInternalIdentity,
            email: status.email,
            chains: chainsToSync,
          };

          // RA-2: never post the subscription unsigned — a missing auth
          // throws here and the sync is retried on the next login.
          const signedSubscribeData = await attachRequiredWkAuth(
            subscribeData,
            sspWalletKeyInternalIdentity,
            createWkIdentityAuth,
          );

          await axios.post(
            `https://${sspConfig().relay}/v1/enterprise/subscribe`,
            signedSubscribeData,
          );

          console.log(
            '[EnterpriseNotificationSync] Missing chains synced successfully',
          );
        }
      }
    } catch (error) {
      // Silently fail - notification sync is not critical
      console.warn(
        '[EnterpriseNotificationSync] Error syncing notification status:',
        error,
      );
    }

    // Non-blocking: check enterprise nonce pool and replenish if needed.
    // Runs independently of notification subscription status.
    try {
      const readHeaders = (url: string) =>
        createReadAuthHeaders('wk', sspWalletKeyInternalIdentity, url);
      const nonceStatusUrl = `https://${sspConfig().relay}/v1/nonces/status/${sspWalletKeyInternalIdentity}`;
      // RA-4: signed GET read of the nonce pool status.
      const nonceStatusHeaders = await readHeaders(nonceStatusUrl);
      const nonceStatusRes = await axios.get(nonceStatusUrl, {
        ...(nonceStatusHeaders ? { headers: nonceStatusHeaders } : {}),
      });
      const nonceData = nonceStatusRes.data as
        | { data?: { replenishNeeded?: { wallet?: boolean } } }
        | undefined;
      if (nonceData?.data?.replenishNeeded?.wallet) {
        // The relay can only TRIGGER a replenish; the replenish itself runs
        // under a cross-view Web Lock, merges into a fresh read of the pool
        // and never resurrects burned nonces (H-19 / K2). RA-2/RA-4: the nonce
        // POSTs and the status read are signed with the WK identity.
        replenishWalletEnterpriseNonces(
          sspWalletKeyInternalIdentity,
          passwordBlob,
          false,
          { createAuth: createWkIdentityAuth, readHeaders },
        ).catch((e) =>
          console.log(
            '[EnterpriseNotificationSync] Wallet nonce replenish error:',
            e,
          ),
        );
      }
    } catch (nonceError) {
      console.log(
        '[EnterpriseNotificationSync] Nonce pool check failed:',
        nonceError,
      );
    }
  }, [
    sspWalletKeyInternalIdentity,
    sspWalletInternalIdentity,
    isAuthAvailable,
    passwordBlob,
    createWkIdentityAuth,
    createReadAuthHeaders,
  ]);

  useEffect(() => {
    // Only sync once per session
    if (hasSynced.current) {
      return;
    }

    // Wait until auth is available
    if (!isAuthAvailable || !sspWalletKeyInternalIdentity) {
      return;
    }

    hasSynced.current = true;
    void syncEnterpriseNotificationStatus();
  }, [
    isAuthAvailable,
    sspWalletKeyInternalIdentity,
    syncEnterpriseNotificationStatus,
  ]);
}

export default useEnterpriseNotificationSync;
