import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { fluxnode } from '@runonflux/flux-sdk';
import { useAppSelector } from '../../hooks';
import { cryptos } from '../../types';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import { getMasterXpriv, generateAddressKeypair } from '../../lib/wallet';
import { generateRequestId } from '../../lib/wkSign';
import type { WkSignRequesterInfo } from '../../lib/wkSign';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import { useSocket } from '../../hooks/useSocket';
import axios from 'axios';

interface EnterpriseFluxNodeStartProps {
  open: boolean;
  openAction: (
    data: { status: string; result?: { signedTxHex: string } } | null,
  ) => void;
  requesterInfo: WkSignRequesterInfo | null;
  chain: string;
  orgIndex: number;
  vaultIndex: number;
  addressIndex: number;
  nodeName: string;
  collateralAmount: string;
  identityPubKey: string;
  collateralTxid: string;
  collateralVout: number;
  redeemScript: string;
  signingDevice: 'wallet' | 'key';
  delegates: string[];
}

function EnterpriseFluxNodeStart({
  open,
  openAction,
  requesterInfo,
  chain,
  orgIndex,
  vaultIndex,
  addressIndex,
  nodeName,
  collateralAmount,
  identityPubKey,
  collateralTxid,
  collateralVout,
  redeemScript,
  signingDevice,
  delegates,
}: EnterpriseFluxNodeStartProps) {
  const { t } = useTranslation(['home', 'common']);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [waitingForKey, setWaitingForKey] = useState(false);

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity: wkIdentity } = useAppSelector(
    (state) => state.sspState,
  );

  const { enterpriseFluxNodeStarted, clearEnterpriseFluxNodeStarted } =
    useSocket();
  const { createWkIdentityAuth } = useRelayAuth();
  const requestIdRef = useRef('');

  const chainConfig = blockchains[chain as keyof cryptos];

  // Listen for Key's response
  useEffect(() => {
    if (
      enterpriseFluxNodeStarted &&
      waitingForKey &&
      requestIdRef.current &&
      enterpriseFluxNodeStarted.requestId === requestIdRef.current
    ) {
      setWaitingForKey(false);
      setProcessing(false);
      if (enterpriseFluxNodeStarted.signedTxHex) {
        openAction({
          status: 'SUCCESS',
          result: { signedTxHex: enterpriseFluxNodeStarted.signedTxHex },
        });
      } else {
        setError(
          enterpriseFluxNodeStarted.error ||
            t('home:enterpriseFluxNodeStart.key_rejected'),
        );
      }
      clearEnterpriseFluxNodeStarted?.();
    }
  }, [
    enterpriseFluxNodeStarted,
    waitingForKey,
    openAction,
    clearEnterpriseFluxNodeStarted,
  ]);

  const resetState = useCallback(() => {
    setProcessing(false);
    setError('');
    setWaitingForKey(false);
    requestIdRef.current = '';
    clearEnterpriseFluxNodeStarted?.();
  }, [clearEnterpriseFluxNodeStarted]);

  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open, resetState]);

  /**
   * Derive the vault collateral keypair.
   * Path: m/48'/coin'/orgIndex'/scriptType'/{vaultIndex}/{addressIndex}
   */
  const deriveCollateralKeypair = async () => {
    if (!passwordBlob)
      throw new Error(t('home:enterpriseFluxNodeStart.err_not_logged_in'));
    if (!chainConfig)
      throw new Error(t('home:enterpriseFluxNodeStart.err_invalid_chain'));

    const walSeedBlob = secureLocalStorage.getItem('walletSeed');
    if (!walSeedBlob || typeof walSeedBlob !== 'string') {
      throw new Error(t('home:enterpriseFluxNodeStart.err_seed_unavailable'));
    }

    const fingerprint = getFingerprint();
    let password = await passworderDecrypt(fingerprint, passwordBlob);
    if (typeof password !== 'string') {
      throw new Error(t('home:enterpriseFluxNodeStart.err_decrypt_password'));
    }

    let walletSeed = await passworderDecrypt(password, walSeedBlob);
    password = '';
    if (typeof walletSeed !== 'string') {
      throw new Error(t('home:enterpriseFluxNodeStart.err_decrypt_seed'));
    }

    // m/48'/coin'/orgIndex'/scriptType'
    let vaultXpriv = getMasterXpriv(
      walletSeed,
      48,
      chainConfig.slip,
      orgIndex,
      chainConfig.scriptType,
      chain as keyof cryptos,
    );

    walletSeed = '';

    // Derive at vaultIndex/addressIndex
    const keypair = generateAddressKeypair(
      vaultXpriv,
      vaultIndex,
      addressIndex,
      chain as keyof cryptos,
    );
    vaultXpriv = ''; // clear sensitive data

    return keypair;
  };

  const handleReject = () => {
    openAction(null);
  };

  const handleSign = async () => {
    setProcessing(true);
    setError('');

    let collateralPrivKey = '';

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // Build delegate data if delegates are present
      let delegateData;
      if (delegates.length > 0) {
        delegateData = { version: 1, type: 1, delegatePublicKeys: delegates };
      }

      if (signingDevice === 'wallet') {
        // Wallet signs directly — derive collateral key
        const keypair = await deriveCollateralKeypair();
        collateralPrivKey = keypair.privKey;

        const signedTxHex = fluxnode.startFluxNodev6WithPubKey(
          collateralTxid,
          collateralVout,
          collateralPrivKey,
          identityPubKey,
          timestamp,
          true, // compressedCollateralPrivateKey
          redeemScript,
          delegateData,
        );

        // Clear sensitive data
        collateralPrivKey = '';

        openAction({
          status: 'SUCCESS',
          result: { signedTxHex },
        });
      } else {
        // Key signs — relay the request via socket
        const reqId = generateRequestId();
        requestIdRef.current = reqId;

        const payload = JSON.stringify({
          chain,
          orgIndex,
          vaultIndex,
          addressIndex,
          nodeName,
          collateralAmount,
          identityPubKey,
          collateralTxid,
          collateralVout,
          redeemScript,
          delegates,
          requestId: reqId,
          wkIdentity,
        });

        const data: Record<string, unknown> = {
          action: 'enterprisefluxnodestart',
          payload,
          chain,
          path: '10-0',
          wkIdentity,
        };

        try {
          const auth = await createWkIdentityAuth('action', wkIdentity, data);
          if (auth) Object.assign(data, auth);
        } catch {
          console.warn(
            '[EnterpriseFluxNodeStart] Auth not available, sending without signature',
          );
        }

        await axios.post(`https://${sspConfig().relay}/v1/action`, data, {
          timeout: 30000,
        });

        setWaitingForKey(true);
      }
    } catch (err) {
      collateralPrivKey = '';
      console.error('[EnterpriseFluxNodeStart] Error:', err);
      setError(
        err instanceof Error
          ? err.message
          : t('home:enterpriseFluxNodeStart.err_failed'),
      );
      setProcessing(false);
    }
  };

  if (!open) return null;

  // Display values
  const amountFlux = collateralAmount
    ? (parseInt(collateralAmount, 10) / 1e8).toFixed(2)
    : '?';
  const chainLabel = chain === 'fluxTestnet' ? 'Flux Testnet' : 'Flux';
  const deviceLabel = signingDevice === 'wallet' ? 'SSP Wallet' : 'SSP Key';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          maxWidth: 400,
          width: '90%',
          color: '#333',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>
          {t('home:enterpriseFluxNodeStart.title')}
        </h3>

        {requesterInfo && (
          <div
            style={{
              fontSize: 12,
              color: '#666',
              marginBottom: 12,
              padding: '4px 8px',
              background: '#f5f5f5',
              borderRadius: 4,
            }}
          >
            {t('home:enterpriseFluxNodeStart.from')}:{' '}
            {requesterInfo.siteName || requesterInfo.origin}
          </div>
        )}

        <div style={{ marginBottom: 16, fontSize: 14 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>{t('home:enterpriseFluxNodeStart.node')}:</strong>{' '}
            {nodeName}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>{t('home:enterpriseFluxNodeStart.chain')}:</strong>{' '}
            {chainLabel}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>{t('home:enterpriseFluxNodeStart.collateral')}:</strong>{' '}
            {amountFlux} FLUX
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>{t('home:enterpriseFluxNodeStart.signing_with')}:</strong>{' '}
            {deviceLabel}
          </div>
          {delegates.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong>{t('home:enterpriseFluxNodeStart.delegates')}:</strong>{' '}
              {delegates.length}
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              color: '#d32f2f',
              fontSize: 13,
              marginBottom: 12,
              padding: '8px 12px',
              background: '#fce4ec',
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}

        {waitingForKey && (
          <div
            style={{
              color: '#1976d2',
              fontSize: 13,
              marginBottom: 12,
              padding: '8px 12px',
              background: '#e3f2fd',
              borderRadius: 4,
              textAlign: 'center',
            }}
          >
            {t('home:enterpriseFluxNodeStart.waiting_for_key')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={handleReject}
            disabled={processing}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: 'white',
              cursor: processing ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            {t('common:reject')}
          </button>
          <button
            onClick={() => {
              void handleSign();
            }}
            disabled={processing}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: 'none',
              background: processing ? '#ccc' : '#fbbf24',
              color: processing ? '#666' : '#000',
              cursor: processing ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {processing
              ? waitingForKey
                ? t('home:enterpriseFluxNodeStart.waiting')
                : t('home:enterpriseFluxNodeStart.signing')
              : t('common:approve')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EnterpriseFluxNodeStart;
