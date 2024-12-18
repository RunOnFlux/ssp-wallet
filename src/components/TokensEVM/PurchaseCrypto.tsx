import { Modal } from 'antd';
import { useState, useEffect } from 'react';
import { cryptos } from '../../types';
import { useTranslation } from 'react-i18next';

function PurchaseCrypto(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  chain: keyof cryptos;
  wInUse: string;
  contracts: string[]; // contracts that are already imported
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;

  // const [fiat, setFiat] = useState('');
  const [crypto, setCrypto] = useState('');
  
  const handleOk = () => {
    openAction(false);
  };

  const handleCancel = () => {
    openAction(false);
  };

  useEffect(() => {
    console.log("Set properties");
    // setFiat(sspConfig().fiatCurrency);
    setCrypto(props.chain)
  }, []);

  return (
    <>
      <Modal
        title={t('home:tokens.purchase_crypto_with_fiat')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60}}
        onCancel={handleCancel}
        footer={[]}
        width={450}
      >        
      {
        <iframe        
          src={`https://buy.onramper.com?onlyCryptos=${crypto}&apiKey={''}`}
          title="Onramper"
          height="600px"
          width="380px"
          allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
        />
      }
      </Modal>
    </>
  );
}

export default PurchaseCrypto;
