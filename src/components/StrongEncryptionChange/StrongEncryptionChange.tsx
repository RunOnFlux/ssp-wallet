import { Typography, Button, Space, Modal } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';

function StrongEncryptionChange(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['common', 'cr']);
  const { open, openAction } = props;

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title={t('cr:strong_fingerprint_encryption')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[]}
      >
        <Space
          direction="vertical"
          size={32}
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <Text>{t('cr:strong_fingerprint_encryption_info')}</Text>
          <WarningOutlined style={{ fontSize: '48px' }} />
          <Text>{t('cr:strong_encryption_change_detected')}</Text>
          <Text>{t('cr:strong_encryption_change_detected_info_2')}</Text>
          <Text>{t('cr:strong_encryption_change_detected_info_3')}</Text>
          <Button type="primary" size="middle" onClick={handleOk}>
            {t('common:ok')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default StrongEncryptionChange;
