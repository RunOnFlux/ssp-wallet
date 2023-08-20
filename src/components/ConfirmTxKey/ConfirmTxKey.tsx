import { QRCode, Typography, Button, Space, Modal } from 'antd';
const { Paragraph, Text } = Typography;

function ConfirmTxKey(props: {
  open: boolean;
  txHex: string;
  openAction: (status: boolean) => void;
}) {
  const { open, openAction, txHex } = props;

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title="Confirm Transaction on SSP Key"
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            OK
          </Button>,
        ]}
      >
        {txHex.length < 3000 && (
          <>
            <p>
              To confirm the transaction on your SSP Key, open your SSP Key on
              your mobile phone and confirm the action. You can tap to refresh
              or scan the following QR code.
            </p>
            <Space
              direction="vertical"
              size="large"
              style={{ marginBottom: 15 }}
            >
              <QRCode
                errorLevel="H"
                value={txHex}
                icon="/ssp-logo.svg"
                size={256}
                style={{ margin: '0 auto' }}
              />
              <Paragraph copyable={{ text: txHex }} className="copyableAddress">
                <Text>{txHex}</Text>
              </Paragraph>
            </Space>
          </>
        )}
        {txHex.length >= 3000 && (
          <>
            <p>
              To confirm the transaction on your SSP Key, open your SSP Key on
              your mobile phone and confirm the action. You can tap to refresh
              or use a manual input.
            </p>
            <Space
              direction="vertical"
              size="large"
              style={{ marginBottom: 15 }}
            >
              <Paragraph copyable={{ text: txHex }} className="copyableAddress">
                <Text>{txHex}</Text>
              </Paragraph>
            </Space>
          </>
        )}
      </Modal>
    </>
  );
}

export default ConfirmTxKey;
