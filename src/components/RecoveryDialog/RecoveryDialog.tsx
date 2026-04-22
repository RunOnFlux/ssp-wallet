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
  /**
   * Navigate to the full wallet restore flow. Shown as a tertiary/link-style
   * option so users whose phone is unreachable (lost, dead battery, SSP Key
   * reinstall pending) still have an exit — without having to close this
   * dialog first and find the Restore button on the login screen.
   */
  onRestore?: () => void;
}

function RecoveryDialog({
  open,
  status,
  errorCode,
  onClose,
  onRetry,
  onRestore,
}: RecoveryDialogProps) {
  const { t } = useTranslation(['login', 'common']);

  const isBusy = status === 'waiting';
  const isApproved = status === 'approved';
  const isFailure =
    status === 'denied' || status === 'timeout' || status === 'error';

  return (
    <Modal
      title={t('login:recovery_dialog_title')}
      open={open}
      style={{ textAlign: 'center', top: 60 }}
      onCancel={onClose}
      closable={!isBusy && !isApproved}
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
        {status === 'denied' && <Text>{t('login:recovery_denied_body')}</Text>}
        {status === 'timeout' && (
          <Text>{t('login:recovery_timeout_body')}</Text>
        )}
        {status === 'error' && (
          <>
            <Text>{t('login:recovery_error_body')}</Text>
            {errorCode && (
              <Text type="secondary">
                {t('login:err_lx', { code: errorCode })}
              </Text>
            )}
          </>
        )}

        {/* Action buttons — content-width, centered by the modal's
            textAlign: 'center'. Matches StrongEncryptionChange and other
            SSP dialogs (no full-width/block buttons). Retry is primary on
            failure; cancel is always present except on the approved
            auto-dismiss flash; restore is a subtle link as last-resort. */}
        <Space direction="vertical" size={12} align="center">
          {isFailure && onRetry && (
            <Button type="primary" size="middle" onClick={onRetry}>
              {t('common:retry')}
            </Button>
          )}
          {!isApproved && (
            <Button size="middle" onClick={onClose}>
              {t('common:cancel')}
            </Button>
          )}
          {!isApproved && onRestore && (
            <Button type="link" size="small" onClick={onRestore}>
              {t('login:recovery_restore_instead')}
            </Button>
          )}
        </Space>
      </Space>
    </Modal>
  );
}

export default RecoveryDialog;
