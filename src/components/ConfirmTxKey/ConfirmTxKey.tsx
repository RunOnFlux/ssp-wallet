import { QRCode, Typography, Button, Space, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
const { Paragraph, Text } = Typography;

function ConfirmTxKey(props: {
  open: boolean;
  txHex: string;
  chain: string;
  wallet: string;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction, txHex, chain, wallet } = props;

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title={t('home:confirmTxKey.confirm_tx_key')}
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
        {txHex.length < 3000 && (
          <>
            <p>{t('home:confirmTxKey.info_1')}</p>
            <Space
              direction="vertical"
              size="large"
              style={{ marginBottom: 15 }}
            >
              <QRCode
                errorLevel="H"
                value={`${chain}:${wallet}:${txHex}`}
                icon="/ssp-logo-black.svg"
                size={256}
                style={{ margin: '0 auto' }}
              />
              <Paragraph
                copyable={{ text: `${chain}:${wallet}:${txHex}` }}
                className="copyableAddress"
              >
                <Text>{`${chain}:${wallet}:${txHex}`}</Text>
              </Paragraph>
            </Space>
          </>
        )}
        {txHex.length >= 3000 && (
          <>
            <p>{t('home:confirmTxKey.info_2')}</p>
            <Space
              direction="vertical"
              size="large"
              style={{ marginBottom: 15 }}
            >
              <Paragraph
                copyable={{ text: `${chain}:${wallet}:${txHex}` }}
                className="copyableAddress"
              >
                <Text>{`${chain}:${wallet}:${txHex}`}</Text>
              </Paragraph>
            </Space>
          </>
        )}
      </Modal>
    </>
  );
}

export default ConfirmTxKey;
