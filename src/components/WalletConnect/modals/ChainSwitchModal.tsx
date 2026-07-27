import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, App, Alert } from 'antd';
import '../../DappRequest/DappRequest.css';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../../types';
import { switchToChain } from '../../../lib/chainSwitching';
import { toast } from '../../../lib/toast';
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
  const { modal } = App.useApp();
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const [isApproving, setIsApproving] = useState(false);
  // the unsupported-chain dialog + auto-reject must fire once per request
  const rejectedRequestId = useRef<number | null>(null);

  const switchParams =
    request && request.params.request.method === 'wallet_switchEthereumChain'
      ? (request.params.request.params as [SwitchChainRequest])[0]
      : null;
  const chainId = switchParams?.chainId;

  // Find the SSP chain that matches this chainId (0x-prefixed hex)
  const targetChain = useMemo(() => {
    if (!chainId) return undefined;
    const targetChainId = parseInt(chainId, 16);
    return Object.entries(blockchains).find(
      ([, config]) =>
        config.chainType === 'evm' &&
        parseInt(config.chainId!) === targetChainId,
    );
  }, [chainId]);

  useEffect(() => {
    setIsApproving(false);
  }, [request?.id]);

  // Unsupported chain: an effect, not the render body — called during render it
  // re-fired the dialog on every re-render.
  useEffect(() => {
    if (!request || !chainId || targetChain) return;
    if (rejectedRequestId.current === request.id) return;
    rejectedRequestId.current = request.id;
    modal.error({
      title: t('home:walletconnect.switch_chain_request'),
      content: t('home:walletconnect.unsupported_chain_id', { chainId }),
    });
    void onReject(request);
  }, [request, chainId, targetChain, modal, onReject, t]);

  if (!request || !chainId || !targetChain) {
    return null;
  }

  const [chainKey] = targetChain;

  const handleApprove = async () => {
    if (isApproving) return;
    setIsApproving(true);
    try {
      // Use the new chain switching utility
      await switchToChain(chainKey as keyof cryptos, passwordBlob);
      await onApprove(request);
    } catch (error) {
      console.error('Error switching chain:', error);
      // the user pressed Approve — never reject silently
      const reason = error instanceof Error ? error.message : '';
      toast.error(
        reason
          ? `${t('home:chainSelect.unable_switch_chain')} ${reason}`
          : t('home:chainSelect.unable_switch_chain'),
      );
      void onReject(request);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = () => {
    void onReject(request);
  };

  return (
    <Modal
      title={t('home:walletconnect.switch_chain_request')}
      open={true}
      onOk={() => void handleApprove()}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
      cancelButtonProps={{ type: 'text', disabled: isApproving }}
      confirmLoading={isApproving}
      maskClosable={!isApproving}
      closable={!isApproving}
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
        <p className="dapp-ask">
          {t('home:walletconnect.dapp_requests_chain_switch')}
        </p>

        <div className="dapp-summary">
          <div className="dapp-summary-row">
            <span className="dapp-summary-label">
              {t('home:walletconnect.target_chain')}
            </span>
            <span className="dapp-summary-value">{targetChain[1].name}</span>
          </div>
        </div>

        <Alert
          message={t('home:walletconnect.switch_chain_warning')}
          type="warning"
          showIcon
        />
      </div>
    </Modal>
  );
};

export default ChainSwitchModal;
