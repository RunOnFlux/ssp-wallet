import { QRCode, Typography, Button, Space, Modal } from 'antd';
const { Paragraph, Text } = Typography;

function TxSent(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  txid: string;
}) {
  const { open, openAction } = props;

  const handleOk = () => {
    openAction(false);
  };

  const openInExplorer = () => {
    window.open(`https://explorer.runonflux.io/tx/${props.txid}`, '_blank');
  };
  return (
    <>
      <Modal
        title="Transaction Sent!"
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center' }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            OK
          </Button>,
        ]}
      >
        <Space direction="vertical" size="large" style={{ marginBottom: 15 }}>
          <QRCode
            errorLevel="H"
            value={props.txid}
            icon="/ssp-logo.svg"
            size={256}
            style={{ margin: '0 auto' }}
          />
          <Paragraph
            copyable={{ text: props.txid }}
            className="copyableAddress"
          >
            <Text>{props.txid}</Text>
          </Paragraph>
          <Button type="primary" size="middle" onClick={openInExplorer}>
            Show in Explorer
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default TxSent;
