import React from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../../types';
import { SessionRequest, EthereumTransaction } from '../types/modalTypes';

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
  const { activeChain } = useAppSelector((state) => ({
    ...state.sspState,
  }));

  if (!request || request.params.request.method !== 'eth_sendTransaction') {
    return null;
  }

  const requestParams = request.params.request.params as [EthereumTransaction];
  const [transaction] = requestParams;

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

  const handleApprove = async () => {
    try {
      await onApprove(request);
    } catch (error) {
      console.error('Error approving transaction:', error);
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting transaction:', error);
    }
  };

  return (
    <Modal
      title={t('home:walletconnect.transaction_request')}
      open={true}
      onOk={handleApprove}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
    >
      <div>
        <p>{t('home:walletconnect.dapp_requests_transaction')}</p>

        <div style={{ marginBottom: '8px' }}>
          <strong>{t('home:walletconnect.to')}:</strong>{' '}
          {transaction.to || t('common:address')}
        </div>

        <div style={{ marginBottom: '8px' }}>
          <strong>{t('home:walletconnect.value')}:</strong>{' '}
          {formatCurrencyValue(transaction.value || '0', activeChain)}
        </div>

        <div style={{ marginBottom: '8px' }}>
          <strong>{t('home:walletconnect.gas')}:</strong>{' '}
          {formatGasValue(transaction.gas, transaction.gasLimit)}
        </div>

        {transaction.data && transaction.data !== '0x' && (
          <div style={{ marginBottom: '8px' }}>
            <strong>{t('home:walletconnect.data')}:</strong>
            <div style={{ marginTop: '4px' }}>
              {formatTransactionData(transaction.data)}
            </div>
          </div>
        )}

        <p
          style={{
            marginTop: '16px',
            fontWeight: 'bold',
            color: '#1890ff',
          }}
        >
          {t('home:walletconnect.ssp_key_confirmation_needed')}
        </p>
      </div>
    </Modal>
  );
};

export default TransactionRequestModal;
