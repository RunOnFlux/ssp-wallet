import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Image, Button, Form, message, Spin } from 'antd';
import localForage from 'localforage';
import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
} from '@ant-design/icons';
import secureLocalStorage from 'react-secure-storage';
import { useTranslation } from 'react-i18next';
import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import { NoticeType } from 'antd/es/message/interface';

import { useAppDispatch, useAppSelector } from '../../hooks';
import { contact, tokenBalanceEVM } from '../../types';

import {
  setActiveChain,
  setPasswordBlob,
  setSspWalletInternalIdentity,
  setSspWalletExternalIdentity,
  setTransactions,
  setNodes,
  setBlockheight,
  setWalletInUse,
  setBalance,
  setUnconfirmedBalance,
  setAddress,
  setXpubWallet,
  setXpubKey,
  setXpubKeyIdentity,
  setXpubWalletIdentity,
  setContacts,
  setTokenBalances,
  setActivatedTokens,
} from '../../store';

import { getFingerprint } from '../../lib/fingerprint';
import {
  generateInternalIdentityAddress,
  generateExternalIdentityAddress,
  getScriptType,
} from '../../lib/wallet.ts';

import { blockchains } from '@storage/blockchains';

import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import LanguageSelector from '../../components/LanguageSelector/LanguageSelector.tsx';

import { transaction, generatedWallets, cryptos, node } from '../../types';

interface loginForm {
  password: string;
}

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

const balancesObject = {
  confirmed: '0.00',
  unconfirmed: '0.00',
};

type pwdDecrypt = Record<string, string>;

type lastActivity = Record<string, number>;

const tenMins = 10 * 60 * 1000;

