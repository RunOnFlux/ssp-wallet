import React, { useState } from 'react';
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
  const [step, setStep] = useState<'approval' | 'qr'>('approval');
  const [isApproving, setIsApproving] = useState(false);

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
      name:
        request.verifyContext?.verified?.origin ||
        t('home:walletconnect.unknown_dapp'),
      url: request.verifyContext?.verified?.validation || '',
    },
    timestamp: Date.now(),
  });

  // Follow exact ConfirmTxKey pattern: chain:wallet:data
  const qrString = `${activeChain}:${walletInUse}:${walletConnectData}`;

  const handleApprove = () => {
    if (step === 'approval') {
      // First step: Move to QR code step
      setIsApproving(true);
      try {
        // Initiate the signing process but don't wait for completion
        onApprove(request);
        setStep('qr');
      } catch (error) {
        console.error('Error initiating typed data signing:', error);
      } finally {
        setIsApproving(false);
      }
    } else {
      // Second step: Just close the modal (signing was already initiated)
      // The signing process handles the rest via the unified signing flow
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting typed data:', error);
    }
  };

  // First step: Approval dialog
  if (step === 'approval') {
    return (
      <Modal
        title={t('home:walletconnect.sign_typed_data_request')}
        open={true}
        onOk={handleApprove}
        onCancel={handleReject}
        okText={t('home:walletconnect.approve')}
        cancelText={t('home:walletconnect.reject')}
        confirmLoading={isApproving}
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
                    {t('home:walletconnect.structured_eip712_data')}
                  </Text>
                </div>
              }
              type="success"
              style={{ marginBottom: 12 }}
            />

            <Text type="secondary">
              {t('home:walletconnect.technical_data_eip712')}
            </Text>
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

          {/* Method Info */}
          <Alert
            message={`${t('home:walletconnect.method_prefix')} ${method}`}
            description={t(
              'home:walletconnect.eip712_structured_data_signature',
            )}
            type="info"
            showIcon
            style={{ marginBottom: 16, fontSize: '12px' }}
          />

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text type="secondary">
              {t('home:walletconnect.step_1_approve_wallet')}
            </Text>
          </div>
        </Space>
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
      width={600}
    >
      <div style={{ textAlign: 'center' }}>
        <Paragraph>{t('home:confirmTxKey.info_1')}</Paragraph>

        <Space
          direction="vertical"
          size="large"
          style={{ width: '100%', marginBottom: 20 }}
        >
          <QRCode
            errorLevel="M"
            value={qrString}
            icon="/ssp-logo-black.svg"
            size={280}
            style={{ margin: '0 auto' }}
          />

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
        </Space>

        <Text type="secondary" italic>
          {t('home:walletconnect.ssp_key_confirmation_needed')}
        </Text>
      </div>
    </Modal>
  );
};

export default TypedDataSignModal;
