import { Typography, Button, Space, Modal } from 'antd';
const { Paragraph, Text } = Typography;
import { useTranslation } from 'react-i18next';

function WordsDialog(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  wordsPhrase: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title={t('home:nodesTable.storage_phrase')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            {t('common:ok')}
          </Button>,
        ]}
      >
        <Space direction="vertical" size="large" style={{ marginBottom: 15 }}>
          <Text>{t('home:nodesTable.add_to_storage_added')}</Text>
          <Text>{t('home:nodesTable.add_to_storage_added_info')}</Text>
          <Paragraph
            copyable={{ text: props.wordsPhrase }}
            className="copyableAddress"
          >
            <Text>{props.wordsPhrase}</Text>
          </Paragraph>
        </Space>
      </Modal>
    </>
  );
}

export default WordsDialog;