function Login() {
  const { t, i18n } = useTranslation(['login']);
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { activeChain, identityChain } = useAppSelector(
    (state) => state.sspState,
  );
  const blockchainConfig = blockchains[activeChain];
  const blockchainConfigIdentity = blockchains[identityChain];

  useEffect(() => {
    if (globalThis.refreshIntervalBalances) {
      clearInterval(globalThis.refreshIntervalBalances);
    }
    if (globalThis.refreshIntervalTransactions) {
      clearInterval(globalThis.refreshIntervalTransactions);
    }
    if (globalThis.refreshIntervalNodes) {
      clearInterval(globalThis.refreshIntervalNodes);
    }
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    void (async function () {
      // get activatedChain
      const activatedChain = await localForage.getItem('activeChain');
      if (
        activatedChain &&
        typeof activatedChain === 'string' &&
        blockchains[activatedChain]
      ) {
        const aC: keyof cryptos = activatedChain as keyof cryptos;
        dispatch(setActiveChain(aC));
      }
      // set language
      const language = await localForage.getItem('language');
      if (language && typeof language === 'string') {
        await i18n.changeLanguage(language);
      }
      // check if existing user
      const accPresent = secureLocalStorage.getItem('walletSeed');
      // no wallet seed present
      if (!accPresent) {
        navigate('/welcome');
        return;
      }
      // check if we have password
      if (chrome?.storage?.session) {
        try {
          // check if we should stay logged out
          const curTime = new Date().getTime();
          const respLastActivity: lastActivity =
            await chrome.storage.session.get('lastActivity');
          if (typeof respLastActivity.lastActivity === 'number') {
            if (respLastActivity.lastActivity + tenMins < curTime) {
              await chrome.storage.session.clear();
              setIsLoading(false);
              return;
            }
          }
          // if different browser we will need to be inputting password every time
          const resp: pwdDecrypt = await chrome.storage.session.get('pwBlob');
          const fingerprint: string = getFingerprint();
          const pwd = await passworderDecrypt(fingerprint, resp.pwBlob);
          if (typeof pwd === 'string') {
            setIsLoading(true);
            setPassword(pwd);
          } else {
            setIsLoading(false);
          }
        } catch (error) {
          console.log(error);
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    })();
  });

  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const onFinish = (values: loginForm) => {
    if (values.password.length < 8) {
      displayMessage('error', t('login:err_invalid_pw'));
      return;
    }
    setPassword(values.password);
  };

  useEffect(() => {
    void (async function () {
      if (password) {
        // get activatedChain
        const activatedChain = await localForage.getItem('activeChain');
        if (
          activatedChain &&
          typeof activatedChain === 'string' &&
          blockchains[activatedChain]
        ) {
          const aC: keyof cryptos = activatedChain as keyof cryptos;
          dispatch(setActiveChain(aC));
        }
        decryptWallet();
      }
    })();
  }, [password]);

  const decryptWallet = () => {
    // get SSP identity keys
    const xpubEncryptedIdentity = secureLocalStorage.getItem(
      `xpub-48-${blockchainConfigIdentity.slip}-0-${getScriptType(
        blockchainConfigIdentity.scriptType,
      )}-${blockchainConfigIdentity.id}`,
    );
    const xpub2EncryptedIdentity = secureLocalStorage.getItem(
      `2-xpub-48-${blockchainConfigIdentity.slip}-0-${getScriptType(
        blockchainConfigIdentity.scriptType,
      )}-${blockchainConfigIdentity.id}`,
    ); // key xpub
    // we only need xpub for now for chain
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
    if (!xpubEncrypted || !xpubEncryptedIdentity) {
      displayMessage('error', t('login:err_l3'));
      setIsLoading(false);
      return;
    }
    if (
      typeof xpubEncrypted === 'string' &&
      typeof xpubEncryptedIdentity === 'string'
    ) {
      passworderDecrypt(password, xpubEncrypted)
        .then(async (xpub) => {
          const xpubIdentity = await passworderDecrypt(
            password,
            xpubEncryptedIdentity,
          );
          // set xpubs of chains
          if (typeof xpub === 'string' && typeof xpubIdentity === 'string') {
            console.log(xpub);
            console.log(activeChain);
            setXpubWallet(activeChain, xpub);
            console.log(xpubIdentity);
            setXpubWalletIdentity(xpubIdentity);
            if (typeof xpub2Encrypted === 'string') {
              const xpub2 = await passworderDecrypt(password, xpub2Encrypted);
              if (typeof xpub2 === 'string') {
                setXpubKey(activeChain, xpub2);
              }
            }
            if (typeof xpub2EncryptedIdentity === 'string') {
              const xpub2Identity = await passworderDecrypt(
                password,
                xpub2EncryptedIdentity,
              );
              if (typeof xpub2Identity === 'string') {
                setXpubKeyIdentity(xpub2Identity);
              }
            }
            const fingerprint: string = getFingerprint();
            const pwBlob = await passworderEncrypt(fingerprint, password);
            if (chrome?.storage?.session) {
              // if different browser we will need to be inputting password every time
              await chrome.storage.session.set({
                pwBlob: pwBlob,
              });
            }
            dispatch(setPasswordBlob(pwBlob));
            // generate ssp wallet internal identity
            const generatedSspWalletInternalIdentity =
              generateInternalIdentityAddress(xpubIdentity, identityChain);
            dispatch(
              setSspWalletInternalIdentity(generatedSspWalletInternalIdentity),
            );
            // generate ssp wallet external identity
            const generatedSspWalletExternalIdentity =
              generateExternalIdentityAddress(xpubIdentity);
            dispatch(
              setSspWalletExternalIdentity(generatedSspWalletExternalIdentity),
            );
            // restore stored wallets
            const generatedWallets: generatedWallets =
              (await localForage.getItem(`wallets-${activeChain}`)) ?? {};
            const walletDerivations = Object.keys(generatedWallets);
            walletDerivations.forEach((derivation: string) => {
              setAddress(activeChain, derivation, generatedWallets[derivation]);
            });
            const walInUse: string =
              (await localForage.getItem(`walletInUse-${activeChain}`)) ??
              '0-0';
            setWalletInUse(activeChain, walInUse);
            // load txs, balances, settings etc.
            const txsWallet: transaction[] =
              (await localForage.getItem(
                `transactions-${activeChain}-${walInUse}`,
              )) ?? [];
            const blockheightChain: number =
              (await localForage.getItem(`blockheight-${activeChain}`)) ?? 0;
            const balancesWallet: balancesObj =
              (await localForage.getItem(
                `balances-${activeChain}-${walInUse}`,
              )) ?? balancesObject;
            const tokenBalances: tokenBalanceEVM[] =
              (await localForage.getItem(
                `token-balances-${activeChain}-${walInUse}`,
              )) ?? [];
            const activatedTokens: string[] =
              (await localForage.getItem(
                `activated-tokens-${activeChain}-${walInUse}`,
              )) ?? [];
            const nodesWallet: node[] =
              (await localForage.getItem(`nodes-${activeChain}-${walInUse}`)) ??
              [];
            if (activatedTokens) {
              setActivatedTokens(
                activeChain,
                walInUse,
                activatedTokens || [],
              );
            }
            if (tokenBalances) {
              setTokenBalances(activeChain, walInUse, tokenBalances || []);
            }
            if (nodesWallet) {
              setNodes(activeChain, walInUse, nodesWallet || []);
            }
            if (txsWallet) {
              setTransactions(activeChain, walInUse, txsWallet || []);
            }
            if (balancesWallet) {
              setBalance(activeChain, walInUse, balancesWallet.confirmed);

              setUnconfirmedBalance(
                activeChain,
                walInUse,
                balancesWallet.unconfirmed,
              );
            }
            if (blockheightChain) {
              setBlockheight(activeChain, blockheightChain);
            }
            // load contacts
            const contacts = await localForage.getItem('contacts');
            if (contacts) {
              dispatch(
                setContacts(contacts as Record<keyof cryptos, contact[]>),
              );
            }
            navigate('/home');
          } else {
            displayMessage('error', t('login:err_l2'));
            setIsLoading(false);
          }
        })
        .catch((error) => {
          setIsLoading(false);
          displayMessage('error', t('login:err_invalid_pw_2'));
          console.log(error);
        });
    } else {
      displayMessage('error', t('login:err_l1'));
      setIsLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      {isLoading && <Spin size="large" />}
      {!isLoading && (
        <div style={{ paddingBottom: '43px' }}>
          <Image
            width={80}
            preview={false}
            src="/ssp-logo-black.svg"
            style={{ paddingTop: 70 }}
          />
          <h2>{t('login:welcome_back')}</h2>
          <h3>{t('login:to_dec_cloud')}</h3>
          <br />
          <br />
          <Form
            name="loginForm"
            onFinish={(values) => void onFinish(values as loginForm)}
            autoComplete="off"
            layout="vertical"
          >
            <Form.Item label={t('login:unlock_with_pw')} name="password">
              <Input.Password
                size="large"
                placeholder={t('login:enter_pw')}
                prefix={<LockOutlined />}
                iconRender={(visible) =>
                  visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                }
                className="password-input"
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" size="large" htmlType="submit">
                {t('login:unlock_wallet')}
              </Button>
            </Form.Item>
          </Form>
          <br />
          <Button
            type="link"
            block
            size="small"
            onClick={() => navigate('/restore')}
          >
            {t('login:forgot_pw')} <i> {t('login:restore')}</i>
          </Button>
        </div>
      )}
      <PoweredByFlux isClickeable={true} />
      <div style={{ position: 'absolute', top: 5, right: 5 }}>
        <LanguageSelector label={false} />
      </div>
    </>
  );
}

export default Login;
