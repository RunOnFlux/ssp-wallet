import { QRCode, Typography, Button, Space, Modal } from 'antd';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';

function Receive(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { open, openAction } = props;
  const { address } = useAppSelector((state) => state.flux);

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title="Receive to Flux Wallet 1"
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
        <h3>Wallet Address:</h3>
        <Space direction="vertical" size="large" style={{ marginBottom: 15 }}>
          <QRCode
            errorLevel="H"
            value={address}
            icon="/ssp-logo.svg"
            size={256}
            style={{ margin: '0 auto' }}
          />
          <Paragraph copyable={{ text: address }} className="copyableAddress">
            <Text>{address}</Text>
          </Paragraph>
        </Space>
      </Modal>
    </>
  );
}

export default Receive;
