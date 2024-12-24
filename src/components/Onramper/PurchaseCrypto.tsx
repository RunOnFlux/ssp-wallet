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

  const payloadToSign = `networkWallets=${props.cryptoNetwork}:${props.wInUse}&wallets=${props.cryptoAsset}:${props.wInUse}`; // this we need to sign
  // todo ask ssp-relay to provide signature for this payload, add &signature=${signature} to the url
  // display loading icon until the signature is provided, after that display the iframe

  return (
    <>
      <Modal
        title="&nbsp;"
        open={open}
        onOk={handleOk}
        onCancel={handleOk}
        style={{
          textAlign: 'center',
          top: 5,
          paddingBottom: '5px',
          margin: '0 auto',
          padding: '0 !important',
        }}
        footer={null}
        wrapClassName="onramper-modal"
        className="onramper-modal"
      >
        <iframe
          src={`https://buy.onramper.com?onlyCryptoNetworks=${props.cryptoNetwork}&mode=buy&defaultCrypto=${props.cryptoAsset}&apiKey=pk_prod_01JDMCZ0ZRZ14VBRW20B4HC04V&themeName=${darkModePreference.matches ? 'dark' : 'light'}&containerColor=${darkModePreference.matches ? '1f1f1f' : 'ffffff'}&borderRadius=0&wgBorderRadius=0&${payloadToSign}`}
          title="Onramper"
          height="540px"
          width="404px"
          allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
          sandbox="allow-scripts allow-same-origin allow-popups"
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
