import React, { useState } from 'react';
import { Modal, Typography, Alert, Collapse, Tag, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../../types';
import { SessionRequest, EthereumTransaction } from '../types/modalTypes';
import { useWalletConnect } from '../../../contexts/WalletConnectContext';
import DappOrigin from '../../DappRequest/DappOrigin';
import '../../DappRequest/DappRequest.css';

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
  const { chainSwitchInfo, activeSessions } = useWalletConnect();
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

    if (!value || value === '0x' || value === '0x0') {
      return `0 ${symbol}`;
    }

    try {
      // Parse the hex value (Wei) and convert to Ether
      let weiValue: bigint;
      if (value.startsWith('0x')) {
        weiValue = BigInt(value);
      } else {
        weiValue = BigInt(value);
      }

      // Convert Wei to Ether (divide by 10^18)
      const etherValue = Number(weiValue) / Math.pow(10, 18);

      // Simple formatting - let JavaScript handle the display
      return `${etherValue} ${symbol}`;
    } catch (error) {
      console.error('Error parsing transaction value:', value, error);
      return `${value} ${symbol} (raw)`;
    }
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

  // dApp identity for the origin header: prefer the session peer metadata,
  // fall back to the verified origin from the request's verify context.
  const getDAppInfo = () => {
    const peerMetadata = request
      ? activeSessions[request.topic]?.peer?.metadata
      : undefined;
    const verifiedOrigin = request?.verifyContext?.verified?.origin || '';
    return {
      name: peerMetadata?.name,
      url: peerMetadata?.url || verifiedOrigin,
      icon: peerMetadata?.icons?.[0],
      isScam: !!request?.verifyContext?.verified?.isScam,
    };
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
          name={dappInfo.name}
          url={dappInfo.url}
          icon={dappInfo.icon}
        />

        {dappInfo.isScam && (
          <Alert
            message={t('home:walletconnect.security_warning')}
            description={t('home:walletconnect.connection_warning')}
            type="error"
            showIcon
          />
        )}

        <p className="dapp-ask">
          {t('home:walletconnect.dapp_requests_transaction')}
        </p>

        {/* What the contract call does — shown before the raw facts */}
        {transaction.data && transaction.data !== '0x' && (
          <div className="dapp-summary">
            <div className="dapp-summary-row">
              <span className="dapp-summary-label">
                {t('home:walletconnect_tx_modal.function_label')}
              </span>
              <span className="dapp-summary-value">
                <Tag
                  color={decodedData.isRecognized ? 'blue' : 'red'}
                  style={{ marginInlineEnd: 0 }}
                >
                  {decodedData.functionName}
                </Tag>
                {decodedData.signature && (
                  <span
                    className="dapp-mono"
                    style={{ fontSize: 11, marginLeft: 8 }}
                  >
                    {decodedData.signature}
                  </span>
                )}
              </span>
            </div>
            {decodedData.warning && (
              <Alert message={decodedData.warning} type="warning" showIcon />
            )}
          </div>
        )}

        {/* Transaction facts */}
        <div className="dapp-summary">
          <div className="dapp-summary-row">
            <span className="dapp-summary-label">{t('common:from')}</span>
            <Text className="dapp-summary-value dapp-mono" copyable>
              {transaction.from || t('common:address')}
            </Text>
          </div>
          <div className="dapp-summary-row">
            <span className="dapp-summary-label">
              {t('home:walletconnect.to')}
            </span>
            <Text className="dapp-summary-value dapp-mono" copyable>
              {transaction.to || t('common:address')}
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
          <div className="dapp-summary-row">
            <span className="dapp-summary-label">
              {t('home:walletconnect.value')}
            </span>
            <span
              className="dapp-summary-value"
              style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
            >
              {formatCurrencyValue(
                transaction.value || '0',
                chainSwitchInfo?.required && chainSwitchInfo.targetChain
                  ? chainSwitchInfo.targetChain.chainKey
                  : activeChain,
              )}
            </span>
          </div>
          <div className="dapp-summary-row">
            <span className="dapp-summary-label">
              {t('home:walletconnect.gas')}
            </span>
            <span
              className="dapp-summary-value"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatGasValue(transaction.gas, transaction.gasLimit)}
            </span>
          </div>
        </div>

        {/* Raw payload behind an expander */}
        <Collapse
          size="small"
          items={[
            {
              key: '1',
              label: t('home:walletconnect_tx_modal.raw_transaction_data'),
              children: (
                <div style={{ textAlign: 'left' }}>
                  <div
                    className="dapp-summary-label"
                    style={{ fontSize: 12, marginBottom: 4 }}
                  >
                    {t('home:walletconnect_tx_modal.complete_transaction')}
                  </div>
                  <Text
                    className="dapp-payload"
                    style={{ display: 'block' }}
                    copyable={{
                      text: JSON.stringify(transaction, null, 2),
                    }}
                  >
                    {JSON.stringify(transaction, null, 2)}
                  </Text>

                  {transaction.data && transaction.data !== '0x' && (
                    <>
                      <Divider style={{ margin: '12px 0 8px 0' }} />
                      <div
                        className="dapp-summary-label"
                        style={{ fontSize: 12, marginBottom: 4 }}
                      >
                        {t('home:walletconnect_tx_modal.data_field_only')} ·{' '}
                        {t('home:walletconnect_tx_modal.data_length')}:{' '}
                        {transaction.data.length}{' '}
                        {t('home:walletconnect_tx_modal.characters')}
                      </div>
                      <Text
                        className="dapp-payload"
                        style={{ display: 'block' }}
                        copyable={{ text: transaction.data }}
                      >
                        {transaction.data}
                      </Text>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />

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
          />
        )}

        {/* Method footnote */}
        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5 }}>
          <span style={{ fontFamily: 'var(--ssp-mono)' }}>
            eth_sendTransaction
          </span>
          {' — '}
          {t('home:walletconnect.execute_transaction_blockchain')}
          <br />
          {t('home:walletconnect.step_1_approve_wallet')}
        </Text>
      </div>
    </Modal>
  );
};

export default TransactionRequestModal;
