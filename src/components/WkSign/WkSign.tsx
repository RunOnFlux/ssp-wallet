import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Typography,
  Button,
  Space,
  Modal,
  Spin,
  Alert,
  QRCode,
  Collapse,
} from 'antd';
import { useAppSelector } from '../../hooks';
import './WkSign.css';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { useSocket } from '../../hooks/useSocket';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import { generateAddressKeypair, getScriptType } from '../../lib/wallet';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  validateWkSignMessage,
  signWkMessage,
  generateRequestId,
  WkSignResponse,
  WkSignRequesterInfo,
} from '../../lib/wkSign';

const { Paragraph, Text } = Typography;

interface WkSignData {
  status: string;
  result?: WkSignResponse;
  data?: string;
}

interface Props {
  open: boolean;
  message: string; // plain text message (format: timestamp:challenge)
  authMode: 1 | 2; // 1 = wallet only, 2 = wallet + key
  requesterInfo?: WkSignRequesterInfo | null;
  openAction?: (data: WkSignData | null) => void;
}

function WkSign({ open, message, authMode, requesterInfo, openAction }: Props) {
  const { t } = useTranslation(['home', 'common']);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const {
    identityChain,
    sspWalletKeyInternalIdentity: wkIdentity,
    sspWalletKeyInternalIdentityWitnessScript: witnessScript,
  } = useAppSelector((state) => state.sspState);
  const { createWkIdentityAuth } = useRelayAuth();
  const { wkSigned, clearWkSigned, wkSigningRejected, clearWkSigningRejected } =
    useSocket();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletSignature, setWalletSignature] = useState<string | null>(null);
  const [walletPubKey, setWalletPubKey] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [waitingForKey, setWaitingForKey] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const qrSize = windowWidth < 420 ? 290 : 340;

  // Build manual input payload when we have wallet signature
  const manualInputPayload = useMemo(() => {
    if (!walletSignature || !walletPubKey || !requestId) return null;
    return JSON.stringify({
      message,
      walletSignature,
      walletPubKey,
      witnessScript,
      wkIdentity,
      requestId,
      requesterInfo: requesterInfo || undefined,
    });
  }, [
    walletSignature,
    walletPubKey,
    requestId,
    message,
    witnessScript,
    wkIdentity,
    requesterInfo,
  ]);

  // QR payload with wksigningrequest prefix for SSP Key to recognize
  const qrPayload = manualInputPayload
    ? `wksigningrequest${manualInputPayload}`
    : null;

  // Check if payload is small enough for QR code (< 1250 chars like transactions)
  const canShowQR = qrPayload && qrPayload.length < 1250;

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  // Handle wkSigned response from Key
  useEffect(() => {
    if (wkSigned && waitingForKey && requestId) {
      if (wkSigned.requestId === requestId) {
        console.log('[WkSign] Received wkSigned from Key:', wkSigned);
        setWaitingForKey(false);
        setLoading(false);

        // Build complete response
        const response: WkSignResponse = {
          walletSignature: walletSignature!,
          walletPubKey: walletPubKey!,
          keySignature: wkSigned.keySignature,
          keyPubKey: wkSigned.keyPubKey,
          witnessScript: witnessScript,
          wkIdentity: wkIdentity,
          message: message,
          requesterInfo: requesterInfo || undefined,
        };

        if (openAction) {
          openAction({
            status: 'SUCCESS',
            result: response,
          });
        }

        // Cleanup
        clearWkSigned?.();
        resetState();
      }
    }
  }, [wkSigned, waitingForKey, requestId]);

  // Handle wkSigningRejected from Key
  useEffect(() => {
    if (wkSigningRejected && waitingForKey) {
      console.log('[WkSign] Signing rejected by Key');
      setWaitingForKey(false);
      setLoading(false);
      setError(t('home:wkSign.key_rejected'));
      clearWkSigningRejected?.();
    }
  }, [wkSigningRejected, waitingForKey]);

  const resetState = () => {
    setLoading(false);
    setError(null);
    setWalletSignature(null);
    setWalletPubKey(null);
    setRequestId(null);
    setWaitingForKey(false);
  };

  /**
   * Get the decrypted identity keypair for signing.
   */
  const getIdentityKeypair = useCallback(async () => {
    if (!passwordBlob) {
      throw new Error('Not logged in');
    }

    const identityChainConfig = blockchains[identityChain];
    const xprivKey = `xpriv-48-${identityChainConfig.slip}-0-${getScriptType(
      identityChainConfig.scriptType,
    )}-${identityChainConfig.id}`;

    const xprivEncrypted = secureLocalStorage.getItem(xprivKey);
    if (!xprivEncrypted || typeof xprivEncrypted !== 'string') {
      throw new Error('Could not retrieve encrypted keys');
    }

    const fingerprint = getFingerprint();
    const password = await passworderDecrypt(fingerprint, passwordBlob);
    if (typeof password !== 'string') {
      throw new Error('Failed to decrypt password');
    }

    const xpriv = await passworderDecrypt(password, xprivEncrypted);
    if (typeof xpriv !== 'string') {
      throw new Error('Failed to decrypt keys');
    }

    // Generate identity keypair (typeIndex=10 for internal identity)
    return generateAddressKeypair(xpriv, 10, 0, identityChain);
  }, [passwordBlob, identityChain]);

  /**
   * Post wksigningrequest to relay for Key to sign.
   */
  const postWkSigningRequest = async (
    walletSig: string,
    walletPk: string,
    reqId: string,
  ) => {
    const payload = {
      message,
      walletSignature: walletSig,
      walletPubKey: walletPk,
      witnessScript,
      wkIdentity,
      requestId: reqId,
      requesterInfo: requesterInfo || undefined,
    };

    const data: Record<string, unknown> = {
      action: 'wksigningrequest',
      payload: JSON.stringify(payload),
      chain: identityChain,
      path: '10-0', // identity path
      wkIdentity,
    };

    // Add authentication
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) {
        Object.assign(data, auth);
      }
    } catch {
      console.warn('[WkSign] Auth not available, sending without signature');
    }

    console.log('[WkSign] Posting wksigningrequest to relay');
    await axios.post(`https://${sspConfig().relay}/v1/action`, data);
  };

  /**
   * Handle sign button click.
   */
  const handleSign = async () => {
    setLoading(true);
    setError(null);

    try {
      // Validate message format
      const validation = validateWkSignMessage(message);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Get identity keypair
      const keypair = await getIdentityKeypair();

      // Sign the message with identity chain message signing
      const signature = signWkMessage(message, keypair.privKey, identityChain);

      setWalletSignature(signature);
      setWalletPubKey(keypair.pubKey);

      if (authMode === 1) {
        // Wallet-only mode: return immediately
        const response: WkSignResponse = {
          walletSignature: signature,
          walletPubKey: keypair.pubKey,
          witnessScript: witnessScript,
          wkIdentity: wkIdentity,
          message: message,
          requesterInfo: requesterInfo || undefined,
        };

        setLoading(false);
        if (openAction) {
          openAction({
            status: 'SUCCESS',
            result: response,
          });
        }
        resetState();
      } else {
        // 2-of-2 mode: send to Key for co-signing
        const reqId = generateRequestId();
        setRequestId(reqId);
        setWaitingForKey(true);

        await postWkSigningRequest(signature, keypair.pubKey, reqId);
        // Now wait for wkSigned event from socket
      }
    } catch (err) {
      console.error('[WkSign] Error:', err);
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

  return (
    <Modal
      title={t('home:wkSign.title')}
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
        <Text>
          {requesterInfo?.origin === 'SSP Wallet'
            ? t('home:wkSign.description_internal')
            : t('home:wkSign.description')}
        </Text>

        {/* Requester Info - Simple centered layout */}
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
            {requesterInfo.description && (
              <Text
                type="secondary"
                style={{ fontSize: '12px', display: 'block', marginTop: 4 }}
              >
                {requesterInfo.description}
              </Text>
            )}
          </div>
        )}

        {/* SSP Identity */}
        <Space direction="vertical" size="small">
          <Text type="secondary">{t('home:wkSign.ssp_identity')}:</Text>
          <Paragraph
            copyable={{ text: wkIdentity }}
            className="copyableAddress"
            style={{ marginBottom: 0 }}
          >
            <Text strong style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              {wkIdentity.substring(0, 12)}...
              {wkIdentity.substring(wkIdentity.length - 12)}
            </Text>
          </Paragraph>
        </Space>

        {/* Auth Mode */}
        <Space direction="vertical" size="small">
          <Text type="secondary">{t('home:wkSign.auth_mode')}:</Text>
          <Text strong>
            {authMode === 1
              ? t('home:wkSign.wallet_only')
              : t('home:wkSign.wallet_and_key')}
          </Text>
        </Space>

        {/* Message to Sign */}
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Text type="secondary">{t('home:wkSign.message_to_sign')}:</Text>
          <div className="wk-sign-message-box">
            <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              {message}
            </Text>
          </div>
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
          <>
            <Alert
              type="info"
              message={t('home:wkSign.waiting_for_key')}
              icon={<Spin size="small" />}
              showIcon
              style={{ textAlign: 'left' }}
            />
            {/* Manual input option for SSP Key */}
            {qrPayload && (
              <Collapse
                size="small"
                items={[
                  {
                    key: '1',
                    label: t('home:wkSign.manual_input'),
                    children: (
                      <Space
                        direction="vertical"
                        size="large"
                        style={{ width: '100%' }}
                      >
                        {canShowQR && (
                          <>
                            <QRCode
                              errorLevel="L"
                              value={qrPayload}
                              icon="/ssp-logo-black.svg"
                              size={qrSize}
                              style={{ margin: '0 auto' }}
                            />
                            <Paragraph
                              copyable={{ text: qrPayload }}
                              className="copyableAddress"
                            >
                              <Text>{qrPayload}</Text>
                            </Paragraph>
                          </>
                        )}
                        {!canShowQR && (
                          <>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              {t('home:wkSign.manual_input_desc')}
                            </Text>
                            <Paragraph
                              copyable={{ text: qrPayload }}
                              className="copyableAddress"
                            >
                              <Text>{qrPayload}</Text>
                            </Paragraph>
                          </>
                        )}
                      </Space>
                    ),
                  },
                ]}
              />
            )}
          </>
        )}

        {/* Action buttons */}
        <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
          <Button
            type="primary"
            size="large"
            onClick={handleSign}
            loading={loading}
            disabled={loading || waitingForKey}
          >
            {waitingForKey
              ? t('home:wkSign.awaiting_key')
              : t('home:wkSign.sign')}
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

export default WkSign;
