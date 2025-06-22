import React from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../../types';
import { switchToChain } from '../../../lib/chainSwitching';
import { SessionRequest, SwitchChainRequest } from '../types/modalTypes';

interface ChainSwitchModalProps {
  request: SessionRequest | null;
  onApprove: (request: SessionRequest) => Promise<void>;
  onReject: (request: SessionRequest) => Promise<void>;
}

const ChainSwitchModal: React.FC<ChainSwitchModalProps> = ({
  request,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation(['home', 'common']);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);

  if (
    !request ||
    request.params.request.method !== 'wallet_switchEthereumChain'
  ) {
    return null;
  }

  const requestParams = request.params.request.params as [SwitchChainRequest];
  const [{ chainId }] = requestParams;

  // Parse chainId (remove 0x prefix if present)
  const targetChainId = parseInt(chainId, 16);

  // Find the SSP chain that matches this chainId
  const targetChain = Object.entries(blockchains).find(
    ([, config]) =>
      config.chainType === 'evm' && parseInt(config.chainId!) === targetChainId,
  );

  if (!targetChain) {
    Modal.error({
      title: t('home:walletconnect.unsupported_chain_id', { chainId }),
      content: t('home:walletconnect.unsupported_chain_id', { chainId }),
    });
    void onReject(request);
    return null;
  }

  const [chainKey] = targetChain;

  const handleApprove = async () => {
    try {
      // Use the new chain switching utility
      await switchToChain(chainKey as keyof cryptos, passwordBlob);
      void onApprove(request);
    } catch (error) {
      console.error('Error switching chain:', error);
      void onReject(request);
    }
  };

  const handleReject = () => {
    void onReject(request);
  };

  return (
    <Modal
      title={t('home:walletconnect.switch_chain_request')}
      open={true}
      onOk={handleApprove}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
    >
      <p>{t('home:walletconnect.dapp_requests_chain_switch')}</p>

      <div style={{ marginBottom: '8px' }}>
        <strong>{t('home:walletconnect.target_chain')}:</strong>{' '}
        {targetChain[1].name}
      </div>

      <p style={{ color: '#faad14', marginTop: '12px' }}>
        {t('home:walletconnect.switch_chain_warning')}
      </p>
    </Modal>
  );
};

export default ChainSwitchModal;
