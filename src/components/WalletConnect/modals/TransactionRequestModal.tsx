import React, { useState } from 'react';
import {
  Modal,
  Space,
  Typography,
  Card,
  Alert,
  Collapse,
  Tag,
  Divider,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../../types';
import { SessionRequest, EthereumTransaction } from '../types/modalTypes';
import { useWalletConnect } from '../../../contexts/WalletConnectContext';
import {
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

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
  const { chainSwitchInfo } = useWalletConnect();
  const { activeChain } = useAppSelector((state) => state.sspState);
  const [step] = useState<'approval'>('approval');
  const [isApproving, setIsApproving] = useState(false);

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

  // Helper function to decode transaction data
  const decodeTransactionData = (
    data: string,
  ): {
    functionName: string;
    signature: string;
    isRecognized: boolean;
    warning?: string;
  } => {
    if (!data || data === '0x') {
      return {
        functionName: t('home:walletconnect_tx_modal.simple_transfer'),
        signature: '',
        isRecognized: true,
      };
    }

    // Common function signatures
    const functionSignatures: Record<
      string,
      { name: string; warning?: string }
    > = {
      '0xa9059cbb': {
        name: t('home:walletconnect_tx_modal.erc20_transfer'),
        warning: t('home:walletconnect_tx_modal.erc20_transfer_warning'),
      },
      '0x23b872dd': {
        name: t('home:walletconnect_tx_modal.erc20_transfer_from'),
        warning: t('home:walletconnect_tx_modal.erc20_transfer_from_warning'),
      },
      '0x095ea7b3': {
        name: t('home:walletconnect_tx_modal.erc20_approve'),
        warning: t('home:walletconnect_tx_modal.erc20_approve_warning'),
      },
      '0x40c10f19': { name: t('home:walletconnect_tx_modal.erc20_mint') },
      '0x42842e0e': {
        name: t('home:walletconnect_tx_modal.nft_safe_transfer'),
      },
      '0xa22cb465': {
        name: t('home:walletconnect_tx_modal.nft_set_approval_for_all'),
        warning: t('home:walletconnect_tx_modal.nft_approval_warning'),
      },
      '0x70a08231': { name: t('home:walletconnect_tx_modal.erc20_balance_of') },
      '0x18160ddd': {
        name: t('home:walletconnect_tx_modal.erc20_total_supply'),
      },
      '0x06fdde03': { name: t('home:walletconnect_tx_modal.erc20_name') },
      '0x95d89b41': { name: t('home:walletconnect_tx_modal.erc20_symbol') },
      '0x313ce567': { name: t('home:walletconnect_tx_modal.erc20_decimals') },
      '0x5c975abb': { name: t('home:walletconnect_tx_modal.pause') },
      '0x3f4ba83a': { name: t('home:walletconnect_tx_modal.unpause') },
    };

    const signature = data.substring(0, 10);
    const functionInfo = functionSignatures[signature];

    if (functionInfo) {
      return {
        functionName: functionInfo.name,
        signature,
        isRecognized: true,
        warning: functionInfo.warning,
      };
    }

    return {
      functionName: t('home:walletconnect_tx_modal.unknown_contract_function'),
      signature,
      isRecognized: false,
      warning: t('home:walletconnect_tx_modal.unknown_function_warning'),
    };
  };

  // Helper function to get dApp information
  const getDAppInfo = () => {
    const dappName =
      request?.verifyContext?.verified?.origin ||
      request?.params?.chainId ||
      t('home:walletconnect.unknown_dapp');

    const dappUrl = request?.verifyContext?.verified?.validation || '';
    const isVerified = !!request?.verifyContext?.verified?.isScam === false;

    return { dappName, dappUrl, isVerified };
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
    if (step === 'approval') {
      // For eth_sendTransaction, directly call onApprove which navigates to SendEVM
      setIsApproving(true);
      try {
        await onApprove(request);
        // Modal will be closed by the context when navigation happens
      } catch (error) {
        console.error('Error initiating transaction:', error);
        // If navigation failed, close the modal gracefully
        if (
          error instanceof Error &&
          error.message.includes('Navigation not available')
        ) {
          // The error message is already shown by the context
          // Just reject the request to close the modal, but don't await it
          try {
            onReject(request);
          } catch (rejectError) {
            console.error(
              'Error rejecting after navigation failure:',
              rejectError,
            );
          }
        }
      } finally {
        setIsApproving(false);
      }
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting transaction:', error);
    }
  };

  // Show approval dialog for eth_sendTransaction
  const decodedData = decodeTransactionData(transaction.data || '');
  const dappInfo = getDAppInfo();

  return (
    <Modal
      title={t('home:walletconnect.transaction_request')}
      open={true}
      onOk={handleApprove}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
      confirmLoading={isApproving}
      width={700}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* dApp Information */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text strong>{t('home:walletconnect_tx_modal.dapp_label')}:</Text>
              <Tag color={dappInfo.isVerified ? 'green' : 'orange'}>
                {dappInfo.dappName}
              </Tag>
              {dappInfo.isVerified ? (
                <InfoCircleOutlined style={{ color: '#52c41a' }} />
              ) : (
                <ExclamationCircleOutlined style={{ color: '#faad14' }} />
              )}
            </div>
            {dappInfo.dappUrl && (
              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {dappInfo.dappUrl}
                </Text>
              </div>
            )}
          </Space>
        </Card>

        <Text>{t('home:walletconnect.dapp_requests_transaction')}</Text>

        {/* Function Information */}
        {transaction.data && transaction.data !== '0x' && (
          <Card
            size="small"
            style={{
              marginBottom: 16,
              border: decodedData.warning ? '1px solid #faad14' : undefined,
            }}
          >
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Text strong>
                  {t('home:walletconnect_tx_modal.function_label_with_colon')}
                </Text>
                <Tag color={decodedData.isRecognized ? 'blue' : 'red'}>
                  {decodedData.functionName}
                </Tag>
                {decodedData.signature && (
                  <Text code style={{ fontSize: '11px' }}>
                    {decodedData.signature}
                  </Text>
                )}
              </div>
              {decodedData.warning && (
                <Alert
                  message={decodedData.warning}
                  type="warning"
                  showIcon
                  style={{ fontSize: '12px' }}
                />
              )}
            </Space>
          </Card>
        )}

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
              <Collapse
                size="small"
                items={[
                  {
                    key: '1',
                    label: t(
                      'home:walletconnect_tx_modal.raw_transaction_data',
                    ),
                    children: (
                      <div>
                        <Text strong>
                          {t('home:walletconnect_tx_modal.data_length')}:{' '}
                        </Text>
                        <Text>
                          {transaction.data.length}{' '}
                          {t('home:walletconnect_tx_modal.characters')}
                        </Text>
                        <Divider style={{ margin: '8px 0' }} />
                        {formatTransactionData(transaction.data)}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </Space>
        </Card>

        {/* Chain Switch Warning */}
        {chainSwitchInfo?.required && chainSwitchInfo.targetChain && (
          <Alert
            message={t('home:walletconnect_tx_modal.chain_switch_required')}
            description={
              <div>
                <Text>
                  {t('home:walletconnect_tx_modal.chain_switch_desc', {
                    chainName: chainSwitchInfo.targetChain.chainName,
                  })}
                </Text>
                <br />
                <Text type="secondary">
                  {t('home:walletconnect_tx_modal.address_different_chain')}
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
          message={`${t('home:walletconnect.method_prefix')} eth_sendTransaction`}
          description={t('home:walletconnect.execute_transaction_blockchain')}
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
};

export default TransactionRequestModal;
