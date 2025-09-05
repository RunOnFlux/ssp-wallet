import { QRCode, Typography, Button, Space, Modal, Alert, Divider } from 'antd';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { getDisplayName } from '../../storage/walletNames';

function Receive(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  
  // Check if there's a custom wallet name
  const customWalletName = useAppSelector(
    (state) => state.walletNames?.chains[activeChain]?.[walletInUse],
  );

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title={
          customWalletName
            ? t('home:receive.receive_wallet', { wallet: customWalletName })
            : t('home:receive.receive_chain_wallet', {
                chain: blockchainConfig.name,
                wallet: getDisplayName(activeChain, walletInUse),
              })
        }
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            {t('common:ok')}
          </Button>,
        ]}
        width={600}
      >
        {/* IMPORTANT WARNING */}
        <Alert
          message={t('home:receive.warning_chain_only', {
            chain_name: blockchainConfig.name,
            chain_symbol: blockchainConfig.symbol,
          })}
          type="warning"
          showIcon
          style={{ marginBottom: 20, textAlign: 'left' }}
        />

        <div style={{ textAlign: 'center' }}>
          <h3>{t('home:receive.wallet_address')}:</h3>
          <Space direction="vertical" size="large" style={{ marginBottom: 20 }}>
            <QRCode
              errorLevel="H"
              value={wallets[walletInUse].address}
              icon="/ssp-logo-black.svg"
              size={256}
              style={{ margin: '0 auto' }}
            />
            <Paragraph
              copyable={{ text: wallets[walletInUse].address }}
              className="copyableAddress"
              style={{ textAlign: 'center' }}
            >
              <Text strong>{wallets[walletInUse].address}</Text>
            </Paragraph>

            <Divider style={{ margin: '0' }} />

            {/* NETWORK INFO */}
            <div style={{ textAlign: 'left', width: '100%' }}>
              <Text type="secondary">
                {t('home:receive.address_info_block', {
                  chain_name: blockchainConfig.name,
                  chain_symbol: blockchainConfig.symbol,
                })}
              </Text>
            </div>
          </Space>
        </div>
      </Modal>
    </>
  );
}

export default Receive;
