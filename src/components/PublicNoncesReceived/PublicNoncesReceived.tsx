import { Typography, Button, Space, Modal } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';

function PublicNoncesReceived(props: {
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
        title={t('home:publicNoncesReceived.public_nonces_received')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[]}
        zIndex={1100}
      >
        <Space
          direction="vertical"
          size={32}
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <CheckCircleOutlined style={{ fontSize: '48px' }} />
          <Text>
            {t('home:publicNoncesReceived.public_nonces_received_info')}
          </Text>
          <Button type="primary" size="middle" onClick={handleOk}>
            {t('common:ok')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default PublicNoncesReceived;
