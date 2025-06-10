import React from 'react';
import { Modal, Typography, Divider, Card, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import { SessionRequest } from '../types/modalTypes';

const { Text, Paragraph } = Typography;

interface PersonalSignModalProps {
  request: SessionRequest | null;
  onApprove: (request: SessionRequest) => Promise<void>;
  onReject: (request: SessionRequest) => Promise<void>;
}

const PersonalSignModal: React.FC<PersonalSignModalProps> = ({
  request,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation(['home', 'common']);

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

  const handleApprove = async () => {
    try {
      await onApprove(request);
    } catch (error) {
      console.error('Error approving sign request:', error);
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting sign request:', error);
    }
  };

  return (
    <Modal
      title={t('home:walletconnect.sign_message_request')}
      open={true}
      onOk={handleApprove}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
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
          <Text code copyable style={{ fontSize: '16px', fontWeight: 'bold' }}>
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

      {/* Method Info */}
      <Alert
        message={`Method: ${method}`}
        description={
          method === 'personal_sign'
            ? t('home:walletconnect.adds_eip191_prefix')
            : t('home:walletconnect.signs_raw_message')
        }
        type="info"
        showIcon
        style={{ marginBottom: 16, fontSize: '12px' }}
      />

      <Text type="secondary" italic>
        {t('home:walletconnect.ssp_key_confirmation_needed')}
      </Text>
    </Modal>
  );
};

export default PersonalSignModal;
