import React, { useEffect } from 'react';
import { useWalletConnect } from '../../contexts/WalletConnectContext';
import ConnectionRequestModal from './modals/ConnectionRequestModal';
import PersonalSignModal from './modals/PersonalSignModal';
import TypedDataSignModal from './modals/TypedDataSignModal';
import TransactionRequestModal from './modals/TransactionRequestModal';
import ChainSwitchModal from './modals/ChainSwitchModal';
import ConfirmPublicNoncesKey from '../ConfirmPublicNoncesKey/ConfirmPublicNoncesKey';
import PublicNoncesRejected from '../PublicNoncesRejected/PublicNoncesRejected';
import PublicNoncesReceived from '../PublicNoncesReceived/PublicNoncesReceived';

const WalletConnectModals: React.FC = () => {
  const {
    pendingProposal,
    pendingRequestModal,
    currentSigningRequest,
    openConfirmPublicNonces,
    openPublicNoncesRejected,
    openPublicNoncesReceived,
    confirmPublicNoncesAction,
    publicNoncesRejectedAction,
    publicNoncesReceivedAction,
    approveSession,
    rejectSession,
    approveRequest,
    rejectRequest,
  } = useWalletConnect();

  // Handle unhandled session request methods
  useEffect(() => {
    if (!pendingRequestModal) return;

    const { request } = pendingRequestModal.params;
    const { method } = request;

    // Check if this is a method we don't handle with specific modals
    const handledMethods = [
      'personal_sign',
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
      'eth_sendTransaction',
      'wallet_switchEthereumChain',
    ];

    if (!handledMethods.includes(method)) {
      console.warn('Unhandled session request method:', method);
      void rejectRequest(pendingRequestModal);
    }
  }, [pendingRequestModal, rejectRequest]);

  // Wrapper function to handle the enhanced approve session
  const handleApproveSession = async (
    proposal: Parameters<typeof approveSession>[0],
    selectedChains: number[],
    selectedAccounts: Record<number, string[]>,
  ) => {
    return approveSession(proposal, selectedChains, selectedAccounts);
  };

  return (
    <>
      {/* Connection Request Modal */}
      <ConnectionRequestModal
        proposal={pendingProposal}
        onApprove={handleApproveSession}
        onReject={rejectSession}
      />

      {/* Personal Sign Modal */}
      <PersonalSignModal
        request={pendingRequestModal}
        onApprove={approveRequest}
        onReject={rejectRequest}
        externalSigningRequest={currentSigningRequest}
      />

      {/* Typed Data Sign Modal */}
      <TypedDataSignModal
        request={pendingRequestModal}
        onApprove={approveRequest}
        onReject={rejectRequest}
        externalSigningRequest={currentSigningRequest}
      />

      {/* Transaction Request Modal */}
      <TransactionRequestModal
        request={pendingRequestModal}
        onApprove={approveRequest}
        onReject={rejectRequest}
      />

      {/* Chain Switch Modal */}
      <ChainSwitchModal
        request={pendingRequestModal}
        onApprove={approveRequest}
        onReject={rejectRequest}
      />

      {/* Public Nonces Dialogs - same as SendEVM */}
      <ConfirmPublicNoncesKey
        open={openConfirmPublicNonces}
        openAction={confirmPublicNoncesAction}
      />
      <PublicNoncesRejected
        open={openPublicNoncesRejected}
        openAction={publicNoncesRejectedAction}
      />
      <PublicNoncesReceived
        open={openPublicNoncesReceived}
        openAction={publicNoncesReceivedAction}
      />
    </>
  );
};

export default WalletConnectModals;
