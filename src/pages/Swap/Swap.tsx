import { useState } from 'react';
import { Divider, InputNumber, Row, Col, Image, Button } from 'antd';
import { CaretDownOutlined } from '@ant-design/icons';
import Navbar from '../../components/Navbar/Navbar.tsx';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';

import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import SspConnect from '../../components/SspConnect/SspConnect.tsx';
import './Swap.css';

function Swap() {
  const { t } = useTranslation(['send', 'common', 'home']);
  const [amountSell, setAmountSell] = useState(0.1);
  const [amountBuy, setAmountBuy] = useState(0);
  const [sellAsset, setSellAsset] = useState('eth');
  const [buyAsset, setBuyAsset] = useState('USDT');
  const [sellAssetChain, setSellAssetChain] = useState('eth');
  const [buyAssetChain, setBuyAssetChain] = useState('eth');

  const refresh = () => {
    console.log(
      'just a placeholder, navbar has refresh disabled but refresh is required to be passed',
    );
    setAmountBuy(0);
    setAmountSell(0);
    setSellAsset('eth');
    setBuyAsset('USDT');
    setSellAssetChain('eth');
    setBuyAssetChain('eth');
  };

  const onChangeAmountSell = (value: number | null) => {
    if (!value) {
      setAmountBuy(0);
      setAmountSell(0);
      return;
    }
    setAmountBuy(value * 0.9);
    setAmountSell(value);
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
      <div className="swap-box">
        <Row gutter={[16, 16]} className="swap-box-row">
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
                    blockchains[sellAsset]?.logo ??
                    blockchains[sellAssetChain].tokens.find(
                      (token) => token.symbol === sellAsset,
                    )?.logo
                  }
                />
                {blockchains[sellAsset]?.symbol ??
                  blockchains[sellAssetChain].tokens.find(
                    (token) => token.symbol === sellAsset,
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
                src={blockchains[sellAssetChain].logo}
              />
              {blockchains[sellAssetChain].name}
            </div>
          </Col>
        </Row>
      </div>
      <div className="swap-box">
        <Row gutter={[16, 16]} className="swap-box-row">
          <Col span={24} className="swap-box-row-title">
            You Get
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
                    blockchains[buyAsset]?.logo ??
                    blockchains[buyAssetChain].tokens.find(
                      (token) => token.symbol === buyAsset,
                    )?.logo
                  }
                />
                {blockchains[buyAsset]?.symbol ??
                  blockchains[buyAssetChain].tokens.find(
                    (token) => token.symbol === buyAsset,
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
                src={blockchains[buyAssetChain].logo}
              />
              {blockchains[buyAssetChain].name}
            </div>
          </Col>
        </Row>
      </div>
      address selection sell
      address selection buy
      min/max ?
      show fiat value?
      1btc = 42 eth
      provider selection automatic with dropdown
      continue button
      <SspConnect />
      <PoweredByFlux />
    </>
  );
}

export default Swap;
