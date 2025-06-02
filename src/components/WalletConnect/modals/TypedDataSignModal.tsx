import React from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { SessionRequest } from '../types/modalTypes';

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

  const handleApprove = async () => {
    try {
      await onApprove(request);
    } catch (error) {
      console.error('Error approving typed data:', error);
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting typed data:', error);
    }
  };

  return (
    <Modal
      title={t('home:walletconnect.sign_typed_data_request')}
      open={true}
      onOk={handleApprove}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
    >
      <p>{t('home:walletconnect.dapp_requests_typed_data_signature')}</p>

      <p>
        <strong>{t('home:walletconnect.address')}:</strong> {address}
      </p>

      <div style={{ margin: '12px 0' }}>
        <strong>{t('home:walletconnect.data')}:</strong>
        <pre
          style={{
            marginTop: '8px',
            maxHeight: '200px',
            overflow: 'auto',
            background: '#f5f5f5',
            padding: '10px',
            borderRadius: '4px',
            fontSize: '12px',
          }}
        >
          {JSON.stringify(typedData, null, 2)}
        </pre>
      </div>

      <p>{t('home:walletconnect.ssp_key_confirmation_needed')}</p>
    </Modal>
  );
};

export default TypedDataSignModal;
