import { Typography, Button, Space, Modal, message } from 'antd';
import { useState, useEffect } from 'react';
import localForage from 'localforage';
const { Text } = Typography;
import { NoticeType } from 'antd/es/message/interface';
import BigNumber from 'bignumber.js';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import { getScriptType } from '../../lib/wallet';
import { cryptos, generatedWallets, transaction, node } from '../../types';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { generateMultisigAddress } from '../../lib/wallet.ts';

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
} from '../../store';

interface payRequestData {
  status: string;
  txid?: string;
  data?: string;
}

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

const balancesObject = {
  confirmed: '0.00',
  unconfirmed: '0.00',
};

function PaymentRequest(props: {
  open: boolean;
  openAction: (data: payRequestData | null | 'continue') => void;
  amount: string;
  address: string;
  message: string;
  chain: keyof cryptos;
}) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction, address, chain, amount } = props;
  const blockchainConfig = blockchains[chain];
  const { identityChain } = useAppSelector((state) => state.sspState);
  const [chainToSwitch, setChainToSwitch] = useState<keyof cryptos | ''>('');
  const { xpubWallet, xpubKey } = useAppSelector(
    (state) => state[(chainToSwitch as keyof cryptos) || identityChain],
  );
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

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
          const walInUse: string =
            (await localForage.getItem(`walletInUse-${chainToSwitch}`)) ??
            '0-0';
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
          const nodesWallet: node[] =
            (await localForage.getItem(`nodes-${chainToSwitch}-${walInUse}`)) ??
            [];
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
          proceedToSend();
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
                  const walInUse: string =
                    (await localForage.getItem(
                      `walletInUse-${chainToSwitch}`,
                    )) ?? '0-0';
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
                  const nodesWallet: node[] =
                    (await localForage.getItem(
                      `nodes-${chainToSwitch}-${walInUse}`,
                    )) ?? [];
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
                  proceedToSend();
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
        }
      } catch (error) {
        console.log(error);
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

  const proceedToSend = () => {
    const navigationObject = {
      receiver: address,
      amount: new BigNumber(amount).toFixed(),
      message: props.message,
      paymentAction: true,
    };
    if (blockchainConfig.chainType === 'evm') {
      // navigate to the particular chain send for mand fill in the data.
      navigate('/sendevm', { state: navigationObject });
    } else {
      // navigate to the particular chain send for mand fill in the data.
      navigate('/send', { state: navigationObject });
    }
    // close dialog
    openAction('continue');
  };

  const handleOk = () => {
    try {
      console.log('ok');
      // here check that chain, address, amount are defined
      if (!chain || !address || !amount) {
        throw new Error(t('home:payment_request.invalid_request'));
      }
      // check that all values are strings
      if (
        typeof chain !== 'string' ||
        typeof address !== 'string' ||
        typeof amount !== 'string'
      ) {
        throw new Error(t('home:payment_request.invalid_request'));
      }
      if (props.message && typeof props.message !== 'string') {
        throw new Error(t('home:payment_request.invalid_request'));
      }
      // check that chain is part of our cryptos
      if (!blockchains[chain]) {
        throw new Error(t('home:payment_request.invalid_request'));
      }
      // set chain to switch to to trigger effect
      setChainToSwitch(chain);
    } catch (error) {
      openAction({
        status: t('common:error'),
        data: t('home:payment_request.tx_rejected'),
      });
    }
  };

  const handleCancel = () => {
    openAction(null);
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:payment_request.payment_request')}
        open={open}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
      >
        <Space
          direction="vertical"
          size={64}
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <Space direction="vertical" size={32}>
            <Space direction="vertical" size="small">
              <Text>
                <Text strong>{blockchainConfig?.name}</Text>{' '}
                {t('home:payment_request.pay_for')}{' '}
                <Text strong>
                  {amount} {blockchainConfig?.symbol}
                </Text>{' '}
                {t('home:payment_request.to')}
                <Text strong> {address} </Text>
                {t('home:payment_request.received')}.
              </Text>
              {props.message && (
                <Text>
                  {t('home:payment_request.attached_message', {
                    message: props.message,
                  })}
                </Text>
              )}
            </Space>
          </Space>
          <Space direction="vertical" size="large">
            <Button type="primary" size="large" onClick={handleOk}>
              {t('home:payment_request.proceed_to_pay')}
            </Button>
            <Button type="link" block size="small" onClick={handleCancel}>
              {t('common:cancel')}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

export default PaymentRequest;
