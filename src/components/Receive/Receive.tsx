import { useLayoutEffect, useRef, useState } from 'react';
import { QRCode, Typography, Button, Modal, Alert, Divider } from 'antd';
import { useSspLogo } from '../../hooks/useSspLogo';
import './Receive.css';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { getDisplayName } from '../../storage/walletNames';

const QR_MAX_SIZE = 232;
const QR_MIN_SIZE = 160;
const QR_FRAME_CHROME = 26; // .receive-qr padding (2 × 12) + border (2 × 1)

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
  const address = wallets[walletInUse].address;
  const qrFrameRef = useRef<HTMLDivElement>(null);
  const [qrSize, setQrSize] = useState(QR_MAX_SIZE);

  // The modal body is a dialog's only scroll region and its scrollbar is hidden
  // app-wide (index.css), so any content past the capped height is cut with no
  // cue at all: a two-line bech32 address pushed the last clause of the
  // network disclaimer ("...please use bridge services.") out of view. Shrink
  // the QR — the one elastic element here — to whatever height is left, so the
  // loss-of-funds warning is always readable in full on every chain.
  useLayoutEffect(() => {
    if (!open) return;
    const frame = qrFrameRef.current;
    const scroller = frame?.closest('.ant-modal-body');
    if (!frame || !(scroller instanceof HTMLElement)) return;
    const withoutQr = scroller.scrollHeight - frame.offsetHeight;
    const available = scroller.clientHeight - withoutQr - QR_FRAME_CHROME;
    setQrSize(
      Math.max(QR_MIN_SIZE, Math.min(QR_MAX_SIZE, Math.floor(available))),
    );
  }, [open, address, t]);

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
          <div className="receive-qr" ref={qrFrameRef}>
            <QRCode
              errorLevel="H"
              value={address}
              icon={sspLogo}
              size={qrSize}
            />
          </div>
          <Paragraph
            copyable={{ text: address }}
            className="copyableAddress receive-address"
          >
            <Text strong className="receive-address-text">
              {address}
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
