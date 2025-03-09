import { useState, useEffect, useRef } from 'react';
import {
  Divider,
  InputNumber,
  Row,
  Col,
  Image,
  Button,
  Space,
  Spin,
  Modal,
  Input,
  message,
  Popover,
} from 'antd';
import {
  CaretDownOutlined,
  LoadingOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import Navbar from '../../components/Navbar/Navbar.tsx';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';

import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import SspConnect from '../../components/SspConnect/SspConnect.tsx';
import './Swap.css';
import { useAppSelector } from '../../hooks.ts';
import { pairDetailsSellAmount } from '../../lib/ABEController.ts';
import AssetBox from './AssetBox.tsx';
import { useNavigate } from 'react-router';
import localForage from 'localforage';
import { generatedWallets } from '../../types';
import AddressBox from './AddressBox.tsx';
import { NoticeType } from 'antd/es/message/interface';

function Swap() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const { t } = useTranslation(['send', 'common', 'home']);
  const [amountSell, setAmountSell] = useState(0.1);
  const [amountBuy, setAmountBuy] = useState(0);
  const [sellAsset, setSellAsset] = useState('eth_ETH_');
  const [buyAsset, setBuyAsset] = useState(
    'eth_USDT_0xdac17f958d2ee523a2206206994597c13d831ec7',
  );
  const [rate, setRate] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sellAssetModalOpen, setSellAssetModalOpen] = useState(false);
  const [buyAssetModalOpen, setBuyAssetModalOpen] = useState(false);
  const [receivingWalletModalOpen, setReceivingWalletModalOpen] =
    useState(false);
  const [sendingWalletModalOpen, setSendingWalletModalOpen] = useState(false);
  const [sellAssetFilter, setSellAssetFilter] = useState('');
  const [buyAssetFilter, setBuyAssetFilter] = useState('');
  const [sellAssetAddress, setSellAssetAddress] = useState('0-0');
  const [buyAssetAddress, setBuyAssetAddress] = useState('0-0');
  const { abeMapping, sellAssets, buyAssets } = useAppSelector(
    (state) => state.abe,
  );
  const [userAddresses, setUserAddresses] = useState<
    Record<keyof blockchains, generatedWallets>
  >({});
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const refresh = () => {
    console.log(
      'just a placeholder, navbar has refresh disabled but refresh is required to be passed',
    );
  };

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    fetchPairDetails();
  }, [amountSell, sellAsset, buyAsset]);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    void (async () => {
      const userAddrs: Record<keyof blockchains, generatedWallets> = {};
      for (const chain of Object.keys(blockchains)) {
        const generatedWallets: generatedWallets =
          (await localForage.getItem(`wallets-${chain}`)) ?? {};
        if (Object.keys(generatedWallets).length > 0) {
          // remove any change addresses. Only addresses that start with 0 are valid
          const adjAddresses = Object.fromEntries(
            Object.entries(generatedWallets).filter(([key]) =>
              key.startsWith('0-'),
            ),
          );
          userAddrs[chain] = adjAddresses;
        }
      }
      setUserAddresses(userAddrs);
    })();
  });

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
    // check if user sending asset is synchronised
    if (
      !userAddresses[sellAsset.split('_')[0]] ||
      !userAddresses[buyAsset.split('_')[0]]
    ) {
      displayMessage('error', t('home:swap.chain_sync_required'));
      return;
    }
    // create swap with abe, after success show a popup with information, tos, warn that its approximate balance, navigate to send section
    // if error, show error message
    // adjust send section that its swapping
    // swap history?
    // submit header with ssp wallet id prefixed with ssp-
  };

  const close = () => {
    navigate('/home');
  };

  const handleCancelSellAsset = () => {
    setSellAssetModalOpen(false);
  };

  const handleCancelBuyAsset = () => {
    setBuyAssetModalOpen(false);
  };

  const handleCancelReceivingWallet = () => {
    setReceivingWalletModalOpen(false);
  };

  const handleCancelSendingWallet = () => {
    setSendingWalletModalOpen(false);
  };

  return (
    <>
      {contextHolder}
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
              {t('home:swap.you_send')}
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
                onClick={() => setSellAssetModalOpen(true)}
              >
                <div className="swap-box-row-crypto-selection-button">
                  <Image
                    height={20}
                    width={20}
                    preview={false}
                    src={
                      blockchains[sellAsset.split('_')[0]].tokens?.find(
                        (token) => token.symbol === sellAsset.split('_')[1],
                      )?.logo ?? blockchains[sellAsset.split('_')[0]]?.logo
                    }
                  />
                  {blockchains[sellAsset.split('_')[0]].tokens?.find(
                    (token) => token.symbol === sellAsset.split('_')[1],
                  )?.symbol ?? blockchains[sellAsset.split('_')[0]]?.symbol}
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
              {t('common:from')}
            </Col>
            <Col span={18} onClick={() => setSendingWalletModalOpen(true)}>
              {userAddresses[sellAsset.split('_')[0]] ? (
                <Button
                  size="small"
                  type="text"
                  className="swap-box-row-sub-selection"
                  onClick={() => setSendingWalletModalOpen(true)}
                >
                  {t('common:wallet')}{' '}
                  {Number(sellAssetAddress.split('-')[1]) + 1}:{' '}
                  {userAddresses[sellAsset.split('_')[0]][
                    sellAssetAddress
                  ].substring(0, 8)}
                  ...
                  {userAddresses[sellAsset.split('_')[0]][
                    sellAssetAddress
                  ].substring(
                    userAddresses[sellAsset.split('_')[0]][sellAssetAddress]
                      .length - 6,
                  )}
                  <CaretDownOutlined />
                </Button>
              ) : (
                <Button
                  size="small"
                  type="text"
                  className="swap-box-row-sub-selection"
                  style={{ color: 'red' }}
                  disabled={true}
                >
                  {t('home:swap.chain_sync_required')}
                </Button>
              )}
            </Col>
          </Row>
        </div>
        <div className="swap-box margin-top-12">
          <Row gutter={[16, 16]} className="swap-box-row no-border-bottom">
            <Col span={24} className="swap-box-row-title">
              <Popover
                content={t('home:swap.estimated_amount')}
                title={t('home:swap.estimated_amount_title')}
                styles={{ body: { maxWidth: 300, marginLeft: 10 } }}
              >
                {t('home:swap.you_get')} ~ &nbsp;
                {loading ? (
                  <Spin indicator={<LoadingOutlined spin />} size="small" />
                ) : (
                  ''
                )}
              </Popover>
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
                onClick={() => setBuyAssetModalOpen(true)}
              >
                <div className="swap-box-row-crypto-selection-button">
                  <Image
                    height={20}
                    width={20}
                    preview={false}
                    src={
                      blockchains[buyAsset.split('_')[0]].tokens?.find(
                        (token) => token.symbol === buyAsset.split('_')[1],
                      )?.logo ?? blockchains[buyAsset.split('_')[0]]?.logo
                    }
                  />
                  {blockchains[buyAsset.split('_')[0]].tokens?.find(
                    (token) => token.symbol === buyAsset.split('_')[1],
                  )?.symbol ?? blockchains[buyAsset.split('_')[0]]?.symbol}
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
              {t('common:to')}
            </Col>
            <Col span={18}>
              {userAddresses[buyAsset.split('_')[0]] ? (
                <Button
                  size="small"
                  type="text"
                  className="swap-box-row-sub-selection"
                  onClick={() => setReceivingWalletModalOpen(true)}
                >
                  {t('common:wallet')}{' '}
                  {Number(buyAssetAddress.split('-')[1]) + 1}:{' '}
                  {userAddresses[buyAsset.split('_')[0]][
                    buyAssetAddress
                  ].substring(0, 8)}
                  ...
                  {userAddresses[buyAsset.split('_')[0]][
                    buyAssetAddress
                  ].substring(
                    userAddresses[buyAsset.split('_')[0]][buyAssetAddress]
                      .length - 6,
                  )}
                  <CaretDownOutlined />
                </Button>
              ) : (
                <Button
                  size="small"
                  type="text"
                  className="swap-box-row-sub-selection"
                  style={{ color: 'red' }}
                  disabled={true}
                >
                  {t('home:swap.chain_sync_required')}
                </Button>
              )}
            </Col>
          </Row>
        </div>
        <div className="rate-value">
          {rate > 0 && loading === false ? (
            <Popover
              content={t('home:swap.floating_rate_fluctuates')}
              title={t('home:swap.floating_rate_title')}
              styles={{ body: { maxWidth: 300, marginLeft: 10 } }}
            >
              1 {sellAsset.split('_')[1]} = {rate} {buyAsset.split('_')[1]}{' '}
              <QuestionCircleOutlined />
            </Popover>
          ) : (
            <span>&nbsp;</span>
          )}
          <span style={{ float: 'right' }}>
            <a
              href="https://github.com/RunOnFlux/ssp-wallet/blob/master/Terms_of_Service.md"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {t('home:swap.proceeding_agree_tos')}
            </a>
          </span>
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
      <Modal
        title={t('home:swap.select_sell_asset')}
        open={sellAssetModalOpen}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancelSellAsset}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <div>
            <Input
              id="searchSellAsset"
              variant="outlined"
              placeholder={t('home:swap.search_asset')}
              allowClear
              onChange={(e) => setSellAssetFilter(e.target.value)}
              size="large"
              style={{ marginBottom: '16px', width: '350px' }}
            />
            {buyAssets[buyAsset]
              .filter(
                (asset) =>
                  (
                    blockchains[asset.split('_')[0]].tokens?.find(
                      (token) => token.symbol === asset.split('_')[1],
                    )?.symbol ?? blockchains[asset.split('_')[0]]?.symbol
                  )
                    ?.toLowerCase()
                    ?.includes(sellAssetFilter.toLowerCase()) ||
                  (
                    blockchains[asset.split('_')[0]].tokens?.find(
                      (token) => token.symbol === asset.split('_')[1],
                    )?.name ?? blockchains[asset.split('_')[0]]?.name
                  )
                    ?.toLowerCase()
                    ?.includes(sellAssetFilter.toLowerCase()),
              )
              .map((asset) => (
                <div
                  onClick={() => {
                    setSellAsset(asset);
                    handleCancelSellAsset();
                  }}
                  key={asset}
                >
                  <AssetBox asset={asset} />
                </div>
              ))}
          </div>
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button
              type="link"
              block
              size="small"
              onClick={handleCancelSellAsset}
            >
              {t('common:close')}
            </Button>
          </Space>
        </Space>
      </Modal>
      <Modal
        title={t('home:swap.select_buy_asset')}
        open={buyAssetModalOpen}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancelBuyAsset}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <div>
            <Input
              id="searchBuyAsset"
              variant="outlined"
              placeholder={t('home:swap.search_asset')}
              allowClear
              onChange={(e) => setBuyAssetFilter(e.target.value)}
              size="large"
              style={{ marginBottom: '16px', width: '350px' }}
            />
            {sellAssets[sellAsset]
              .filter(
                (asset) =>
                  (
                    blockchains[asset.split('_')[0]].tokens?.find(
                      (token) => token.symbol === asset.split('_')[1],
                    )?.symbol ?? blockchains[asset.split('_')[0]]?.symbol
                  )
                    ?.toLowerCase()
                    ?.includes(buyAssetFilter.toLowerCase()) ||
                  (
                    blockchains[asset.split('_')[0]].tokens?.find(
                      (token) => token.symbol === asset.split('_')[1],
                    )?.name ?? blockchains[asset.split('_')[0]]?.name
                  )
                    ?.toLowerCase()
                    ?.includes(buyAssetFilter.toLowerCase()),
              )
              .map((asset) => (
                <div
                  onClick={() => {
                    setBuyAsset(asset);
                    handleCancelBuyAsset();
                  }}
                  key={asset}
                >
                  <AssetBox asset={asset} />
                </div>
              ))}
          </div>
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button
              type="link"
              block
              size="small"
              onClick={handleCancelBuyAsset}
            >
              {t('common:close')}
            </Button>
          </Space>
        </Space>
      </Modal>
      <Modal
        title={t('home:swap.select_sending_wallet')}
        open={sendingWalletModalOpen}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancelSendingWallet}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <div>
            {userAddresses[sellAsset.split('_')[0]] &&
              Object.keys(userAddresses[sellAsset.split('_')[0]]).map(
                (wallet) => (
                  <div
                    onClick={() => {
                      setSellAssetAddress(wallet);
                      handleCancelSendingWallet();
                    }}
                    key={userAddresses[sellAsset.split('_')[0]].wallet}
                  >
                    <AddressBox
                      asset={sellAsset}
                      wallet={wallet}
                      address={userAddresses[sellAsset.split('_')[0]][wallet]}
                    />
                  </div>
                ),
              )}
          </div>
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button
              type="link"
              block
              size="small"
              onClick={handleCancelSendingWallet}
            >
              {t('common:close')}
            </Button>
          </Space>
        </Space>
      </Modal>
      <Modal
        title={t('home:swap.select_receiving_wallet')}
        open={receivingWalletModalOpen}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancelReceivingWallet}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <div>
            {userAddresses[buyAsset.split('_')[0]] &&
              Object.keys(userAddresses[buyAsset.split('_')[0]]).map(
                (wallet) => (
                  <div
                    onClick={() => {
                      setBuyAssetAddress(wallet);
                      handleCancelReceivingWallet();
                    }}
                    key={userAddresses[buyAsset.split('_')[0]].wallet}
                  >
                    <AddressBox
                      asset={buyAsset}
                      wallet={wallet}
                      address={userAddresses[buyAsset.split('_')[0]][wallet]}
                    />
                  </div>
                ),
              )}
          </div>
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button
              type="link"
              block
              size="small"
              onClick={handleCancelReceivingWallet}
            >
              {t('common:close')}
            </Button>
          </Space>
        </Space>
      </Modal>
      <SspConnect />
      <PoweredByFlux />
    </>
  );
}

export default Swap;
