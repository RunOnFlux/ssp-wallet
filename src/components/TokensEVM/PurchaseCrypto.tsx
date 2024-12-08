import { Alert, Steps, Spin, InputNumber, Card, Select, Button, Modal, Space, Input, Divider } from 'antd';
import { useState, useEffect } from 'react';
import { cryptos } from '../../types';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';

import {
  InfoCircleOutlined
} from '@ant-design/icons';

import { getFiatAssets, getCryptoAssets, getPurchaseDetailsOnSelectedAsset, createPurchaseDetails } from '../../lib/assets';

function PurchaseCrypto(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  chain: keyof cryptos;
  wInUse: string;
  contracts: string[]; // contracts that are already imported
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;

  const [fiat, setFiat] = useState([]);
  const [crypto, setCrypto] = useState([]);

  const [fiatList, setFiatList] = useState([]);
  const [cryptoList, setCryptoList] = useState([]);

  const [fiatMinAmount, setFiatMinAmount] = useState(0);
  const [fiatMaxAmount, setFiatMaxAmount] = useState(0);
  const [fiatActive, setFiatActive] = useState('');
  const [fiatActiveAmount, setFiatActiveAmount] = useState(0);
  const [fiatPrecision, setFiatMinPrecision] = useState(2);
  const [cryptoActive, setCryptoActive] = useState('');
  const [cryptoTicker, setCryptoTicker] = useState('');
  const [cryptoRate, setCryptoRate] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState(0);
  const [feeNetwork, setFeeNetwork] = useState(0);
  const [feeTransaction, setFeeTransaction] = useState(0);
  const [isSpinning, setSpinning] = useState(false);
  const [assetProvider, setAssetProvider] = useState('');
  const [title, setTitle] = useState('');
  const [providerList, setProviderList] = useState([]);
  const [error, setError] = useState(false);

  const { sspWalletExternalIdentity: wExternalIdentity} = useAppSelector((state) => state.sspState);

  const items: any = [
    { title: 'Crypto' },
    { title: 'Fiat' },
    { title: 'Provider' },
  ];
  
  const handleOk = () => {
    openAction(false);
  };

  const handleCancel = () => {
    openAction(false);
  };

  const handleFiat: any = async () => {
    setFiat([]);
    const fiat: any = await getFiatAssets();
    const ret: any = [];
    await fiat.forEach((e: any) => {
            ret.push({
              value: e.code,
              label: `${e.code} - ${e.name}`
            });
          });
    setFiat(ret);
    setFiatList(fiat);
  };

  const handleCrypto: any = async () => {
    setCrypto([]);
    const crypto: any = await getCryptoAssets();
    const ret: any = [];
    await crypto.filter((i: any) => i.chain === props.chain).forEach((e: any) => {
            ret.push({
              value: e.contract,
              label: `${e.ticker} - ${e.name}`
            });
          });
    setCrypto(ret);
    setCryptoList(crypto);
  };

  const handleSelectedFiat: any = async (e: any) => {
    setError(false);
    const filteredFiat: any = await fiatList.filter((i: any) => i.code === e);
    setFiatActive(filteredFiat[0].idzelcore);

    const filtered: any = await cryptoList.filter((i: any) => i.contract === cryptoActive && i.chain === props.chain);

    const selected: any = await getPurchaseDetailsOnSelectedAsset({
      sellAsset: e,
      buyAsset: filtered[0].idzelcore,
      sellAmount: fiatActiveAmount,
    });

    let providers: any = [];
    
    selected.providers.forEach ((i: any) => {
      if (i.providerId == 'idmoonpay') {
        providers.push({value: 'moonpay', label: 'Moonpay'});
      } 
      
      if (i.providerId == 'idtopper') {
        providers.push({value: 'topper', label: 'Topper'});
      } 
      
      if (i.providerId == 'idguardarian') {
        providers.push({value: 'guardarian', label: 'Guardarian'});
      }
    });
    
    setProviderList(providers);
    setCryptoAmount(0);
    setAssetProvider('');
    setCryptoRate('');
    setFeeNetwork(0);
    setFeeTransaction(0);
  }

  const handleSelectedFiatValue: any = async (e: any) => {
    setError(false);
    setFiatActiveAmount(e);
    setCryptoAmount(0);
    setAssetProvider('');
    setCryptoRate('');
    setFeeNetwork(0);
    setFeeTransaction(0);
  }

  const handleSelectedCrypto: any = async (e: any) => {
    setError(false);
    handleResetValues();
    const filtered: any = await cryptoList.filter((i: any) => i.contract === e && i.chain === props.chain);
    setCryptoActive(filtered[0].contract);
    setCryptoTicker(filtered[0].ticker);
  }

  const handleProviderProcessing: any = async (e: any) => {
    setError(false);
    setAssetProvider(e);
    handleProviderValues(e);
  }

  const handleProviderValues: any = async (e: any) => {
    setSpinning(true);
    const filtered: any = await cryptoList.filter((i: any) => i.contract === cryptoActive && i.chain === props.chain);

    const selected: any = await getPurchaseDetailsOnSelectedAsset({
      sellAsset: fiatActive,
      buyAsset: filtered[0].idzelcore,
      sellAmount: fiatActiveAmount,
    });

    selected.providers.forEach ((i: any) => {
      if (i.providerId == 'idmoonpay' && e === 'moonpay') {
        const min: any = !i.minSellAmount ? 0 : i.minSellAmount;
        const max: any = !i.maxSellAmount ? 0 : i.maxSellAmount;
        setFiatMinAmount(min);
        setFiatMaxAmount(max);
        setFiatMinPrecision(i.precision);
        setTitle(`min=${min} max=${max}`);
      } 
      
      if (i.providerId == 'idtopper' && e === 'topper') {
        const min: any = !i.minSellAmount ? 0 : i.minSellAmount;
        const max: any = !i.maxSellAmount ? 0 : i.maxSellAmount;
        setFiatMinAmount(min);
        setFiatMaxAmount(max);
        setFiatMinPrecision(i.precision);
        setTitle(`min=${min} max=${max}`);
      } 
      
      if (i.providerId == 'idguardarian' && e === 'guardarian') {
        const min: any = !i.minSellAmount ? 0 : i.minSellAmount;
        const max: any = !i.maxSellAmount ? 0 : i.maxSellAmount;
        setFiatMinAmount(min);
        setFiatMaxAmount(max);
        setFiatMinPrecision(i.precision);
        setTitle(`min=${min} max=${max}`);
      }
    });

    setSpinning(false);
    setCryptoActive(filtered[0].contract);
    setCryptoAmount(selected.providers[0].buyAmount);
    setCryptoRate(`1 ${filtered[0].ticker} = ${selected.providers[0].rate} ${selected.sellAsset}`)
    setFeeNetwork(selected.providers[0].networkFee);
    setFeeTransaction(selected.providers[0].transactionFee);
  }

  const handlePurchase: any = async () => {
    const activeChain: any = cryptoList.filter((i: any) => i.chain === props.chain );
    const active: any = activeChain.filter((i: any) => i.contract === cryptoActive );
    const ticker: string = active[0].idzelcore

    const response: any = await createPurchaseDetails({
      providerId: `id${assetProvider}`,
      sellAsset: fiatActive,
      buyAsset: ticker,
      sellAmount: fiatActiveAmount,
      buyAddress: props.wInUse
    }, wExternalIdentity);

    if (response.widget === null || response.widget === undefined) {
      console.log("Purchase not available at the moment");
      setError(true);
    } else {
      window.open(response.widget, "_blank");
      openAction(false);
    }
  }

  const handleClear: any = async () => {
    setAssetProvider('');
    handleResetValues();
  }

  const handleResetValues: any = async () => {
    setError(false);
    setFiatActive('');
    setFiatActiveAmount(0);
    setFiatMinAmount(0);
    setFiatMaxAmount(0);
    setCryptoActive('');
    setCryptoAmount(0);
    setCryptoRate('');
    setFeeNetwork(0);
    setFeeTransaction(0);
    setTitle('');
    setProviderList([]);
    setAssetProvider('');
  }

  useEffect(() => {
    console.log("Set fiat info");
  }, [fiatMinAmount, fiatMaxAmount, fiatPrecision, fiatActiveAmount, fiatActive, title]);

  useEffect(() => {
    console.log("Set crypto info");
  }, [cryptoActive, cryptoAmount, cryptoRate, feeNetwork, feeTransaction, providerList]);

  useEffect(() => {
    console.log("Set info");
    handleFiat();
    handleCrypto();
  }, []);

  useEffect(() => {
    console.log("Loading");
  }, [isSpinning]);

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
        <Steps
          direction="horizontal"
          current={ cryptoActive != "" ? fiatActive != "" && fiatActiveAmount != 0 ? assetProvider != "" ? 3 : 2 : 1 : 0 }
          items={items}
          size="small"
        />
        <Divider />
        <Card title="Crypto">
          <Space direction="horizontal">
            <Select
              placeholder="Crypto"
              style={{ width: 340  }}
              options={crypto}
              onSelect={handleSelectedCrypto}
              value={cryptoActive}
            />
          </Space>
        </Card>
        <Divider />
        <Card title="Fiat">
          <Space direction="horizontal">
          <InputNumber onChange={handleSelectedFiatValue} placeholder="Amount" value={fiatActiveAmount} precision={fiatPrecision} style={{ width: 140 }} disabled={cryptoActive != "" ? false : true}/>
            <Select
              placeholder="Fiat"
              style={{ width: 190 }}
              options={fiat}
              onSelect={handleSelectedFiat}
              disabled={fiatActiveAmount > 0 ? false : true}
              value={fiatActive}
            />
          </Space>
        </Card>
        <Divider />
        <Card title="Provider">
          <Space direction="vertical">
            <Space direction="horizontal">
              <Select
                placeholder="Provider"
                style={{ width: 320 }}
                options={providerList}
                onSelect={handleProviderProcessing}
                disabled={fiatActive != '' ? false : true}
                value={assetProvider}
              />
              <InfoCircleOutlined title={title} />
            </Space>
            <Input addonBefore={"Crypto Amount"} addonAfter={cryptoTicker} variant="filled" value={cryptoAmount} style={{ width: 340 }} disabled/>
            <Input addonBefore={"Rate"} value={cryptoRate} variant="filled" style={{ width: 340, alignContent:'left' }} disabled/>
            <Input addonBefore={"Network Fee"} addonAfter={fiatActive} value={feeNetwork} variant="filled" style={{ width: 340, alignContent:'left' }} disabled/> 
            <Input addonBefore={"Transaction Fee"} addonAfter={fiatActive} value={feeTransaction} variant="filled" style={{ width: 340, alignContent:'left' }} disabled/> 
          </Space>
        </Card>
        <Divider />
        <Space direction="vertical">
          <Button type="primary" size="large" onClick={handlePurchase} disabled={assetProvider != '' && (fiatMinAmount == 0 || (fiatActiveAmount >= fiatMinAmount && fiatActiveAmount <= fiatMaxAmount)) ? false : true }>
            {t('home:tokens.proceed_crypto_purchase')}
          </Button>
          <Button type="link" block onClick={handleClear}>
            Clear
          </Button>
        </Space>
        <Spin size="small" spinning={isSpinning}/>
        { !error ? '' : <Alert message="Provider not available at the moment" type="error" /> }
      </Modal>
    </>
  );
}

export default PurchaseCrypto;
