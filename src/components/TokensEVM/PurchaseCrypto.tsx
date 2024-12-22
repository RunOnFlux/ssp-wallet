import { Divider, Button, Modal } from 'antd';
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

  const [crypto, setCrypto] = useState('');
  // const [fiat, setFiat] = useState('');
  // const [onRamper, setOnRamper] = useState('');
  
  const handleOk = () => {
    openAction(false);
  };

  const handleCancel = () => {
    openAction(false);
  };

  useEffect(() => {
    console.log("Set properties");
    setCrypto(props.chain);
    // setFiat(sspConfig().fiatCurrency);
    // setOnRamper('');
  }, []);

  return (
    <>
      <Modal
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60}}
        footer={[]}
        width={450}
        closable={false}
      >        
        {
          <iframe        
            src={`https://buy.onramper.com?onlyCryptos=${crypto}&apiKey=''`}
            title="Onramper"
            height="600px"
            width="380px"
            allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
          />
        }
        <Divider />
        <Button type="primary" size="middle" onClick={handleCancel}>
          {t('home:tokens.purchase_crypto_close')}
        </Button>
      </Modal>
    </>
  );
}

export default PurchaseCrypto;
