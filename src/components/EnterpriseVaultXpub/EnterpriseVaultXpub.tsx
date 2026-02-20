import { useEffect, useState, useCallback } from 'react';
import { Typography, Button, Space, Modal, Spin, Alert } from 'antd';
import { useAppSelector } from '../../hooks';
import './EnterpriseVaultXpub.css';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { useSocket } from '../../hooks/useSocket';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import {
  getMasterXpub,
  getScriptType,
  generateAddressKeypair,
} from '../../lib/wallet';
import { signMessage } from '../../lib/relayAuth';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import axios from 'axios';

import { useTranslation } from 'react-i18next';
import { generateRequestId } from '../../lib/wkSign';
import type { WkSignRequesterInfo } from '../../lib/wkSign';
import type { cryptos } from '../../types';

const { Text } = Typography;

interface EnterpriseVaultXpubResponse {
  xpubWallet: string;
  xpubKey: string;
  walletXpubSignature: string;
  keyXpubSignature: string;
  chain: string;
  orgIndex: number;
  wkIdentity: string;
}

interface EnterpriseVaultXpubData {
  status: string;
  result?: EnterpriseVaultXpubResponse;
  data?: string;
}

interface Props {
  open: boolean;
  chain: string;
  orgIndex: number;
  vaultName: string;
  orgName: string;
  requesterInfo?: WkSignRequesterInfo | null;
  openAction?: (data: EnterpriseVaultXpubData | null) => void;
}

