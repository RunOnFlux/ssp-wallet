import { Alert, Spin, InputNumber, Card, Select, Button, Modal, Space, Input, Divider, Flex, Radio } from 'antd';
import { useState, useEffect } from 'react';
import { cryptos } from '../../types';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { sspConfig } from '@storage/ssp';
import { LoadingOutlined, CheckOutlined } from '@ant-design/icons';

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
  const [fiatActive, setFiatActive] = useState('');
  const [fiatActiveAmount, setFiatActiveAmount] = useState(0);
  const [cryptoActive, setCryptoActive] = useState('');
  const [cryptoTicker, setCryptoTicker] = useState('');
  const [cryptoRate, setCryptoRate] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState(0);
  const [feeNetwork, setFeeNetwork] = useState(0);
  const [feeTransaction, setFeeTransaction] = useState(0);
  const [isSpinning, setSpinning] = useState(false);
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState([]);
  const [optionsData, setOptionsData] = useState([]);
  const [assetProvider, setAssetProvider] = useState('');
  const [providers, setProviders] = useState([]);
  const [providerCryptoRate, setProviderCryptoRate] = useState('');
  const [providerCryptoTicker, setProviderCryptoTicker] = useState('');
  const [providerFiatAmount, setProviderFiatAmount] = useState(0);
  const [providerCryptoAmount, setProviderCryptoAmount] = useState(0);
  const [providerFiatTicker, setProviderFiatTicker] = useState('');
  const [titleProvider, setTitleProvider] = useState('');
  const [defaultProvider, setDefaultProvider] = useState('');
  const [bestRate, setBestRate] = useState(false);
  const [bestRateProvider, setBestRateProvider] = useState('');
  const [providerCrypto, setProviderCrypto] = useState('');
  const [error, setError] = useState(false);
  const [activeProvider, setActiveProvider] = useState(false);

  const { sspWalletExternalIdentity: wExternalIdentity} = useAppSelector((state) => state.sspState);
  
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

            if (e.code === sspConfig().fiatCurrency) {
              setFiatActive(`${e.code}`);
            }
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

            if (e.ticker.toLowerCase() === props.chain) {
              setCryptoActive(e.contract);
              setCryptoTicker(e.ticker);
            }
          });
    setCrypto(ret);
    setCryptoList(crypto);
  };

  const handleSelectedFiat: any = async (e: any) => {
    setCryptoAmount(0);
    setCryptoRate('');
    setCryptoTicker('');
    setSpinning(true);

    const filtered: any = await cryptoList.filter((i: any) => i.contract === cryptoActive && i.chain === props.chain);
    const selected: any = await getPurchaseDetailsOnSelectedAsset({
      sellAsset: e,
      buyAsset: filtered[0].idzelcore,
      sellAmount: fiatActiveAmount,
    });

    if (fiatActiveAmount == 0) {
      setFiatActiveAmount(0);
      setSpinning(false);
    } else {
      setOptionsData(selected.providers);
      const def: any = await selected.providers.reduce((prev: any, curr: any) => prev.rate < curr.rate ? prev : curr);
      const filteredFiat: any = await fiatList.filter((i: any) => i.code === e);
      setFiatActive(filteredFiat[0].idzelcore);
      setCryptoAmount(def.buyAmount);
      setCryptoRate(`1 ${filtered[0].ticker} = ${def.rate} ${selected.sellAsset}`)
      setFeeNetwork(def.networkFee);
      setFeeTransaction(def.transactionFee);
      setTitle(`network fee=${def.networkFee} ${selected.sellAsset}\ntransaction fee=${def.transactionFee} ${selected.sellAsset}`)
      setSpinning(false);
      setCryptoTicker(filtered[0].ticker);

      setBestRateProvider(def.providerId);
      setDefaultProvider(def.providerId);
    }
  }

  const handleSelectedFiatValue: any = async (e: any) => {
    setCryptoAmount(0);
    setCryptoRate('');
    setCryptoTicker('');
    setSpinning(true);

    const filtered: any = await cryptoList.filter((i: any) => i.contract === cryptoActive && i.chain === props.chain);
    const selected: any = await getPurchaseDetailsOnSelectedAsset({
      sellAsset: fiatActive,
      buyAsset: filtered[0].idzelcore,
      sellAmount: e,
    });

    if (e == 0) {
      setFiatActiveAmount(e);
      setSpinning(false);
    } else if (e === "") {
      setSpinning(false);
    } else {
      setOptionsData(selected.providers);
      const def: any = await selected.providers.reduce((prev: any, curr: any) => prev.rate < curr.rate ? prev : curr);
      setFiatActiveAmount(e);
      setCryptoAmount(def.buyAmount);
      setCryptoRate(`1 ${filtered[0].ticker} = ${def.rate} ${selected.sellAsset}`)
      setFeeNetwork(def.networkFee);
      setFeeTransaction(def.transactionFee);
      setTitle(`network fee=${def.networkFee} ${selected.sellAsset}\ntransaction fee=${def.transactionFee} ${selected.sellAsset}`)
      setSpinning(false);
      setCryptoTicker(filtered[0].ticker);

      setBestRateProvider(def.providerId);
      setDefaultProvider(def.providerId);
    }
  }

  const handleSelectedCrypto: any = async (e: any) => {
    setCryptoAmount(0);
    setCryptoRate('');
    setCryptoTicker('');
    setSpinning(true);

    const filtered: any = await cryptoList.filter((i: any) => i.contract === e && i.chain === props.chain);
    const selected: any = await getPurchaseDetailsOnSelectedAsset({
      sellAsset: fiatActive,
      buyAsset: filtered[0].idzelcore,
      sellAmount: fiatActiveAmount,
    });

    if (fiatActiveAmount == 0) {
      setFiatActiveAmount(0);
      setSpinning(false);
    } else {
      setOptionsData(selected.providers);
      const def: any = await selected.providers.reduce((prev: any, curr: any) => prev.rate < curr.rate ? prev : curr);
      const filteredFiat: any = await fiatList.filter((i: any) => i.code === fiatActive);
      setFiatActive(filteredFiat[0].idzelcore);
      setCryptoAmount(def.buyAmount);
      setCryptoRate(`1 ${filtered[0].ticker} = ${def.rate} ${selected.sellAsset}`)
      setFeeNetwork(def.networkFee);
      setFeeTransaction(def.transactionFee);
      setTitle(`network fee=${def.networkFee} ${selected.sellAsset}\ntransaction fee=${def.transactionFee} ${selected.sellAsset}`)
      setSpinning(false);
      setCryptoActive(filtered[0].contract);
      setCryptoTicker(filtered[0].ticker);

      setBestRateProvider(def.providerId);
      setDefaultProvider(def.providerId);
    }
  }

  const handleProceed: any = async () => {
    let data: any = [];
    let options: any = [];
    const providers: any = optionsData;
    const filtered: any = cryptoList.filter((i: any) => i.contract === cryptoActive && i.chain === props.chain);
    providers.forEach((i: any) => {
      data.push({
        providerId: i.providerId,
        rate: `1 ${cryptoTicker} = ${i.rate} ${fiatActive}`,
        sellAsset: fiatActive,
        buyAsset: filtered[0].idzelcore,
        ticker: cryptoTicker,
        networkFee: i.networkFee,
        transactionFee: i.transactionFee,
        fiatAmount: i.sellAmount,
        cryptoAmount: i.buyAmount
      });
      options.push({
        label: i.providerId.replace("id", ""),
        value: i.providerId
      })
    });
    setProviders(data);
    setOptions(options);
    setProviderCryptoRate(cryptoRate);
    setProviderFiatAmount(fiatActiveAmount);
    setProviderCryptoAmount(cryptoAmount);
    setProviderCryptoTicker(cryptoTicker);
    setProviderFiatTicker(fiatActive);
    setTitleProvider(title);
    setActiveProvider(true);
    setBestRate(true);
  }

  const handlePurchase: any = async () => {
    setError(false);
    const response: any = await createPurchaseDetails({
      providerId: assetProvider,
      sellAsset: providerFiatTicker,
      buyAsset: providerCrypto,
      sellAmount: providerFiatAmount,
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

  const handleProviderChange: any = async (e: any) => {
    setBestRate(false);
    const data: any = providers.filter((i: any) => i.providerId === e.target.value);
    setAssetProvider(data[0].providerId);
    setDefaultProvider(data[0].providerId);
    setProviderCryptoRate(data[0].rate);
    setProviderFiatAmount(data[0].fiatAmount);
    setProviderCrypto(data[0].buyAsset);
    setProviderCryptoAmount(data[0].cryptoAmount);
    setProviderCryptoTicker(data[0].ticker);
    setProviderFiatTicker(data[0].sellAsset);
    setTitleProvider(`network fee=${data[0].networkFee} ${data[0].sellAsset}\ntransaction fee=${data[0].transactionFee} ${data[0].sellAsset}`);
    if (bestRateProvider === data[0].providerId) {
      setBestRate(true);
    }
  }

  const handleBack: any = async () => {
    setActiveProvider(false);
    setCryptoAmount(0);
    setCryptoRate('');
    setFiatActiveAmount(0);
  }

  useEffect(() => {
    console.log("Set fiat info");
  }, [fiatActiveAmount, fiatActive, title]);

  useEffect(() => {
    console.log("Set crypto info");
  }, [cryptoActive, cryptoAmount, cryptoRate, feeNetwork, feeTransaction]);

  useEffect(() => {
    console.log("Set provider info");
  }, [assetProvider, options, optionsData, defaultProvider, providerCryptoRate, providerFiatAmount, providerCryptoAmount, providerCryptoTicker, providerFiatTicker, providerCrypto]);

  useEffect(() => {
    console.log("Set additional info");
  }, [bestRate, bestRateProvider, error, titleProvider, activeProvider]);

  useEffect(() => {
    console.log("Set info");
    handleFiat();
    handleCrypto();
    setFiatActiveAmount(0);
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
        <Divider />
        { !activeProvider ? 
          <>
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
            <Space direction="vertical">
              <Space direction="horizontal">
                { !isSpinning ? <InfoCircleOutlined title={title} /> : <Spin size="small" spinning={isSpinning} indicator={<LoadingOutlined spin />} /> }
                <InputNumber onChange={handleSelectedFiatValue} placeholder="Amount" style={{ width: 140 }} disabled={cryptoActive != "" ? false : true}/>
                <Select
                  placeholder="Fiat"
                  style={{ width: 170 }}
                  options={fiat}
                  onSelect={handleSelectedFiat}
                  value={fiatActive}
                />
              </Space>
              <Input addonBefore={"Crypto Amount"} addonAfter={cryptoTicker} variant="filled" value={cryptoAmount} style={{ width: 340 }} disabled/>
              <Input addonBefore={"Rate"} value={cryptoRate} variant="filled" style={{ width: 340, alignContent:'left' }} disabled/>
            </Space>
          </Card>
          <Divider />
          <Space direction="vertical">
            <Button type="primary" size="large" onClick={handleProceed} disabled={fiatActiveAmount <= 0 ? true : false}>
              {t('home:tokens.proceed_crypto_proceed')}
            </Button>
          </Space>
        </> : "" }
        { activeProvider ? 
        <>
          <Card title="Choose Provider">
            <Space direction="vertical">
              <Flex vertical gap="middle">
                <Radio.Group
                  block
                  value={defaultProvider}
                  options={options}
                  optionType="button"
                  buttonStyle="solid"
                  onChange={handleProviderChange}
                />
              </Flex>
              <Input addonBefore={"Fiat Amount"} addonAfter={providerFiatTicker} variant="filled" value={providerFiatAmount} style={{ width: 340 }} disabled/>
              <Input addonBefore={"Crypto Amount"} addonAfter={providerCryptoTicker} variant="filled" value={providerCryptoAmount} style={{ width: 340 }} disabled/>
              <Space direction="horizontal">
                <InfoCircleOutlined title={titleProvider} />
                <Input addonBefore={"Rate"} value={providerCryptoRate} variant="filled" style={{ width: 320, alignContent:'left' }} disabled/>
              </Space>
              <Space direction="horizontal">
                { bestRate ? <CheckOutlined /> : "" } { bestRate ? "Best Rate" : "" }
              </Space>
            </Space>      
          </Card>
          <Divider />
          <Space direction="vertical">
            <Button type="primary" size="large" onClick={handlePurchase} disabled={fiatActiveAmount <= 0 ? true : false}>
              {t('home:tokens.proceed_crypto_purchase')}
            </Button>
            <Button type="text" onClick={handleBack}>Back</Button>
            { error ? <Alert message="Please try again later." type="error" closable /> : "" }
          </Space>
        </> : "" }
      </Modal>
    </>
  );
}

export default PurchaseCrypto;
