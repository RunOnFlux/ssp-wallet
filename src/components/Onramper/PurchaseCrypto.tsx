import { Modal } from 'antd';

import './PurchaseCrypto.css';

function PurchaseCrypto(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  cryptoNetwork: string | undefined;
  cryptoAsset: string;
  wInUse: string;
}) {
  const { open, openAction } = props;
  const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title="&nbsp;"
        open={open}
        onOk={handleOk}
        onCancel={handleOk}
        style={{
          textAlign: 'center',
          top: 60,
          margin: '0 auto',
          padding: '0 !important',
        }}
        footer={[]}
        wrapClassName="onramper-modal-test"
        className="onramper-modal-test"
      >
        <iframe
          src={`https://buy.onramper.com?onlyCryptoNetworks=${props.cryptoNetwork}&mode=buy&defaultCrypto=${props.cryptoAsset}&networkWallets=${props.cryptoNetwork?.toUpperCase()}:${props.wInUse}&wallets=${props.cryptoAsset}:${props.wInUse}&apiKey=pk_prod_01JDMCZ0ZRZ14VBRW20B4HC04V&themeName=${darkModePreference.matches ? 'dark' : 'light'}&containerColor=${darkModePreference.matches ? '1f1f1f' : 'ffffff'}&borderRadius=0&wgBorderRadius=0`}
          title="Onramper"
          height="600px"
          width="400px"
          allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
          sandbox="allow-scripts allow-same-origin"
          style={{
            border: 'none',
            margin: '-6px',
            borderRadius: '5px',
          }}
        />
      </Modal>
    </>
  );
}

export default PurchaseCrypto;
