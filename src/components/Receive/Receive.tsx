import { QRCode, Typography, Button, Space, Modal } from 'antd';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';

function Receive(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector((state) => state[activeChain]);
  const blockchainConfig = blockchains[activeChain];

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title={t('home:receive.receive_chain_wallet', {
          chain: blockchainConfig.name,
          wallet:
            (+walletInUse.split('-')[0] === 1 ? 'Change ' : 'Wallet ') +
            (+walletInUse.split('-')[1] + 1),
        })}
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
        <h3>{t('home:receive.wallet_address')}:</h3>
        <Space direction="vertical" size="large" style={{ marginBottom: 15 }}>
          <QRCode
            errorLevel="H"
            value={wallets[walletInUse].address}
            icon="/ssp-logo.svg"
            size={256}
            style={{ margin: '0 auto' }}
          />
          <Paragraph
            copyable={{ text: wallets[walletInUse].address }}
            className="copyableAddress"
          >
            <Text>{wallets[walletInUse].address}</Text>
          </Paragraph>
        </Space>
      </Modal>
    </>
  );
}

export default Receive;
