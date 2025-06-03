import React from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { SessionRequest } from '../types/modalTypes';

interface PersonalSignModalProps {
  request: SessionRequest | null;
  onApprove: (request: SessionRequest) => Promise<void>;
  onReject: (request: SessionRequest) => Promise<void>;
}

const PersonalSignModal: React.FC<PersonalSignModalProps> = ({
  request,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation(['home', 'common']);

  if (!request || request.params.request.method !== 'personal_sign') {
    return null;
  }

  const requestParams = request.params.request.params as [string, string];
  const [messageToSign, address] = requestParams;

  const handleApprove = async () => {
    try {
      await onApprove(request);
    } catch (error) {
      console.error('Error approving personal sign:', error);
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting personal sign:', error);
    }
  };

  return (
    <Modal
      title={t('home:walletconnect.sign_message_request')}
      open={true}
      onOk={handleApprove}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
    >
      <p>{t('home:walletconnect.dapp_requests_signature')}</p>

      <div style={{ margin: '12px 0' }}>
        <strong>{t('home:walletconnect.message')}:</strong>
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px',
            maxHeight: '100px',
            overflow: 'auto',
            wordBreak: 'break-all',
          }}
        >
          {messageToSign}
        </div>
      </div>

      <p>
        <strong>{t('home:walletconnect.address')}:</strong> {address}
      </p>

      <p>{t('home:walletconnect.ssp_key_confirmation_needed')}</p>
    </Modal>
  );
};

export default PersonalSignModal;
