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
import { CaretDownOutlined, LoadingOutlined } from '@ant-design/icons';
import Navbar from '../../components/Navbar/Navbar.tsx';
import { useTranslation } from 'react-i18next';
import { blockchains, Token } from '@storage/blockchains';
import secureLocalStorage from 'react-secure-storage';

import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import SspConnect from '../../components/SspConnect/SspConnect.tsx';
import './Swap.css';
import { useAppSelector, useAppDispatch } from '../../hooks.ts';
import { pairDetailsSellAmount, createSwap } from '../../lib/ABEController.ts';
import AssetBox from './AssetBox.tsx';
import { useNavigate } from 'react-router';
import localForage from 'localforage';
import {
  createSwapData,
  cryptos,
  generatedWallets,
  node,
  swapResponseData,
  tokenBalanceEVM,
  transaction,
} from '../../types';
import AddressBox from './AddressBox.tsx';
import { NoticeType } from 'antd/es/message/interface';
import BigNumber from 'bignumber.js';
import {
  setAddress,
  setRedeemScript,
  setWitnessScript,
  setTransactions,
  setNodes,
  setBalance,
  setUnconfirmedBalance,
  setBlockheight,
  setWalletInUse,
  setChainInitialState,
  setXpubWallet,
  setXpubKey,
  setActiveChain,
  setTokenBalances,
  setActivatedTokens,
  setImportedTokens,
} from '../../store';
import { generateMultisigAddress, getScriptType } from '../../lib/wallet.ts';
import { getFingerprint } from '../../lib/fingerprint.ts';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';

interface selectedExchangeType {
  exchangeId?: string;
  minSellAmount?: string;
  maxSellAmount?: string;
  rateId?: string | null;
  rate?: string;
  precision?: string;
  sellAmount?: string;
  buyAmount?: string;
}

interface navigationObject {
  receiver: string;
  amount: string;
  swap: swapResponseData;
  contract?: string;
}

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

