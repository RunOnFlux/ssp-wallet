import { useState } from 'react';
import { QRCode, Typography, Button, Space, Modal, Input, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { TextArea } = Input;
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';
const { Paragraph, Text } = Typography;

interface publicNonces {
  kPublic: string;
  kTwoPublic: string;
}

function ConfirmPublicNoncesKey(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;
  const [keyInput, setKeyInput] = useState('');

  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleOk = () => {
    if (keyInput.length > 0) {
      // process keyInput
      const sspKeyPublicNonces = JSON.parse(keyInput) as publicNonces[];
      void (async function () {
        try {
          await localForage.setItem('sspKeyPublicNonces', sspKeyPublicNonces);
          // display message
          displayMessage('success', t('home:confirmPublicNoncesKey.public_nonces_stored'));
        } catch (error) {
          console.log(error);
        }
      })();
    }
    setKeyInput('');
    openAction(false);
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:confirmPublicNoncesKey.confirm_public_nonces_key')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="large"
          style={{ marginBottom: 15, marginTop: 15 }}
        >
          <Text>
            {t('home:confirmPublicNoncesKey.confirm_public_nonces_key_info')}
          </Text>
          <div>
            <QRCode
              errorLevel="M"
              value="publicnonces"
              icon="/ssp-logo-black.svg"
              size={240}
              style={{ margin: '0 auto 15px auto' }}
            />
            <Paragraph
              copyable={{ text: 'publicnonces' }}
              className="copyableAddress"
            >
              <Text>publicnonces</Text>
            </Paragraph>
          </div>
          <Text>
            {t('home:confirmPublicNoncesKey.confirm_public_nonces_key_info_2')}
          </Text>

          <TextArea
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={t('home:confirmPublicNoncesKey.manual_input')}
            autoSize
          />
          <Button type="primary" size="middle" onClick={handleOk}>
            {t('common:ok')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default ConfirmPublicNoncesKey;
