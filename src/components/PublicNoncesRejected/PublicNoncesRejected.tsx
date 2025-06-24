import { Typography, Button, Space, Modal } from 'antd';
import { IssuesCloseOutlined } from '@ant-design/icons';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';

function PublicNoncesRejected(props: {
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
        title={t('home:publicNoncesRejected.public_nonces_rejected')}
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
          <Text>
            {t('home:publicNoncesRejected.public_nonces_rejected_info')}
          </Text>
          <IssuesCloseOutlined style={{ fontSize: '48px' }} />
          <Text>
            {t('home:publicNoncesRejected.public_nonces_rejected_info_2')}
          </Text>
          <Button type="primary" size="middle" onClick={handleOk}>
            {t('common:ok')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default PublicNoncesRejected;