function EnterpriseVaultXpub({
  open,
  chain,
  orgIndex,
  vaultName,
  orgName,
  requesterInfo,
  openAction,
}: Props) {
  const { t } = useTranslation(['home', 'common']);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity: wkIdentity, identityChain } =
    useAppSelector((state) => state.sspState);
  const { createWkIdentityAuth } = useRelayAuth();
  const {
    enterpriseVaultXpubSigned,
    clearEnterpriseVaultXpubSigned,
    enterpriseVaultXpubRejected,
    clearEnterpriseVaultXpubRejected,
  } = useSocket();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xpubWallet, setXpubWallet] = useState<string | null>(null);
  const [walletXpubSignature, setWalletXpubSignature] = useState<string | null>(
    null,
  );
  const [requestId, setRequestId] = useState<string | null>(null);
  const [waitingForKey, setWaitingForKey] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  // Handle enterpriseVaultXpubSigned response from Key
  useEffect(() => {
    if (enterpriseVaultXpubSigned && waitingForKey && requestId) {
      if (enterpriseVaultXpubSigned.requestId === requestId) {
        console.log(
          '[EnterpriseVaultXpub] Received xpub from Key:',
          enterpriseVaultXpubSigned,
        );
        setWaitingForKey(false);
        setLoading(false);

        // Build complete response
        const response: EnterpriseVaultXpubResponse = {
          xpubWallet: xpubWallet!,
          xpubKey: enterpriseVaultXpubSigned.xpubKey,
          walletXpubSignature: walletXpubSignature!,
          keyXpubSignature: enterpriseVaultXpubSigned.keyXpubSignature || '',
          chain,
          orgIndex,
          wkIdentity,
        };

        if (openAction) {
          openAction({
            status: 'SUCCESS',
            result: response,
          });
        }

        // Cleanup
        clearEnterpriseVaultXpubSigned?.();
        resetState();
      }
    }
  }, [enterpriseVaultXpubSigned, waitingForKey, requestId]);

  // Handle enterpriseVaultXpubRejected from Key
  useEffect(() => {
    if (enterpriseVaultXpubRejected && waitingForKey) {
      console.log('[EnterpriseVaultXpub] Request rejected by Key');
      setWaitingForKey(false);
      setLoading(false);
      setError(t('home:enterpriseVaultXpub.key_rejected'));
      clearEnterpriseVaultXpubRejected?.();
    }
  }, [enterpriseVaultXpubRejected, waitingForKey]);

  const resetState = () => {
    setLoading(false);
    setError(null);
    setXpubWallet(null);
    setWalletXpubSignature(null);
    setRequestId(null);
    setWaitingForKey(false);
  };

  /**
   * Derive the wallet xpub for the vault path and sign it.
   * Path: m/48'/coin'/orgIndex'/scriptType'
   */
  const deriveVaultXpub = useCallback(async (): Promise<{
    xpub: string;
    signature: string;
  }> => {
    if (!passwordBlob) {
      throw new Error('Not logged in');
    }

    const chainConfig = blockchains[chain];
    if (!chainConfig) {
      throw new Error('Invalid chain');
    }

    // Get the wallet seed from secure storage
    const walSeedBlob = secureLocalStorage.getItem('walletSeed');
    if (!walSeedBlob || typeof walSeedBlob !== 'string') {
      throw new Error('Could not retrieve wallet seed');
    }

    const fingerprint = getFingerprint();
    const password = await passworderDecrypt(fingerprint, passwordBlob);
    if (typeof password !== 'string') {
      throw new Error('Failed to decrypt password');
    }

    let walletSeed = await passworderDecrypt(password, walSeedBlob);
    if (typeof walletSeed !== 'string') {
      throw new Error('Failed to decrypt wallet seed');
    }

    // Derive xpub at m/48'/coin'/orgIndex'/scriptType'
    const xpub = getMasterXpub(
      walletSeed,
      48,
      chainConfig.slip,
      orgIndex,
      chainConfig.scriptType,
      chain as keyof cryptos,
    );

    // Clear sensitive data
    walletSeed = '';

    // Sign the walletXpub with identity key
    const identityChainConfig = blockchains[identityChain];
    const xprivStorageKey = `xpriv-48-${identityChainConfig.slip}-0-${getScriptType(
      identityChainConfig.scriptType,
    )}-${identityChainConfig.id}`;
    const xprivEncrypted = secureLocalStorage.getItem(xprivStorageKey);
    if (!xprivEncrypted || typeof xprivEncrypted !== 'string') {
      throw new Error('Could not retrieve identity key');
    }

    const xpriv = await passworderDecrypt(password, xprivEncrypted);
    if (typeof xpriv !== 'string') {
      throw new Error('Failed to decrypt identity key');
    }

    const identityKeypair = generateAddressKeypair(xpriv, 10, 0, identityChain);
    const xpubMessage = `SSP_VAULT_XPUB:wallet:${xpub}:${chain}:${String(orgIndex)}`;
    const signature = signMessage(
      xpubMessage,
      identityKeypair.privKey,
      identityChain,
    );

    return { xpub, signature };
  }, [passwordBlob, chain, orgIndex, identityChain]);

  /**
   * Post enterprise vault xpub request to relay for Key to derive its xpub.
   */
  const postVaultXpubRequest = async (walletXpub: string, reqId: string) => {
    const chainConfig = blockchains[chain];
    const payload = {
      chain,
      orgIndex,
      vaultName,
      orgName,
      xpubWallet: walletXpub,
      requestId: reqId,
      wkIdentity,
      scriptType: getScriptType(chainConfig.scriptType),
    };

    const data: Record<string, unknown> = {
      action: 'enterprisevaultxpub',
      payload: JSON.stringify(payload),
      chain,
      path: '10-0', // identity path for auth
      wkIdentity,
    };

    // Add authentication
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) {
        Object.assign(data, auth);
      }
    } catch {
      console.warn(
        '[EnterpriseVaultXpub] Auth not available, sending without signature',
      );
    }

    console.log('[EnterpriseVaultXpub] Posting vault xpub request to relay');
    await axios.post(`https://${sspConfig().relay}/v1/action`, data);
  };

  /**
   * Handle approve button click.
   */
  const handleApprove = async () => {
    setLoading(true);
    setError(null);

    try {
      // Derive wallet xpub for the vault path and sign it
      const { xpub: walletXpub, signature: walletSig } =
        await deriveVaultXpub();
      setXpubWallet(walletXpub);
      setWalletXpubSignature(walletSig);

      // Send to Key for co-derivation
      const reqId = generateRequestId();
      setRequestId(reqId);
      setWaitingForKey(true);

      await postVaultXpubRequest(walletXpub, reqId);
      // Now wait for enterpriseVaultXpubSigned event from socket
    } catch (err) {
      console.error('[EnterpriseVaultXpub] Error:', err);
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  /**
   * Handle cancel/reject.
   */
  const handleCancel = () => {
    if (openAction) {
      openAction(null);
    }
    resetState();
  };

  const chainConfig = chain ? blockchains[chain] : null;

  return (
    <Modal
      title={t('home:enterpriseVaultXpub.title')}
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
        <Text>{t('home:enterpriseVaultXpub.description')}</Text>

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

        {/* Vault Info */}
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div className="vault-xpub-info-box">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div>
                <Text type="secondary">
                  {t('home:enterpriseVaultXpub.vault_name')}:{' '}
                </Text>
                <Text strong>{vaultName}</Text>
              </div>
              <div>
                <Text type="secondary">
                  {t('home:enterpriseVaultXpub.org_name')}:{' '}
                </Text>
                <Text strong>{orgName}</Text>
              </div>
              <div>
                <Text type="secondary">
                  {t('home:enterpriseVaultXpub.chain')}:{' '}
                </Text>
                <Text strong>
                  {chainConfig
                    ? `${chainConfig.name} (${chainConfig.symbol})`
                    : chain}
                </Text>
              </div>
            </Space>
          </div>
        </Space>

        {/* SSP Identity */}
        <Space direction="vertical" size="small">
          <Text type="secondary">
            {t('home:enterpriseVaultXpub.ssp_identity')}:
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
            message={t('home:enterpriseVaultXpub.waiting_for_key')}
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
            onClick={handleApprove}
            loading={loading}
            disabled={loading || waitingForKey}
          >
            {waitingForKey
              ? t('home:enterpriseVaultXpub.awaiting_key')
              : t('home:enterpriseVaultXpub.approve')}
          </Button>
          <Button
            type="link"
            block
            size="small"
            onClick={handleCancel}
            disabled={loading && !waitingForKey}
          >
            {t('common:cancel')}
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}

export default EnterpriseVaultXpub;