const balancesObject = {
  confirmed: '0.00',
  unconfirmed: '0.00',
};

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
  const [loadingSwap, setLoadingSwap] = useState(false);
  const { abeMapping, sellAssets, buyAssets } = useAppSelector(
    (state) => state.abe,
  );
  const [selectedExchange, setSelectedExchange] = useState<
    selectedExchangeType | swapResponseData
  >({});
  const [userAddresses, setUserAddresses] = useState<
    Record<keyof blockchains, generatedWallets>
  >({});
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const { sspWalletExternalIdentity: sspwid } = useAppSelector(
    // associate tx history with ssp wallet id
    (state) => state.sspState,
  );
  const { identityChain } = useAppSelector((state) => state.sspState);
  const [chainToSwitch, setChainToSwitch] = useState<keyof cryptos | ''>('');
  const { xpubWallet, xpubKey } = useAppSelector(
    (state) => state[(chainToSwitch as keyof cryptos) || identityChain],
  );
  const dispatch = useAppDispatch();
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);

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

  // chain switching mechanism. todo cleanup This extract and from chainSelect extract too
  useEffect(() => {
    console.log('chain switch effect');
    if (!chainToSwitch) return;
    void (async function () {
      try {
        if (xpubWallet && xpubKey) {
          // we have it all, generate address and load txs, balances, settings etc.
          // restore stored wallets
          const generatedWallets: generatedWallets =
            (await localForage.getItem(`wallets-${chainToSwitch}`)) ?? {};
          const walletDerivations = Object.keys(generatedWallets);
          walletDerivations.forEach((derivation: string) => {
            setAddress(chainToSwitch, derivation, generatedWallets[derivation]);
          });
          const walInUse = sellAssetAddress;
          // save new walletInUse
          await localForage.setItem(`walletInUse-${chainToSwitch}`, walInUse);
          setWalletInUse(chainToSwitch, walInUse);
          // load txs, balances, settings etc.
          const txsWallet: transaction[] =
            (await localForage.getItem(
              `transactions-${chainToSwitch}-${walInUse}`,
            )) ?? [];
          const blockheightChain: number =
            (await localForage.getItem(`blockheight-${chainToSwitch}`)) ?? 0;
          const balancesWallet: balancesObj =
            (await localForage.getItem(
              `balances-${chainToSwitch}-${walInUse}`,
            )) ?? balancesObject;
          const tokenBalances: tokenBalanceEVM[] =
            (await localForage.getItem(
              `token-balances-${chainToSwitch}-${walInUse}`,
            )) ?? [];
          const activatedTokens: string[] =
            (await localForage.getItem(
              `activated-tokens-${chainToSwitch}-${walInUse}`,
            )) ?? [];
          const nodesWallet: node[] =
            (await localForage.getItem(`nodes-${chainToSwitch}-${walInUse}`)) ??
            [];
          const importedTokens: Token[] =
            (await localForage.getItem(`imported-tokens-${chainToSwitch}`)) ??
            [];
          if (importedTokens) {
            setImportedTokens(chainToSwitch, importedTokens || []);
          }
          if (activatedTokens) {
            setActivatedTokens(chainToSwitch, walInUse, activatedTokens || []);
          }
          if (tokenBalances) {
            setTokenBalances(chainToSwitch, walInUse, tokenBalances || []);
          }
          if (nodesWallet) {
            setNodes(chainToSwitch, walInUse, nodesWallet || []);
          }
          if (txsWallet) {
            setTransactions(chainToSwitch, walInUse, txsWallet || []);
          }
          if (balancesWallet) {
            setBalance(chainToSwitch, walInUse, balancesWallet.confirmed);

            setUnconfirmedBalance(
              chainToSwitch,
              walInUse,
              balancesWallet.unconfirmed,
            );
          }
          if (blockheightChain) {
            setBlockheight(chainToSwitch, blockheightChain);
          }
          await generateAddress(xpubWallet, xpubKey, chainToSwitch, walInUse);
          const newChain = chainToSwitch;
          // lastly we set new active chain
          dispatch(setActiveChain(newChain));
          await localForage.setItem('activeChain', newChain);
          setChainToSwitch('');
          proceedToSwap();
        } else {
          setChainInitialState(chainToSwitch);
          const blockchainConfig = blockchains[chainToSwitch];
          // check if we have them in secure storage
          const xpubEncrypted = secureLocalStorage.getItem(
            `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
              blockchainConfig.scriptType,
            )}-${blockchainConfig.id}`,
          );
          const xpub2Encrypted = secureLocalStorage.getItem(
            `2-xpub-48-${blockchainConfig.slip}-0-${getScriptType(
              blockchainConfig.scriptType,
            )}-${blockchainConfig.id}`,
          ); // key xpub
          if (xpubEncrypted && typeof xpubEncrypted === 'string') {
            const fingerprint: string = getFingerprint();
            const password = await passworderDecrypt(fingerprint, passwordBlob);
            if (typeof password !== 'string') {
              throw new Error(t('home:sspWalletDetails.err_pw_not_valid'));
            }
            const xpubChainWallet = await passworderDecrypt(
              password,
              xpubEncrypted,
            );
            if (xpubChainWallet && typeof xpubChainWallet === 'string') {
              if (xpub2Encrypted && typeof xpub2Encrypted === 'string') {
                const xpubChainKey = await passworderDecrypt(
                  password,
                  xpub2Encrypted,
                );
                console.log(xpubChainWallet);
                console.log(xpubChainKey);
                if (xpubChainKey && typeof xpubChainKey === 'string') {
                  // we have xpubwallet and xpubkey, generate, store and do everything
                  // set xpubwallet and xpubkey
                  setXpubWallet(chainToSwitch, xpubChainWallet);
                  setXpubKey(chainToSwitch, xpubChainKey);
                  const generatedWallets: generatedWallets =
                    (await localForage.getItem(`wallets-${chainToSwitch}`)) ??
                    {};
                  const walletDerivations = Object.keys(generatedWallets);
                  walletDerivations.forEach((derivation: string) => {
                    setAddress(
                      chainToSwitch,
                      derivation,
                      generatedWallets[derivation],
                    );
                  });
                  const walInUse = sellAssetAddress;
                  // save new walletInUse
                  await localForage.setItem(
                    `walletInUse-${chainToSwitch}`,
                    walInUse,
                  );
                  setWalletInUse(chainToSwitch, walInUse);
                  // load txs, balances, settings etc.
                  const txsWallet: transaction[] =
                    (await localForage.getItem(
                      `transactions-${chainToSwitch}-${walInUse}`,
                    )) ?? [];
                  const blockheightChain: number =
                    (await localForage.getItem(
                      `blockheight-${chainToSwitch}`,
                    )) ?? 0;
                  const balancesWallet: balancesObj =
                    (await localForage.getItem(
                      `balances-${chainToSwitch}-${walInUse}`,
                    )) ?? balancesObject;
                  const tokenBalances: tokenBalanceEVM[] =
                    (await localForage.getItem(
                      `token-balances-${chainToSwitch}-${walInUse}`,
                    )) ?? [];
                  const activatedTokens: string[] =
                    (await localForage.getItem(
                      `activated-tokens-${chainToSwitch}-${walInUse}`,
                    )) ?? [];
                  const importedTokens: Token[] =
                    (await localForage.getItem(
                      `imported-tokens-${chainToSwitch}`,
                    )) ?? [];
                  if (importedTokens) {
                    setImportedTokens(chainToSwitch, importedTokens || []);
                  }
                  if (activatedTokens) {
                    setActivatedTokens(
                      chainToSwitch,
                      walInUse,
                      activatedTokens || [],
                    );
                  }
                  const nodesWallet: node[] =
                    (await localForage.getItem(
                      `nodes-${chainToSwitch}-${walInUse}`,
                    )) ?? [];
                  if (tokenBalances) {
                    setTokenBalances(
                      chainToSwitch,
                      walInUse,
                      tokenBalances || [],
                    );
                  }
                  if (nodesWallet) {
                    setNodes(chainToSwitch, walInUse, nodesWallet || []);
                  }
                  if (txsWallet) {
                    setTransactions(chainToSwitch, walInUse, txsWallet || []);
                  }
                  if (balancesWallet) {
                    setBalance(
                      chainToSwitch,
                      walInUse,
                      balancesWallet.confirmed,
                    );

                    setUnconfirmedBalance(
                      chainToSwitch,
                      walInUse,
                      balancesWallet.unconfirmed,
                    );
                  }
                  if (blockheightChain) {
                    setBlockheight(chainToSwitch, blockheightChain);
                  }
                  await generateAddress(
                    xpubChainWallet,
                    xpubChainKey,
                    chainToSwitch,
                    walInUse,
                  );
                  const newChain = chainToSwitch;
                  // lastly we set new active chain
                  dispatch(setActiveChain(newChain));
                  await localForage.setItem('activeChain', newChain);
                  setChainToSwitch('');
                  proceedToSwap();
                  return;
                }
              }
            }
          }
          // if we do not have them, we should ask for them
          displayMessage(
            'error',
            t('home:chainSelect.sync_chain_first', {
              chainName: blockchainConfig.name,
            }),
          );
          setChainToSwitch('');
          setLoadingSwap(false);
        }
      } catch (error) {
        console.log(error);
        setLoadingSwap(false);
        displayMessage('error', t('home:chainSelect.unable_switch_chain'));
      }
    })();
  }, [chainToSwitch]);

  const generateAddress = async (
    xpubW: string,
    xpubK: string,
    chainToUse: keyof cryptos,
    walletToUse: string,
  ) => {
    try {
      if (!chainToUse || !xpubK || !xpubW) {
        console.log('missing data');
        console.log(chainToSwitch);
        console.log(xpubK);
        console.log(xpubW);
        return; // this case should never happen
      }
      const splittedDerPath = walletToUse.split('-');
      const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
      const addressIndex = Number(splittedDerPath[1]);
      const addrInfo = generateMultisigAddress(
        xpubW,
        xpubK,
        typeIndex,
        addressIndex,
        chainToUse,
      );
      setAddress(chainToUse, walletToUse, addrInfo.address);
      setRedeemScript(chainToUse, walletToUse, addrInfo.redeemScript ?? '');
      setWitnessScript(chainToUse, walletToUse, addrInfo.witnessScript ?? '');
      // get stored wallets
      const generatedWallets: generatedWallets =
        (await localForage.getItem('wallets-' + chainToUse)) ?? {};
      generatedWallets[walletToUse] = addrInfo.address;
      await localForage.setItem('wallets-' + chainToUse, generatedWallets);
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const proceedToSwap = () => {
    try {
      const selEx = selectedExchange as swapResponseData;
      selEx.buyAsset = buyAsset.split('_')[1];
      selEx.sellAsset = sellAsset.split('_')[1];
      const navigationObject: navigationObject = {
        receiver: selEx.depositAddress,
        amount: new BigNumber(selEx.sellAmount).toFixed(),
        swap: selEx,
      };
      if (sellAsset.split('_')[2]) {
        navigationObject.contract = sellAsset.split('_')[2];
      }
      // todo change active chain and active address
      // if chain is eth navigate to SendEVM else navigate to Send
      if (sellAsset.split('_')[0] === 'eth') {
        navigate('/sendEvm', { state: navigationObject });
      } else {
        navigate('/send', { state: navigationObject });
      }
    } catch (error) {
      console.log(error);
    } finally {
      setLoadingSwap(false);
    }
  };

  const fetchPairDetails = async () => {
    try {
      if (!amountSell) {
        setAmountBuy(0);
        setRate(0);
        setLoading(false);
        setSelectedExchange({});
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
            setSelectedExchange(highestBuyAmount);
          }
        } else {
          // todo error
          console.log('error');
          setAmountBuy(0);
          setRate(0);
          setLoading(false);
          setSelectedExchange({});
        }
      } else {
        console.log(pairDetails.data?.message || pairDetails.data);
        setAmountBuy(0);
        setRate(0);
        setLoading(false);
        setSelectedExchange({});
        // show som error todo
      }
      console.log(pairDetails);
    } catch (error) {
      console.log(error);
      setAmountBuy(0);
      setRate(0);
      setLoading(false);
      setSelectedExchange({});
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

  const proceed = async () => {
    try {
      setLoadingSwap(true);
      // check if user sending asset is synchronised
      if (
        !userAddresses[sellAsset.split('_')[0]] ||
        !userAddresses[buyAsset.split('_')[0]]
      ) {
        displayMessage('error', t('home:swap.chain_sync_required'));
        setLoadingSwap(false);
        return;
      }
      // adjust send section that its swapping
      // swap history?
      console.log(selectedExchange);
      // verify that sellAmount is the same as our amountSell and that buyAmount is the same as our amountBuy
      if (selectedExchange.sellAmount !== Number(amountSell).toFixed(8)) {
        displayMessage('warning', t('home:swap.rate_changed'));
        setLoadingSwap(false);
        return;
      }
      if (selectedExchange.buyAmount !== Number(amountBuy).toFixed(8)) {
        displayMessage('warning', t('home:swap.rate_changed'));
        setLoadingSwap(false);
        return;
      }
      // now we do submission of the swap as we have verified what user see is what is stored too
      const sellAssetZelcoreID = abeMapping[sellAsset];
      const buyAssetZelcoreID = abeMapping[buyAsset];
      const data: createSwapData = {
        exchangeId: selectedExchange.exchangeId ?? '',
        sellAsset: sellAssetZelcoreID,
        buyAsset: buyAssetZelcoreID,
        sellAmount: Number(amountSell).toFixed(8),
        buyAddress: userAddresses[buyAsset.split('_')[0]][buyAssetAddress],
        refundAddress: userAddresses[sellAsset.split('_')[0]][sellAssetAddress],
      };
      if (selectedExchange.rateId) {
        data.rateId = selectedExchange.rateId;
      }
      const swap = await createSwap(data, sspwid);
      // set new rate
      // if the buyAmount from swap creation is different from the buyAmount by more than 2%, show a message of rate changed and ask to review
      if (
        Math.abs(parseFloat(swap.data.buyAmount) - Number(amountBuy)) >
        parseFloat(swap.data.buyAmount) * 0.02
      ) {
        displayMessage('warning', t('home:swap.rate_changed'));
        setLoadingSwap(false);
        setRate(parseFloat(swap.data.rate));
        setAmountBuy(parseFloat(swap.data.buyAmount));
        setSelectedExchange(swap.data);
        return;
      }
      setRate(parseFloat(swap.data.rate));
      setAmountBuy(parseFloat(swap.data.buyAmount));
      setSelectedExchange(swap.data);
      console.log(swap);
      // set the chain to switch to
      setChainToSwitch(sellAsset.split('_')[0] as keyof cryptos);
      // now we triggered useEffect function of chainSwitching
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:swap.error_creating_swap'));
      setLoadingSwap(false);
    }
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
      {loadingSwap && (
        <Spin
          size="large"
          fullscreen
          style={{
            position: 'absolute',
            top: '250px',
          }}
        />
      )}
      <Navbar
        refresh={refresh}
        hasRefresh={false}
        allowChainSwitch={false}
        hasSwapHistory={true}
        header={t('home:swap.swap_crypto')}
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
              1 {sellAsset.split('_')[1]} = {rate} {buyAsset.split('_')[1]}
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
        <Button
          type="primary"
          size="large"
          onClick={proceed}
          disabled={loadingSwap}
        >
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
                    key={wallet}
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
                    key={wallet}
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
