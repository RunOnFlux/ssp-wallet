import { Fragment, useState, useEffect } from 'react';
import { Button, Modal, message, Image, Row, Col } from 'antd';
import localForage from 'localforage';
import { NoticeType } from 'antd/es/message/interface';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { getScriptType } from '../../lib/wallet';
import { transaction, generatedWallets, cryptos } from '../../types';
import {
  generateMultisigAddress,
  getMasterXpriv,
  getMasterXpub,
} from '../../lib/wallet.ts';

import {
  setAddress,
  setRedeemScript,
  setTransactions,
  setBalance,
  setUnconfirmedBalance,
  setBlockheight,
  setWalletInUse,
  setChainInitialState,
  setXpubWallet,
  setXpubKey,
  setActiveChain,
} from '../../store';

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

const balancesObject = {
  confirmed: '0.00',
  unconfirmed: '0.00',
};

function ChainSelect(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const blockchainKeys = Object.keys(blockchains);
  const { t } = useTranslation(['home', 'common']);
  const [messageApi, contextHolder] = message.useMessage();
  const { open, openAction } = props;
  const dispatch = useAppDispatch();
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const [chainToSwitch, setChainToSwitch] = useState<keyof cryptos | ''>('');
  const { xpubWallet, xpubKey, walletInUse } = useAppSelector(
    (state) => state[(chainToSwitch as keyof cryptos) || 'flux'],
  );
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
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
          generateAddress();
        } else {
          setChainInitialState(chainToSwitch);
          const blockchainConfig = blockchains[chainToSwitch];
          // check if we have them in secure storage
          const xpubEncrypted = secureLocalStorage.getItem(
            `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
              blockchainConfig.scriptType,
            )}`,
          );
          const xpub2Encrypted = secureLocalStorage.getItem(
            `2-xpub-48-${blockchainConfig.slip}-0-${getScriptType(
              blockchainConfig.scriptType,
            )}`,
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
                  generateAddress();
                  return;
                }
              }
            }
          }
          // if we ended up here treat this as we do not have any xpub and no data for the chain.
          // generate xpub wallet and open
          const walSeedBlob = secureLocalStorage.getItem('walletSeed');
          const fingerprint: string = getFingerprint();
          const password = await passworderDecrypt(fingerprint, passwordBlob);
          if (typeof password !== 'string') {
            throw new Error(t('home:sspWalletDetails.err_pw_not_valid'));
          }
          if (!walSeedBlob || typeof walSeedBlob !== 'string') {
            throw new Error(t('home:sspWalletDetails.err_invalid_wallet_seed'));
          }
          const walletSeed = await passworderDecrypt(password, walSeedBlob);
          if (typeof walletSeed !== 'string') {
            throw new Error(
              t('home:sspWalletDetails.err_invalid_wallet_seed_2'),
            );
          }
          const xprivWallet = getMasterXpriv(
            walletSeed,
            48,
            blockchainConfig.slip,
            0,
            blockchainConfig.scriptType,
          );
          const xpubWallet = getMasterXpub(
            walletSeed,
            48,
            blockchainConfig.slip,
            0,
            blockchainConfig.scriptType,
          );
          const xprivBlob = await passworderEncrypt(password, xprivWallet);
          const xpubBlob = await passworderEncrypt(password, xpubWallet);
          secureLocalStorage.setItem(
            `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
              blockchainConfig.scriptType,
            )}`,
            xprivBlob,
          );
          secureLocalStorage.setItem(
            `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
              blockchainConfig.scriptType,
            )}`,
            xpubBlob,
          );
          setXpubWallet(chainToSwitch, xpubWallet);
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
          // todo here we should ask for Key synchronisation
        }
        // lastly we set new active chain
        dispatch(setActiveChain(chainToSwitch));
        await localForage.setItem('activeChain', chainToSwitch);
        setChainToSwitch('');
      } catch (error) {
        console.log(error);
        displayMessage('error', t('home:chainSelect.unable_switch_chain'));
      }
    })();
  }, [chainToSwitch]);

  const generateAddress = () => {
    try {
      if (!chainToSwitch) return; // this case should never happen
      const splittedDerPath = walletInUse.split('-');
      const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
      const addressIndex = Number(splittedDerPath[1]);
      const addrInfo = generateMultisigAddress(
        xpubWallet,
        xpubKey,
        typeIndex,
        addressIndex,
        chainToSwitch,
      );
      setAddress(chainToSwitch, walletInUse, addrInfo.address);
      setRedeemScript(chainToSwitch, walletInUse, addrInfo.redeemScript);
      // get stored wallets
      void (async function () {
        const generatedWallets: generatedWallets =
          (await localForage.getItem('wallets-' + chainToSwitch)) ?? {};
        generatedWallets[walletInUse] = addrInfo.address;
        await localForage.setItem('wallets-' + chainToSwitch, generatedWallets);
      })();
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const handleOk = () => {
    openAction(false);
  };

  const switchChain = (chainName: keyof cryptos) => {
    setChainToSwitch(chainName);
    setTimeout(() => {
      openAction(false);
    }, 50)
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:chainSelect.select_chain')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            {t('common:close')}
          </Button>,
        ]}
      >
        <Row
          gutter={[16, 24]}
          style={{ paddingTop: '40px', paddingBottom: '40px' }}
        >
          {blockchainKeys.map((chain) => (
            <Fragment key={chain}>
              <Col className="gutter-row" span={12}>
                <Col
                  span={24}
                  onClick={() => switchChain(chain as keyof cryptos)}
                >
                  <Image
                    height={40}
                    preview={false}
                    src={blockchains[chain].logo}
                    style={{ cursor: 'pointer' }}
                  />
                  <span
                    style={{
                      fontSize: '16px',
                      paddingLeft: '4px',
                      position: 'relative',
                      top: '3px',
                    }}
                  >
                    {blockchains[chain].symbol}
                  </span>
                </Col>
                <span style={{ fontSize: '16px', color: 'grey' }}>
                  {blockchains[chain].name}
                </span>
              </Col>
            </Fragment>
          ))}
        </Row>
      </Modal>
    </>
  );
}

export default ChainSelect;
