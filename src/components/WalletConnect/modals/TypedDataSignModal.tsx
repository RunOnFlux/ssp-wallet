import React, { useState, useEffect } from 'react';
import { Modal, QRCode, Space, Typography, Card, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { SessionRequest } from '../types/modalTypes';
import { useWalletConnect } from '../../../contexts/WalletConnectContext';
import { blockchains } from '@storage/blockchains';

const { Text, Paragraph } = Typography;

interface TypedDataSignModalProps {
  request: SessionRequest | null;
  onApprove: (request: SessionRequest) => Promise<void>;
  onReject: (request: SessionRequest) => Promise<void>;
  externalSigningRequest?: Record<string, unknown> | null;
}

const TypedDataSignModal: React.FC<TypedDataSignModalProps> = ({
  request,
  onApprove,
  onReject,
  externalSigningRequest,
}) => {
  const { t } = useTranslation(['home', 'common']);
  const { chainSwitchInfo } = useWalletConnect();
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
  const isTypedDataMethod = [
    'eth_signTypedData',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ].includes(method);

  if (!isTypedDataMethod) return null;

  const requestParams = request.params.request.params as unknown[];

  let address: string;
  let typedData: unknown;

  // Handle different parameter orders for different eth_signTypedData versions
  if (method === 'eth_signTypedData') {
    // Original format: [typedData, address]
    [typedData, address] = requestParams as [unknown, string];
  } else {
    // v3/v4 format: [address, typedData]
    [address, typedData] = requestParams as [string, unknown];
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
        console.error('Error initiating typed data signing:', error);
      } finally {
        setIsApproving(false);
      }
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
        style={{ textAlign: 'center', top: 60 }}
      >
        <Space
          direction="vertical"
          size="large"
          style={{ width: '100%', textAlign: 'left' }}
        >
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
                style={{ fontSize: '13px', fontWeight: 'bold' }}
              >
                {address}
              </Text>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {chainSwitchInfo?.required && chainSwitchInfo.targetChain
                    ? t('home:walletconnect.on_network', {
                        networkName: chainSwitchInfo.targetChain.chainName,
                      })
                    : t('home:walletconnect.on_network', {
                        networkName: blockchains[activeChain].name,
                      })}
                </Text>
              </div>
            </div>
          </Card>

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
              style={{ marginBottom: 16 }}
            />
          )}

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
              <Text
                copyable={{ text: JSON.stringify(typedData, null, 2) }}
                style={{ fontSize: '12px' }}
              >
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
      style={{ textAlign: 'center', top: 60 }}
    >
      <div style={{ textAlign: 'left' }}>
        <div style={{ textAlign: 'center' }}>
          {qrString && qrString.length < 1250 && (
            <Paragraph>{t('home:confirmTxKey.info_1')}</Paragraph>
          )}
          {qrString && qrString.length >= 1250 && (
            <Paragraph>{t('home:confirmTxKey.info_2')}</Paragraph>
          )}

          <Space
            direction="vertical"
            size="large"
            style={{ width: '100%', marginBottom: 20 }}
          >
            {qrString && qrString.length < 1250 && (
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
              <Text type="secondary">
                {t('home:walletconnect.waiting_signing_request_data')}
              </Text>
            )}
          </Space>

          <Text type="secondary" italic>
            {t('home:walletconnect.ssp_key_confirmation_needed')}
          </Text>
        </div>
      </div>
    </Modal>
  );
};

export default TypedDataSignModal;
