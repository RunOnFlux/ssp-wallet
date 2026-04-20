import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Button, Space, Modal, Spin, Alert } from 'antd';
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
import './EnterpriseFluxNodeStart.css';

const { Text } = Typography;

interface EnterpriseFluxNodeStartResponse {
  status: string;
  result?: { signedTxHex: string };
  data?: string;
  errorCode?: string;
}

interface EnterpriseFluxNodeStartProps {
  open: boolean;
  openAction: (data: EnterpriseFluxNodeStartResponse | null) => void;
  requesterInfo: WkSignRequesterInfo | null;
  chain: string;
  orgIndex: number;
  vaultIndex: number;
  addressIndex: number;
  nodeName: string;
  collateralAmount: string;
  collateralAddress?: string;
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
  collateralAddress,
  identityPubKey,
  collateralTxid,
  collateralVout,
  redeemScript,
  signingDevice,
  delegates,
}: EnterpriseFluxNodeStartProps) {
  const { t } = useTranslation(['home', 'common']);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingForKey, setWaitingForKey] = useState(false);

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity: wkIdentity } = useAppSelector(
    (state) => state.sspState,
  );

  const { enterpriseFluxNodeStarted, clearEnterpriseFluxNodeStarted } =
    useSocket();
  const { createWkIdentityAuth } = useRelayAuth();
  const requestIdRef = useRef('');

  const chainConfig = chain ? blockchains[chain as keyof cryptos] : null;

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
        const rejectionMessage =
          enterpriseFluxNodeStarted.error ||
          t('home:enterpriseFluxNodeStart.key_rejected');
        openAction({
          status: 'ERROR',
          data: rejectionMessage,
          errorCode: 'KEY_REJECTED',
        });
      }
      clearEnterpriseFluxNodeStarted?.();
    }
  }, [
    enterpriseFluxNodeStarted,
    waitingForKey,
    openAction,
    clearEnterpriseFluxNodeStarted,
    t,
  ]);

  const resetState = useCallback(() => {
    setProcessing(false);
    setError(null);
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

    let vaultXpriv = getMasterXpriv(
      walletSeed,
      48,
      chainConfig.slip,
      orgIndex,
      chainConfig.scriptType,
      chain as keyof cryptos,
    );

    walletSeed = '';

    const keypair = generateAddressKeypair(
      vaultXpriv,
      vaultIndex,
      addressIndex,
      chain as keyof cryptos,
    );
    vaultXpriv = '';

    return keypair;
  };

  const handleCancel = () => {
    if (processing && !waitingForKey) return;
    openAction(null);
    resetState();
  };

  const handleApprove = async () => {
    setProcessing(true);
    setError(null);

    let collateralPrivKey = '';

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();

      let delegateData;
      if (delegates.length > 0) {
        delegateData = { version: 1, type: 1, delegatePublicKeys: delegates };
      }

      if (signingDevice === 'wallet') {
        const keypair = await deriveCollateralKeypair();
        collateralPrivKey = keypair.privKey;

        const signedTxHex = fluxnode.startFluxNodev6WithPubKey(
          collateralTxid,
          collateralVout,
          collateralPrivKey,
          identityPubKey,
          timestamp,
          true,
          redeemScript,
          delegateData,
        );

        collateralPrivKey = '';

        openAction({
          status: 'SUCCESS',
          result: { signedTxHex },
        });
      } else {
        const reqId = generateRequestId();
        requestIdRef.current = reqId;

        const payload = JSON.stringify({
          chain,
          orgIndex,
          vaultIndex,
          addressIndex,
          nodeName,
          collateralAmount,
          collateralAddress,
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

  const amountFlux = collateralAmount
    ? (parseInt(collateralAmount, 10) / 1e8).toFixed(2)
    : '?';
  const chainLabel = chainConfig
    ? `${chainConfig.name} (${chainConfig.symbol})`
    : chain;
  const deviceLabel =
    signingDevice === 'wallet'
      ? t('home:enterpriseFluxNodeStart.device_wallet')
      : t('home:enterpriseFluxNodeStart.device_key');
  const utxoFull = collateralTxid ? `${collateralTxid}:${collateralVout}` : '';
  const utxoDisplay = collateralTxid
    ? `${collateralTxid.slice(0, 10)}…${collateralTxid.slice(-8)}:${collateralVout}`
    : '';

  return (
    <Modal
      title={t('home:enterpriseFluxNodeStart.title')}
      open={open}
      style={{ textAlign: 'center', top: 60 }}
      onCancel={handleCancel}
      footer={[]}
      maskClosable={false}
    >
      <Space
        direction="vertical"
        size="middle"
        style={{ marginBottom: 16, marginTop: 16, width: '100%' }}
      >
        <Text>{t('home:enterpriseFluxNodeStart.description')}</Text>

        {/* Requester Info */}
        {requesterInfo && (
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            {requesterInfo.iconUrl && (
              <img
                src={requesterInfo.iconUrl}
                alt=""
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  objectFit: 'contain',
                  marginBottom: 8,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            {requesterInfo.siteName && (
              <Text strong style={{ fontSize: '15px', display: 'block' }}>
                {requesterInfo.siteName}
              </Text>
            )}
            <Text
              type="secondary"
              style={{ fontSize: '12px', fontFamily: 'monospace' }}
            >
              {requesterInfo.origin}
            </Text>
          </div>
        )}

        {/* Node Info */}
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div className="flux-node-start-info-box">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div>
                <Text type="secondary">
                  {t('home:enterpriseFluxNodeStart.node')}:{' '}
                </Text>
                <Text strong>{nodeName || '-'}</Text>
              </div>
              <div>
                <Text type="secondary">
                  {t('home:enterpriseFluxNodeStart.chain')}:{' '}
                </Text>
                <Text strong>{chainLabel}</Text>
              </div>
              <div>
                <Text type="secondary">
                  {t('home:enterpriseFluxNodeStart.collateral')}:{' '}
                </Text>
                <Text strong>{amountFlux} FLUX</Text>
              </div>
              {collateralAddress && (
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseFluxNodeStart.collateral_address')}:{' '}
                  </Text>
                  <Text
                    strong
                    copyable={{ text: collateralAddress }}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      wordBreak: 'break-all',
                    }}
                  >
                    {collateralAddress}
                  </Text>
                </div>
              )}
              {utxoDisplay && (
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseFluxNodeStart.collateral_utxo')}:{' '}
                  </Text>
                  <Text
                    strong
                    copyable={{ text: utxoFull }}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  >
                    {utxoDisplay}
                  </Text>
                </div>
              )}
              <div>
                <Text type="secondary">
                  {t('home:enterpriseFluxNodeStart.signing_with')}:{' '}
                </Text>
                <Text strong>{deviceLabel}</Text>
              </div>
              {delegates.length > 0 && (
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseFluxNodeStart.delegates')}:{' '}
                  </Text>
                  <Text strong>{delegates.length}</Text>
                </div>
              )}
            </Space>
          </div>
        </Space>

        {/* SSP Identity */}
        <Space direction="vertical" size="small">
          <Text type="secondary">
            {t('home:enterpriseFluxNodeStart.ssp_identity')}:
          </Text>
          <Text
            strong
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              wordBreak: 'break-all',
            }}
          >
            {wkIdentity}
          </Text>
        </Space>

        {/* Error display */}
        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            style={{ textAlign: 'left' }}
          />
        )}

        {/* Waiting for Key indicator */}
        {waitingForKey && (
          <Alert
            type="info"
            message={t('home:enterpriseFluxNodeStart.waiting_for_key')}
            icon={<Spin size="small" />}
            showIcon
            style={{ textAlign: 'left' }}
          />
        )}

        {/* Action buttons */}
        <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
          <Button
            type="primary"
            size="large"
            onClick={() => {
              void handleApprove();
            }}
            loading={processing && !waitingForKey}
            disabled={processing || waitingForKey}
          >
            {waitingForKey
              ? t('home:enterpriseFluxNodeStart.awaiting_key')
              : t('home:enterpriseFluxNodeStart.approve')}
          </Button>
          <Button
            type="link"
            block
            size="small"
            onClick={handleCancel}
            disabled={processing && !waitingForKey}
          >
            {t('common:cancel')}
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}

export default EnterpriseFluxNodeStart;
