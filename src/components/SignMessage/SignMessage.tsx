import { Typography, Button, Space, Modal } from 'antd';
import { IssuesCloseOutlined } from '@ant-design/icons';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';

interface signMessageData {
  status: string;
  result: string;
}

function SignMessage(props: {
  open: boolean;
  openAction: (data: signMessageData | null) => void;
  message: string;
  address: string;
  chain: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction, message, address, chain } = props;
  console.log(message, address, chain);

  const handleOk = () => {
    openAction({
      status: 'SUCCESS',
      result: 'hello from ssp sign message',
    });
  };

  const handleCancel = () => {
    openAction(null);
  };

  return (
    <>
      <Modal
        title="signMessage"
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
      >
        <Space
          direction="vertical"
          size={32}
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <Text>{t('home:txRejected.tx_rejected_info')}</Text>
          <IssuesCloseOutlined style={{ fontSize: '48px' }} />
          <Text>{t('home:txRejected.tx_rejected_info_2')}</Text>
          <Button type="primary" size="middle" onClick={handleOk}>
            {t('common:ok')}
          </Button>
          <Button type="primary" size="middle" onClick={handleCancel}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default SignMessage;
