import { useState, useEffect, useRef } from 'react';
import { Typography, Button, Space, Modal, Spin, Alert } from 'antd';
import { useAppSelector } from '../../hooks';
import { useSocket } from '../../hooks/useSocket';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { replenishWalletEnterpriseNonces } from '../../lib/enterpriseNonces';
import { sspConfig } from '@storage/ssp';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import type { WkSignRequesterInfo } from '../../lib/wkSign';

const { Text } = Typography;

interface NonceSyncResponse {
  status: string;
  result?: string;
  data?: string;
}

interface Props {
  open: boolean;
  requesterInfo?: WkSignRequesterInfo | null;
  openAction?: (data: NonceSyncResponse | null) => void;
}

type SyncPhase = 'idle' | 'wallet' | 'key' | 'done';

function EnterpriseNonceSync({ open, requesterInfo, openAction }: Props) {
  const { t } = useTranslation(['home', 'common']);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity: wkIdentity, identityChain } =
    useAppSelector((state) => state.sspState);
  const { createWkIdentityAuth } = useRelayAuth();
  const {
    enterpriseKeyNonceSynced,
    enterpriseKeyNonceSyncRejected,
    clearEnterpriseKeyNonceSynced,
    clearEnterpriseKeyNonceSyncRejected,
  } = useSocket();

  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const waitingForKeyRef = useRef(false);

  const resetState = () => {
    setLoading(false);
    setPhase('idle');
    setError(null);
    setSuccess(false);
    waitingForKeyRef.current = false;
  };

  // Listen for Key nonce sync success via socket
  useEffect(() => {
    if (enterpriseKeyNonceSynced && waitingForKeyRef.current) {
      waitingForKeyRef.current = false;
      clearEnterpriseKeyNonceSynced?.();

      setPhase('done');
      setSuccess(true);
      setLoading(false);

      // Auto-respond after brief delay so user sees success
      setTimeout(() => {
        if (openAction) {
          openAction({
            status: 'SUCCESS',
            result: 'Wallet and Key nonces synced',
          });
        }
        resetState();
      }, 800);
    }
  }, [enterpriseKeyNonceSynced]);

  // Listen for Key nonce sync rejection via socket
  useEffect(() => {
    if (enterpriseKeyNonceSyncRejected && waitingForKeyRef.current) {
      waitingForKeyRef.current = false;
      clearEnterpriseKeyNonceSyncRejected?.();
      setLoading(false);
      setError(t('home:enterpriseNonceSync.key_sync_failed'));
    }
  }, [enterpriseKeyNonceSyncRejected]);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    setPhase('wallet');

    try {
      if (!wkIdentity || !passwordBlob) {
        throw new Error('Wallet not ready');
      }
      // Phase 1: Force-replace wallet nonces (purge old, generate fresh set)
      await replenishWalletEnterpriseNonces(wkIdentity, passwordBlob, true);

      // Phase 2: Trigger key nonce sync via relay action
      setPhase('key');
      waitingForKeyRef.current = true;

      const actionData: Record<string, unknown> = {
        action: 'enterprisekeynoncesync',
        payload: JSON.stringify({
          requestedAt: Date.now(),
          forceReplace: true,
        }),
        chain: identityChain || 'flux',
        path: '10-0',
        wkIdentity,
      };

      // Add authentication
      try {
        const auth = await createWkIdentityAuth(
          'action',
          wkIdentity,
          actionData,
        );
        if (auth) {
          Object.assign(actionData, auth);
        }
      } catch {
        console.warn(
          '[EnterpriseNonceSync] Auth not available for key sync action',
        );
      }

      await axios.post(`https://${sspConfig().relay}/v1/action`, actionData);

      // Now waiting for enterprisekeynoncesynced/rejected via socket
      // Timeout after 60 seconds
      setTimeout(() => {
        if (waitingForKeyRef.current) {
          waitingForKeyRef.current = false;
          setLoading(false);
          setError(t('home:enterpriseNonceSync.key_sync_timeout'));
        }
      }, 60000);
    } catch (err) {
      setLoading(false);
      setPhase('idle');
      waitingForKeyRef.current = false;
      const msg = err instanceof Error ? err.message : 'Nonce sync failed';
      setError(msg);
    }
  };

  const handleCancel = () => {
    if (openAction) {
      openAction(null);
    }
    resetState();
  };

  const getStatusText = (): string => {
    switch (phase) {
      case 'wallet':
        return t('home:enterpriseNonceSync.syncing_wallet');
      case 'key':
        return t('home:enterpriseNonceSync.syncing_key');
      default:
        return t('home:enterpriseNonceSync.syncing');
    }
  };

  return (
    <Modal
      title={t('home:enterpriseNonceSync.title')}
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
        <Text>{t('home:enterpriseNonceSync.description')}</Text>

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

        {/* Info */}
        <Alert
          type="info"
          message={t('home:enterpriseNonceSync.info')}
          showIcon
          style={{ textAlign: 'left' }}
        />

        {/* Success */}
        {success && (
          <Alert
            type="success"
            message={t('home:enterpriseNonceSync.success')}
            showIcon
            style={{ textAlign: 'left' }}
          />
        )}

        {/* Error */}
        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            style={{ textAlign: 'left' }}
          />
        )}

        {/* Loading */}
        {loading && <Spin tip={getStatusText()} />}

        {/* Action buttons */}
        <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
          <Button
            type="primary"
            size="large"
            onClick={handleApprove}
            loading={loading}
            disabled={loading || success}
          >
            {t('home:enterpriseNonceSync.approve')}
          </Button>
          <Button
            type="link"
            block
            size="small"
            onClick={handleCancel}
            disabled={loading}
          >
            {t('common:cancel')}
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}

export default EnterpriseNonceSync;
