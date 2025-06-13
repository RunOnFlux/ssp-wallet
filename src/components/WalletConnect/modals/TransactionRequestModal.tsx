import React, { useState } from 'react';
import { Modal, QRCode, Space, Typography, Card, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../../types';
import { SessionRequest, EthereumTransaction } from '../types/modalTypes';

const { Text, Paragraph } = Typography;

interface TransactionRequestModalProps {
  request: SessionRequest | null;
  onApprove: (request: SessionRequest) => Promise<void>;
  onReject: (request: SessionRequest) => Promise<void>;
}

const TransactionRequestModal: React.FC<TransactionRequestModalProps> = ({
  request,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { walletInUse } = useAppSelector((state) => state[activeChain]);
  const [step, setStep] = useState<'approval' | 'qr'>('approval');
  const [isApproving, setIsApproving] = useState(false);

  if (!request || request.params.request.method !== 'eth_sendTransaction') {
    return null;
  }

  const requestParams = request.params.request.params as [EthereumTransaction];
  const [transaction] = requestParams;

  // Create request data following SSP ConfirmTxKey pattern: chain:wallet:data
  const walletConnectData = JSON.stringify({
    type: 'walletconnect',
    id: request.id,
    method: request.params.request.method,
    params: requestParams,
    dapp: {
      name: request.verifyContext?.verified?.origin || 'Unknown dApp',
      url: request.verifyContext?.verified?.validation || '',
    },
    timestamp: Date.now(),
  });

  // Follow exact ConfirmTxKey pattern: chain:wallet:data
  const qrString = `${activeChain}:${walletInUse}:${walletConnectData}`;

  // Helper function to get currency symbol for chain
  const getChainCurrencySymbol = (chainKey: keyof cryptos): string => {
    return blockchains[chainKey]?.symbol || 'ETH';
  };

  // Helper function to format currency value with proper symbol
  const formatCurrencyValue = (
    value: string,
    chainKey: keyof cryptos,
  ): string => {
    const symbol = getChainCurrencySymbol(chainKey);
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return `0 ${symbol}`;
    return `${numValue} ${symbol}`;
  };

  // Helper function to format gas value nicely
  const formatGasValue = (gas?: string, gasLimit?: string): string => {
    const gasValue = gas || gasLimit;
    if (!gasValue) return t('home:walletconnect.gas_not_specified');

    try {
      const gasNum = parseInt(gasValue, 16);
      return gasNum.toLocaleString();
    } catch {
      return gasValue;
    }
  };

  // Helper function to format transaction data nicely
  const formatTransactionData = (data: string): React.ReactNode => {
    if (!data || data === '0x') {
      return (
        <span style={{ fontStyle: 'italic', color: '#999' }}>
          {t('home:walletconnect.no_data')}
        </span>
      );
    }

    // If data is too long, show first and last parts with ellipsis
    if (data.length > 100) {
      return (
        <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          <div>{data.substring(0, 50)}</div>
          <div style={{ textAlign: 'center', color: '#999', margin: '4px 0' }}>
            ...
          </div>
          <div>{data.substring(data.length - 50)}</div>
        </div>
      );
    }

    return (
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '12px',
          wordBreak: 'break-all',
        }}
      >
        {data}
      </div>
    );
  };

  const handleApprove = () => {
    if (step === 'approval') {
      // First step: Move to QR code step
      setIsApproving(true);
      try {
        // Initiate the transaction process but don't wait for completion
        onApprove(request);
        setStep('qr');
      } catch (error) {
        console.error('Error initiating transaction:', error);
      } finally {
        setIsApproving(false);
      }
    } else {
      // Second step: Just close the modal (transaction was already initiated)
      // The transaction process handles the rest via the unified signing flow
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting transaction:', error);
    }
  };

  // First step: Approval dialog
  if (step === 'approval') {
    return (
      <Modal
        title={t('home:walletconnect.transaction_request')}
        open={true}
        onOk={handleApprove}
        onCancel={handleReject}
        okText={t('home:walletconnect.approve')}
        cancelText={t('home:walletconnect.reject')}
        confirmLoading={isApproving}
        width={600}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Text>{t('home:walletconnect.dapp_requests_transaction')}</Text>

          {/* Transaction Details */}
          <Card
            size="small"
            title={t('home:walletconnect.transaction_request')}
            style={{ marginBottom: 16 }}
          >
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div>
                <Text strong>{t('home:walletconnect.to')}: </Text>
                <Text code copyable>
                  {transaction.to || t('common:address')}
                </Text>
              </div>

              <div>
                <Text strong>{t('home:walletconnect.value')}: </Text>
                <Text>
                  {formatCurrencyValue(transaction.value || '0', activeChain)}
                </Text>
              </div>

              <div>
                <Text strong>{t('home:walletconnect.gas')}: </Text>
                <Text>
                  {formatGasValue(transaction.gas, transaction.gasLimit)}
                </Text>
              </div>

              {transaction.data && transaction.data !== '0x' && (
                <div>
                  <Text strong>{t('home:walletconnect.data')}: </Text>
                  <div style={{ marginTop: '4px' }}>
                    {formatTransactionData(transaction.data)}
                  </div>
                </div>
              )}
            </Space>
          </Card>

          {/* Method Info */}
          <Alert
            message="Method: eth_sendTransaction"
            description="Execute transaction on blockchain"
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

export default TransactionRequestModal;
