import { Typography, Button, Space, Modal, Spin } from 'antd';
import { MobileOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export type RecoveryDialogStatus =
  | 'waiting'
  | 'approved'
  | 'denied'
  | 'timeout'
  | 'error';

interface RecoveryDialogProps {
  open: boolean;
  status: RecoveryDialogStatus;
  errorCode?: string;
  onClose: () => void;
  onRetry?: () => void;
}

function RecoveryDialog({
  open,
  status,
  errorCode,
  onClose,
  onRetry,
}: RecoveryDialogProps) {
  const { t } = useTranslation(['login', 'common']);

  const isBusy = status === 'waiting';
  const isFailure =
    status === 'denied' || status === 'timeout' || status === 'error';

  return (
    <Modal
      title={t('login:recovery_dialog_title')}
      open={open}
      style={{ textAlign: 'center', top: 60 }}
      onCancel={onClose}
      closable={!isBusy}
      maskClosable={false}
      footer={[]}
    >
      <Space
        direction="vertical"
        size={24}
        style={{ marginBottom: 16, marginTop: 16, width: '100%' }}
      >
        {status === 'waiting' && (
          <>
            <MobileOutlined style={{ fontSize: '48px' }} />
            <Text>{t('login:recovery_dialog_body')}</Text>
            <Spin />
            <Text type="secondary">{t('login:recovery_waiting')}</Text>
          </>
        )}
        {status === 'approved' && (
          <>
            <CheckCircleOutlined
              style={{ fontSize: '48px', color: '#52c41a' }}
            />
            <Text>{t('login:recovery_approved')}</Text>
          </>
        )}
        {status === 'denied' && (
          <>
            <Text>{t('login:recovery_denied_body')}</Text>
            <Space>
              {onRetry && (
                <Button type="primary" onClick={onRetry}>
                  {t('common:retry')}
                </Button>
              )}
              <Button onClick={onClose}>{t('common:cancel')}</Button>
            </Space>
          </>
        )}
        {status === 'timeout' && (
          <>
            <Text>{t('login:recovery_timeout_body')}</Text>
            <Space>
              {onRetry && (
                <Button type="primary" onClick={onRetry}>
                  {t('common:retry')}
                </Button>
              )}
              <Button onClick={onClose}>{t('common:cancel')}</Button>
            </Space>
          </>
        )}
        {status === 'error' && (
          <>
            <Text>{t('login:recovery_error_body')}</Text>
            {errorCode && (
              <Text type="secondary">
                {t('login:err_lx', { code: errorCode })}
              </Text>
            )}
            <Space>
              {onRetry && (
                <Button type="primary" onClick={onRetry}>
                  {t('common:retry')}
                </Button>
              )}
              <Button onClick={onClose}>{t('common:cancel')}</Button>
            </Space>
          </>
        )}

        {isBusy && (
          <Button size="small" onClick={onClose}>
            {t('common:cancel')}
          </Button>
        )}
        {!isBusy && !isFailure && status !== 'approved' && (
          <Button type="primary" size="middle" onClick={onClose}>
            {t('common:ok')}
          </Button>
        )}
      </Space>
    </Modal>
  );
}

export default RecoveryDialog;
