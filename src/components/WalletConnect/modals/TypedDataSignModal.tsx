import React from 'react';
import { Modal, QRCode, Space, Typography, Card, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { SessionRequest } from '../types/modalTypes';

const { Text, Paragraph } = Typography;

interface TypedDataSignModalProps {
  request: SessionRequest | null;
  onApprove: (request: SessionRequest) => Promise<void>;
  onReject: (request: SessionRequest) => Promise<void>;
}

const TypedDataSignModal: React.FC<TypedDataSignModalProps> = ({
  request,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { walletInUse } = useAppSelector((state) => state[activeChain]);

  if (!request) return null;

  const method = request.params.request.method;
  const isTypedDataMethod = [
    'eth_signTypedData',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ].includes(method);

  if (!isTypedDataMethod) return null;

  const requestParams = request.params.request.params as [string, unknown];
  const [address, typedData] = requestParams;

  // Create request data following SSP ConfirmTxKey pattern: chain:wallet:data
  const walletConnectData = JSON.stringify({
    type: 'walletconnect',
    id: request.id,
    method,
    params: requestParams,
    dapp: {
      name: request.verifyContext?.verified?.origin || 'Unknown dApp',
      url: request.verifyContext?.verified?.validation || '',
    },
    timestamp: Date.now(),
  });

  // Follow exact ConfirmTxKey pattern: chain:wallet:data
  const qrString = `${activeChain}:${walletInUse}:${walletConnectData}`;

  const handleApprove = async () => {
    try {
      await onApprove(request);
    } catch (error) {
      console.error('Error approving typed data:', error);
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting typed data:', error);
    }
  };

  return (
    <Modal
      title={t('home:walletconnect.sign_typed_data_request')}
      open={true}
      onOk={handleApprove}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
      width={600}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Text>
          {t('home:walletconnect.dapp_requests_typed_data_signature')}
        </Text>

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

        {/* TypedData Section */}
        <Card
          size="small"
          title={t('home:walletconnect.data')}
          style={{ marginBottom: 16 }}
        >
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
                  Structured EIP-712 Data
                </Text>
              </div>
            }
            type="success"
            style={{ marginBottom: 12 }}
          />

          <Text type="secondary">Technical Data (EIP-712):</Text>
          <div
            style={{
              marginTop: 8,
              maxHeight: '200px',
              overflow: 'auto',
              background: '#f5f5f5',
              padding: '10px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            <Text copyable={{ text: JSON.stringify(typedData, null, 2) }}>
              {JSON.stringify(typedData, null, 2)}
            </Text>
          </div>
        </Card>

        {/* QR Code Section - Following SSP Pattern */}
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">{t('home:confirmTxKey.info_1')}</Text>

          <div style={{ margin: '16px 0' }}>
            <QRCode
              errorLevel="M"
              value={qrString}
              icon="/ssp-logo-black.svg"
              size={280}
              style={{ margin: '0 auto' }}
            />
          </div>

          <Paragraph
            copyable={{ text: qrString }}
            className="copyableAddress"
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              marginBottom: 0,
            }}
          >
            <Text>{qrString.substring(0, 80)}...</Text>
          </Paragraph>
        </div>

        {/* Method Info */}
        <Alert
          message={`Method: ${method}`}
          description="EIP-712 structured data signature"
          type="info"
          showIcon
          style={{ marginBottom: 16, fontSize: '12px' }}
        />

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary" italic>
            {t('home:walletconnect.ssp_key_confirmation_needed')}
          </Text>
        </div>
      </Space>
    </Modal>
  );
};

export default TypedDataSignModal;
