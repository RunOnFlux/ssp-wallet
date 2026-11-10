import { QRCode, Typography, Button, Space, Modal } from 'antd';
import { useSspLogo } from '../../hooks/useSspLogo';
import { explorerTxUrl } from '../../lib/explorerUrl';
import { backends } from '@storage/backends';
import { useAppSelector } from '../../hooks';
const { Paragraph, Text } = Typography;
import { useTranslation } from 'react-i18next';

function TxSent(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  txid: string;
  chain: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const sspLogo = useSspLogo();
  const { open, openAction } = props;
  const { activeChain } = useAppSelector((state) => state.sspState);
  // The chain reported with the txid can be empty or unknown to this wallet
  // build (e.g. a newer SSP Key). Fall back to the active chain rather than
  // throwing on the explorer lookup.
  const chain =
    props.chain && backends()[props.chain] ? props.chain : activeChain;

  const handleOk = () => {
    openAction(false);
  };

  const openInExplorer = () => {
    window.open(explorerTxUrl(chain, props.txid), '_blank');
  };
  return (
    <>
      <Modal
        title={t('home:txSent.tx_sent')}
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
          <QRCode
            errorLevel="H"
            value={props.txid}
            icon={sspLogo}
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
            {t('home:txSent.show_in_explorer')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default TxSent;
