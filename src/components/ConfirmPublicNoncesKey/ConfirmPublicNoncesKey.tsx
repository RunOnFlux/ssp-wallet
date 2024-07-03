import { Typography, Button, Space, Modal } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
const { Text } = Typography;

function ConfirmPublicNoncesKey(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title={t('home:confirmPublicNoncesKey.confirm_public_nonces_key')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[]}
      >
        <Space direction="vertical" size={32} style={{ marginBottom: 16, marginTop: 16 }}>
          <ClockCircleOutlined style={{ fontSize: '48px' }} />
          <Text>{t('home:confirmPublicNoncesKey.confirm_public_nonces_key_info')}</Text>
          <Text>{t('home:confirmPublicNoncesKey.confirm_public_nonces_key_info_2')}</Text>
          <Text>{t('home:confirmPublicNoncesKey.confirm_public_nonces_key_info_3')}</Text>
          <Button type="primary" size="middle" onClick={handleOk}>
            {t('common:ok')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default ConfirmPublicNoncesKey;
