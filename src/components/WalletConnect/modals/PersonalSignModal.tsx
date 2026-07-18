import React, { useState, useEffect } from 'react';
import { useSspLogo } from '../../../hooks/useSspLogo';
import { Modal, Typography, Alert, Collapse, QRCode, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import { SessionRequest } from '../types/modalTypes';
import { useWalletConnect } from '../../../contexts/WalletConnectContext';
import { useAppSelector } from '../../../hooks';
import { blockchains } from '@storage/blockchains';
import DappOrigin from '../../DappRequest/DappOrigin';
import '../../DappRequest/DappRequest.css';

const { Text, Paragraph } = Typography;

interface PersonalSignModalProps {
  request: SessionRequest | null;
  onApprove: (request: SessionRequest) => Promise<void>;
  onReject: (request: SessionRequest) => Promise<void>;
  externalSigningRequest?: Record<string, unknown> | null;
}

const PersonalSignModal: React.FC<PersonalSignModalProps> = ({
  request,
  onApprove,
  onReject,
  externalSigningRequest,
}) => {
  const { t } = useTranslation(['home', 'common']);
  const sspLogo = useSspLogo();
  const { chainSwitchInfo, activeSessions } = useWalletConnect();
  const { activeChain } = useAppSelector((state) => state.sspState);
  const [step, setStep] = useState<'approval' | 'qr'>('approval');
  const [isApproving, setIsApproving] = useState(false);

  // Reset to step 1 whenever a new request comes in
  useEffect(() => {
    if (request) {
      setStep('approval');
      setIsApproving(false);
    }
  }, [request?.id]); // Reset when request ID changes

  if (!request) return null;

  const method = request.params.request.method;
  const isSigningMethod = ['personal_sign', 'eth_sign'].includes(method);

  if (!isSigningMethod) return null;

  // Handle different parameter orders
  const requestParams = request.params.request.params as [string, string];
  let messageToSign: string;
  let address: string;

  if (method === 'personal_sign') {
    // personal_sign: [message, address]
    [messageToSign, address] = requestParams;
  } else {
    // eth_sign: [address, message]
    [address, messageToSign] = requestParams;
  }

  // Decode hex-encoded messages for display
  let decodedMessage: string | null = null;
  let isHexEncoded = false;

  if (messageToSign.startsWith('0x')) {
    try {
      decodedMessage = ethers.toUtf8String(messageToSign);
      isHexEncoded = true;
    } catch {
      // Failed to decode, might not be valid UTF-8
      decodedMessage = null;
    }
  }

  // Step 2 QR string - should contain the actual signingRequest object
  const qrString = externalSigningRequest
    ? `evmsigningrequest${JSON.stringify(externalSigningRequest)}`
    : '';

  const handleApprove = () => {
    if (step === 'approval') {
      setIsApproving(true);
      try {
        // The parent/context will provide externalSigningRequest after this call
        onApprove(request);
        setStep('qr');
      } catch (error) {
        console.error('Error initiating sign request:', error);
      } finally {
        setIsApproving(false);
      }
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting sign request:', error);
    }
  };

  // Session peer metadata for the origin header (who is asking)
  const peerMetadata = activeSessions[request.topic]?.peer?.metadata;

  // First step: Approval dialog
  if (step === 'approval') {
    return (
      <Modal
        title={t('home:walletconnect.sign_message_request')}
        open={true}
        onOk={handleApprove}
        onCancel={handleReject}
        okText={t('home:walletconnect.approve')}
        cancelText={t('home:walletconnect.reject')}
        cancelButtonProps={{ type: 'text' }}
        confirmLoading={isApproving}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            textAlign: 'left',
            marginTop: 16,
          }}
        >
          <DappOrigin
            name={peerMetadata?.name}
            url={peerMetadata?.url}
            icon={peerMetadata?.icons?.[0]}
          />

          <p className="dapp-ask">
            {t('home:walletconnect.dapp_requests_signature')}
          </p>

          <div className="dapp-summary">
            <div className="dapp-summary-row">
              <span className="dapp-summary-label">
                {t('home:walletconnect.address')}
              </span>
              <Text className="dapp-summary-value dapp-mono" copyable>
                {address}
              </Text>
            </div>
            <div className="dapp-summary-row">
              <span className="dapp-summary-label">{t('common:network')}</span>
              <span className="dapp-summary-value">
                {chainSwitchInfo?.required && chainSwitchInfo.targetChain
                  ? chainSwitchInfo.targetChain.chainName
                  : blockchains[activeChain].name}
              </span>
            </div>
          </div>

          {/* Message — readable form first, raw bytes behind an expander */}
          <div>
            <div
              className="dapp-summary-label"
              style={{ fontSize: 12, marginBottom: 4 }}
            >
              {t('home:walletconnect.message')}
            </div>
            {isHexEncoded && decodedMessage ? (
              <>
                <div
                  className="dapp-payload"
                  style={{ fontFamily: 'inherit', fontSize: 12 }}
                >
                  {decodedMessage}
                </div>
                <Collapse
                  ghost
                  size="small"
                  items={[
                    {
                      key: 'raw',
                      label: (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t('home:walletconnect.technical_hex_encoded')}
                        </Text>
                      ),
                      children: (
                        <Text
                          className="dapp-payload"
                          style={{ display: 'block' }}
                          copyable={{ text: messageToSign }}
                        >
                          {messageToSign}
                        </Text>
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              <Text
                className="dapp-payload"
                style={{ display: 'block' }}
                copyable={{ text: messageToSign }}
              >
                {messageToSign}
              </Text>
            )}
          </div>

          {/* Chain Switch Warning */}
          {chainSwitchInfo?.required && chainSwitchInfo.targetChain && (
            <Alert
              message={t('home:walletconnect.chain_switch_required')}
              description={
                <div>
                  <Text>
                    {t('home:walletconnect.signing_chain_switch_desc', {
                      chainName: chainSwitchInfo.targetChain.chainName,
                    })}
                  </Text>
                  <br />
                  <Text type="secondary">
                    {t('home:walletconnect.address_different_chain')}
                  </Text>
                </div>
              }
              type="warning"
              showIcon
            />
          )}

          {/* Method footnote */}
          <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5 }}>
            <span style={{ fontFamily: 'var(--ssp-mono)' }}>{method}</span>
            {' — '}
            {method === 'personal_sign'
              ? t('home:walletconnect.eip191_prefix_added')
              : t('home:walletconnect.signs_raw_message')}
            <br />
            {t('home:walletconnect.step_1_approve_wallet_info')}
          </Text>
        </div>
      </Modal>
    );
  }

  // Second step: QR code dialog
  return (
    <Modal
      title={t('home:walletconnect.scan_with_ssp_key')}
      open={true}
      onCancel={handleReject}
      footer={null}
      style={{ textAlign: 'center' }}
    >
      <div style={{ textAlign: 'center' }}>
        <Paragraph>{t('home:confirmTxKey.info_1')}</Paragraph>

        <Space
          direction="vertical"
          size="large"
          style={{ width: '100%', marginBottom: 20, textAlign: 'left' }}
        >
          {qrString && (
            <QRCode
              errorLevel="M"
              value={qrString}
              icon={sspLogo}
              size={280}
              style={{ margin: '0 auto' }}
            />
          )}

          {qrString && (
            <Paragraph
              copyable={{ text: qrString }}
              className="copyableAddress"
              style={{
                fontSize: 11,
                fontFamily: 'var(--ssp-mono)',
                wordBreak: 'break-all',
                marginBottom: 0,
                textAlign: 'left',
              }}
            >
              <Text>{qrString}</Text>
            </Paragraph>
          )}

          {!qrString && (
            <Text type="secondary">
              {t('home:walletconnect.waiting_signing_request_data')}
            </Text>
          )}
        </Space>

        <Text type="secondary" italic>
          {t('home:walletconnect.ssp_key_confirmation_needed')}
        </Text>
      </div>
    </Modal>
  );
};

export default PersonalSignModal;
