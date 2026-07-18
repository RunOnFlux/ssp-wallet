import { QRCode, Typography, Button, Modal, Alert, Divider } from 'antd';
import { useSspLogo } from '../../hooks/useSspLogo';
import './Receive.css';
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
  const sspLogo = useSspLogo();
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
        title={t('home:receive.receive_wallet', {
          wallet: customWalletName || getDisplayName(activeChain, walletInUse),
        })}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center' }}
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
          style={{ marginBottom: 16, textAlign: 'left' }}
        />

        <div className="receive-body">
          <span className="receive-label">
            {t('home:receive.wallet_address')}
          </span>
          <div className="receive-qr">
            <QRCode
              errorLevel="H"
              value={wallets[walletInUse].address}
              icon={sspLogo}
              size={232}
            />
          </div>
          <Paragraph
            copyable={{ text: wallets[walletInUse].address }}
            className="copyableAddress receive-address"
          >
            <Text strong className="receive-address-text">
              {wallets[walletInUse].address}
            </Text>
          </Paragraph>

          <Divider style={{ margin: '4px 0' }} />

          {/* NETWORK INFO */}
          <div className="receive-info">
            <Text type="secondary">
              {t('home:receive.address_info_block', {
                chain_name: blockchainConfig.name,
                chain_symbol: blockchainConfig.symbol,
              })}
            </Text>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default Receive;
