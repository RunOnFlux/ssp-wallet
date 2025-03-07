import { useState, useEffect } from 'react';
import {
  Divider,
  InputNumber,
  Row,
  Col,
  Image,
  Button,
  Space,
  Spin,
} from 'antd';
import { CaretDownOutlined, LoadingOutlined } from '@ant-design/icons';
import Navbar from '../../components/Navbar/Navbar.tsx';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';

import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import SspConnect from '../../components/SspConnect/SspConnect.tsx';
import './Swap.css';
import { useAppSelector } from '../../hooks.ts';
import { pairDetailsSellAmount } from '../../lib/ABEController.ts';

function Swap() {
  const { t } = useTranslation(['send', 'common', 'home']);
  const [amountSell, setAmountSell] = useState(0.1);
  const [amountBuy, setAmountBuy] = useState(0);
  const [sellAsset, setSellAsset] = useState('eth_ETH_');
  const [buyAsset, setBuyAsset] = useState(
    'eth_USDT_0xdac17f958d2ee523a2206206994597c13d831ec7',
  );
  const [rate, setRate] = useState(0);
  const [loading, setLoading] = useState(false);
  const { abeMapping, sellAssets, buyAssets } = useAppSelector(
    (state) => state.abe,
  );

  console.log(sellAssets);
  console.log(buyAssets);
  const refresh = () => {
    console.log(
      'just a placeholder, navbar has refresh disabled but refresh is required to be passed',
    );
    setAmountBuy(0);
    setAmountSell(0);
    setSellAsset('eth');
    setBuyAsset('USDT');
  };

  useEffect(() => {
    fetchPairDetails();
  }, [amountSell]);

  const fetchPairDetails = async () => {
    try {
      if (!amountSell) {
        setAmountBuy(0);
        setRate(0);
        setLoading(false);
        return;
      }
      setLoading(true);
      // ask abe for pairDetailsSellAmount
      const sellAssetZelcoreID = abeMapping[sellAsset];
      const buyAssetZelcoreID = abeMapping[buyAsset];
      const pairDetails = await pairDetailsSellAmount(
        sellAssetZelcoreID,
        buyAssetZelcoreID,
        amountSell,
      );
      if (pairDetails.status === 'success') {
        // find the exchange with the highest buyAmount
        const highestBuyAmount = pairDetails.data.exchanges.reduce(
          (max, current) =>
            parseFloat(current.buyAmount) > parseFloat(max.buyAmount)
              ? current
              : max,
        );
        if (
          highestBuyAmount &&
          highestBuyAmount.buyAmount &&
          highestBuyAmount.rate
        ) {
          // only update this if the response in sellAmount is the same as our amountSell
          if (highestBuyAmount.sellAmount === Number(amountSell).toFixed(8)) {
            // loading stop
            setAmountBuy(parseFloat(highestBuyAmount.buyAmount));
            setRate(parseFloat(highestBuyAmount.rate));
            setLoading(false);
          }
        } else {
          // todo error
          console.log('error');
          setAmountBuy(0);
          setRate(0);
          setLoading(false);
        }
      } else {
        console.log(pairDetails.data?.message || pairDetails.data);
        setAmountBuy(0);
        setRate(0);
        setLoading(false);
        // show som error todo
      }
      console.log(pairDetails);
    } catch (error) {
      console.log(error);
      setAmountBuy(0);
      setRate(0);
      setLoading(false);
      // show som error todo
    }
  };

  const onChangeAmountSell = (value: number | null) => {
    if (!value) {
      setLoading(false);
      setAmountBuy(0);
      setAmountSell(0);
      setRate(0);
      return;
    }
    setAmountSell(value);
  };

  const proceed = () => {
    console.log('proceed');
  };

  const close = () => {
    console.log('close');
  };

  return (
    <>
      <Navbar
        refresh={refresh}
        hasRefresh={false}
        allowChainSwitch={false}
        header={t('home:swap.header')}
      />
      <Divider />
      <div className="swap-area">
        <div className="swap-box">
          <Row gutter={[16, 16]} className="swap-box-row no-border-bottom">
            <Col span={24} className="swap-box-row-title">
              You Send
            </Col>
            <Col span={15} className="swap-box-row-input">
              <InputNumber
                className="swap-box-row-input-number"
                size="large"
                min={0}
                onChange={onChangeAmountSell}
                value={amountSell}
                variant="borderless"
                controls={false}
              />
            </Col>
            <Col span={9} className="swap-box-row-crypto-selection">
              <Button
                size="large"
                className="swap-box-row-crypto-selection-button-container"
              >
                <div className="swap-box-row-crypto-selection-button">
                  <Image
                    height={20}
                    width={20}
                    preview={false}
                    src={
                      blockchains[sellAsset.split('_')[1]]?.logo ??
                      blockchains[sellAsset.split('_')[0]].tokens.find(
                        (token) => token.symbol === sellAsset.split('_')[1],
                      )?.logo
                    }
                  />
                  {blockchains[sellAsset.split('_')[1]]?.symbol ??
                    blockchains[sellAsset.split('_')[0]].tokens.find(
                      (token) => token.symbol === sellAsset.split('_')[1],
                    )?.symbol}
                  <CaretDownOutlined />
                </div>
              </Button>
            </Col>
            <Col span={24} className="swap-box-row-chain-info">
              <div className="swap-box-row-chain-info-container">
                <Image
                  height={16}
                  preview={false}
                  src={blockchains[sellAsset.split('_')[0]].logo}
                />
                {blockchains[sellAsset.split('_')[0]].name}
              </div>
            </Col>
          </Row>
        </div>
        <div className="swap-bo">
          <Row gutter={[16, 16]} className="swap-box-row no-border-top sub-row">
            <Col span={6} className="swap-box-row-sub-title">
              From
            </Col>
            <Col span={18} className="swap-box-row-sub-selection">
              Wallet 1: bc1qqwe...asdf <CaretDownOutlined />
            </Col>
          </Row>
        </div>
        <div className="swap-box margin-top-12">
          <Row gutter={[16, 16]} className="swap-box-row no-border-bottom">
            <Col span={24} className="swap-box-row-title">
              You Get&nbsp;&nbsp;
              {loading ? (
                <Spin indicator={<LoadingOutlined spin />} size="small" />
              ) : (
                ''
              )}
            </Col>
            <Col span={15} className="swap-box-row-input">
              <InputNumber
                className="swap-box-row-input-number"
                size="large"
                min={0}
                value={amountBuy}
                readOnly
                controls={false}
                variant="borderless"
              />
            </Col>
            <Col span={9} className="swap-box-row-crypto-selection">
              <Button
                size="large"
                className="swap-box-row-crypto-selection-button-container"
              >
                <div className="swap-box-row-crypto-selection-button">
                  <Image
                    height={20}
                    width={20}
                    preview={false}
                    src={
                      blockchains[buyAsset.split('_')[1]]?.logo ??
                      blockchains[buyAsset.split('_')[0]].tokens.find(
                        (token) => token.symbol === buyAsset.split('_')[1],
                      )?.logo
                    }
                  />
                  {blockchains[buyAsset.split('_')[1]]?.symbol ??
                    blockchains[buyAsset.split('_')[0]].tokens.find(
                      (token) => token.symbol === buyAsset.split('_')[1],
                    )?.symbol}
                  <CaretDownOutlined />
                </div>
              </Button>
            </Col>
            <Col span={24} className="swap-box-row-chain-info">
              <div className="swap-box-row-chain-info-container">
                <Image
                  height={16}
                  preview={false}
                  src={blockchains[buyAsset.split('_')[0]].logo}
                />
                {blockchains[buyAsset.split('_')[0]].name}
              </div>
            </Col>
          </Row>
        </div>
        <div className="swap-box">
          <Row gutter={[16, 16]} className="swap-box-row no-border-top sub-row">
            <Col span={6} className="swap-box-row-sub-title">
              To
            </Col>
            <Col span={18} className="swap-box-row-sub-selection">
              Wallet 2: bc1qqwe...asdf <CaretDownOutlined />
            </Col>
          </Row>
        </div>
        <div className="rate-value">
          {rate > 0 ? (
            `1 ${sellAsset.split('_')[1]} = ${rate} ${buyAsset.split('_')[1]}`
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
      </div>
      <Space
        direction="vertical"
        size="middle"
        style={{ paddingBottom: '43px', marginTop: '12px' }}
      >
        <Button type="primary" size="large" onClick={proceed}>
          {t('common:continue')}
        </Button>
        <Button type="link" block size="small" onClick={close}>
          {t('common:close')}
        </Button>
      </Space>
      <SspConnect />
      <PoweredByFlux />
    </>
  );
}

export default Swap;
