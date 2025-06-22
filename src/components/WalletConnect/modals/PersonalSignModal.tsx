import React, { useState, useEffect } from 'react';
import { Modal, Typography, Divider, Card, Alert, QRCode, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import { SessionRequest } from '../types/modalTypes';
import { useWalletConnect } from '../../../contexts/WalletConnectContext';

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
  const { chainSwitchInfo } = useWalletConnect();
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

  // First step: Approval dialog
  if (step === 'approval') {
    return (
      <Modal
        title={
          <div style={{ textAlign: 'center', width: '100%' }}>
            {t('home:walletconnect.sign_message_request')}
          </div>
        }
        open={true}
        onOk={handleApprove}
        onCancel={handleReject}
        okText={t('home:walletconnect.approve')}
        cancelText={t('home:walletconnect.reject')}
        confirmLoading={isApproving}
        width={600}
      >
        <Paragraph>{t('home:walletconnect.dapp_requests_signature')}</Paragraph>

        {/* Address Section */}
        <Card
          size="small"
          title={t('home:walletconnect.address')}
          style={{ marginBottom: 16 }}
        >
          <div style={{ textAlign: 'center' }}>
            <Text
              code
              copyable
              style={{ fontSize: '16px', fontWeight: 'bold' }}
            >
              {address}
            </Text>
          </div>
        </Card>

        {/* Message Section */}
        <Card
          size="small"
          title={t('home:walletconnect.message')}
          style={{ marginBottom: 16 }}
        >
          {/* Show decoded message if available */}
          {isHexEncoded && decodedMessage ? (
            <>
              <Alert
                description={
                  <div style={{ textAlign: 'center' }}>
                    <Text
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontWeight: 'bold',
                      }}
                    >
                      {decodedMessage}
                    </Text>
                  </div>
                }
                type="success"
                style={{ marginBottom: 12 }}
              />
              <Divider />
            </>
          ) : null}

          {/* Original message */}
          <Text type="secondary">
            {isHexEncoded
              ? t('home:walletconnect.technical_hex_encoded')
              : t('home:walletconnect.raw_message')}
          </Text>
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <Text
              code
              copyable
              style={{ fontSize: '12px', wordBreak: 'break-all' }}
            >
              {messageToSign}
            </Text>
          </div>
        </Card>

        {/* Chain Switch Warning */}
        {chainSwitchInfo?.required && chainSwitchInfo.targetChain && (
          <Alert
            message="Chain Switch Required"
            description={
              <div>
                <Text>
                  {`This signing request will switch to ${chainSwitchInfo.targetChain.chainName} chain.`}
                </Text>
                <br />
                <Text type="secondary">
                  The address exists on a different chain than currently active.
                </Text>
              </div>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Method Info */}
        <Alert
          message={`Method: ${method}`}
          description={
            method === 'personal_sign'
              ? t('home:walletconnect.eip191_prefix_added')
              : t('home:walletconnect.signs_raw_message')
          }
          type="info"
          showIcon
          style={{ marginBottom: 16, fontSize: '12px' }}
        />

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">
            {t('home:walletconnect.step_1_approve_wallet_info')}
          </Text>
        </div>
      </Modal>
    );
  }

  // Second step: QR code dialog
  return (
    <Modal
      title={
        <div style={{ textAlign: 'center', width: '100%' }}>
          {t('home:walletconnect.scan_with_ssp_key')}
        </div>
      }
      open={true}
      onCancel={handleReject}
      footer={null}
      width={600}
    >
      <div style={{ textAlign: 'center' }}>
        <Paragraph>{t('home:confirmTxKey.info_1')}</Paragraph>

        <Space
          direction="vertical"
          size="large"
          style={{ width: '100%', marginBottom: 20 }}
        >
          {qrString && (
            <QRCode
              errorLevel="M"
              value={qrString}
              icon="/ssp-logo-black.svg"
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
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                marginBottom: 0,
                textAlign: 'left',
              }}
            >
              <Text>{qrString}</Text>
            </Paragraph>
          )}

          {!qrString && (
            <Text type="secondary">Waiting for signing request data...</Text>
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
