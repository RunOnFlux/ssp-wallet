import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
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
import StrongEncryptionChange from '../../components/StrongEncryptionChange/StrongEncryptionChange';

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
  setImportedTokens,
} from '../../store';

import { getFingerprint } from '../../lib/fingerprint';
import {
  generateInternalIdentityAddress,
  generateExternalIdentityAddress,
  getScriptType,
} from '../../lib/wallet.ts';
import {
  readRecoveryEnvelope,
  decryptRecoveryEnvelope,
} from '../../lib/recoveryEnvelope';
import { requestRecovery, RecoveryError } from '../../lib/recoveryProtocol';
import { sspConfig } from '@storage/ssp';

import { blockchains, Token } from '@storage/blockchains';

import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import LanguageSelector from '../../components/LanguageSelector/LanguageSelector.tsx';
import FloatingHelp from '../../components/FloatingHelp/FloatingHelp.tsx';
import RecoveryDialog, {
  RecoveryDialogStatus,
} from '../../components/RecoveryDialog/RecoveryDialog.tsx';

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
  const { t, i18n } = useTranslation(['login', 'common']);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { activeChain, identityChain } = useAppSelector(
    (state) => state.sspState,
  );
  const [strongEncryptionChange, setStrongEncryptionChange] = useState(false);
  const [recoveryStatus, setRecoveryStatus] =
    useState<RecoveryDialogStatus | null>(null);
  const [recoveryErrorCode, setRecoveryErrorCode] = useState<string>('');
  // Raw user password stashed during recovery for retry. We can't keep it
  // in React state because that would trigger the `password` useEffect
  // which expects `password + randomParams`, not the raw form value.
  const recoveryPasswordRef = useRef<string>('');
  // Guards the in-flight recovery from continuing after the user cancels.
  // `requestRecovery` can't be aborted mid-flight, so instead we flip this
  // flag and have the resolution callbacks bail out before touching state
  // or the login path.
  const recoveryCancelledRef = useRef(false);
  // Whether the component is still mounted — prevents setState warnings
  // from the 400ms auto-close timeout firing after unmount.
  const mountedRef = useRef(true);
  const blockchainConfig = blockchains[activeChain];
  const blockchainConfigIdentity = blockchains[identityChain];
  const browser = window.chrome || window.browser;

  useEffect(() => {
    return () => {
      // reset state
      setPassword('');
      mountedRef.current = false;
      recoveryCancelledRef.current = true;
    };
  }, []); // Empty dependency array ensures this effect runs only on mount/unmount

  useEffect(() => {
    // Clear any existing intervals to stop background refreshing during login
    if (globalThis.refreshIntervalBalances) {
      clearInterval(globalThis.refreshIntervalBalances);
    }
    if (globalThis.refreshIntervalTransactions) {
      clearInterval(globalThis.refreshIntervalTransactions);
    }
    if (globalThis.refreshIntervalNodes) {
      clearInterval(globalThis.refreshIntervalNodes);
    }

    void (async function () {
      // get activatedChain
      const activatedChain = await localForage.getItem('activeChain');
      if (
        activatedChain &&
        typeof activatedChain === 'string' &&
        blockchains[activatedChain]
      ) {
        const aC: keyof cryptos = activatedChain as keyof cryptos;
        // only set if we can read xpubEncrypted from secure storage
        const xpubEncrypted = secureLocalStorage.getItem(
          `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (xpubEncrypted) {
          dispatch(setActiveChain(aC));
        } else {
          dispatch(setActiveChain(identityChain));
          await localForage.setItem('activeChain', identityChain);
        }
      } else {
        dispatch(setActiveChain(identityChain));
        await localForage.setItem('activeChain', identityChain);
      }
      // set language
      const language = await localForage.getItem('language');
      if (language && typeof language === 'string') {
        await i18n.changeLanguage(language);
      }
      // check if existing user
      const accPresent = secureLocalStorage.getItem('walletSeed');
      const identityChainBlockHeight = await localForage.getItem(
        `blockheight-${identityChain}`,
      );
      // if it is null but we have activeChain set in localforage show popup warning
      if (!accPresent && identityChainBlockHeight) {
        setStrongEncryptionChange(true);
        return;
      }
      // no wallet seed present
      if (!accPresent) {
        navigate('/welcome');
        return;
      }
      // check if we have password
      if (browser?.storage?.session) {
        try {
          // check if we should stay logged out
          const curTime = new Date().getTime();
          const respLastActivity: lastActivity =
            await browser.storage.session.get('lastActivity');
          if (typeof respLastActivity.lastActivity === 'number') {
            if (respLastActivity.lastActivity + tenMins < curTime) {
              await browser.storage.session.clear();
              setIsLoading(false);
              return;
            }
          }
          // if different browser we will need to be inputting password every time
          const resp: pwdDecrypt = await browser.storage.session.get('pwBlob');
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
  }, []); // Empty dependency array ensures this runs only once on mount

  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  /**
   * Recovers plaintext `randomParams` via ssp-key when our own fingerprint
   * drifted and the local decrypt failed (L5). Re-encrypts under the fresh
   * fingerprint so subsequent logins work locally again, then continues
   * the normal login path by setting `password + randomParams` into state.
   */
  const runRecovery = async (userPassword: string) => {
    const envelope = readRecoveryEnvelope();
    if (!envelope) {
      // Pre-feature install with no envelope available — fall back to the
      // original L5 error path.
      displayMessage('error', t('login:err_lx', { code: 'L5' }));
      return;
    }
    recoveryCancelledRef.current = false;
    setRecoveryErrorCode('');
    setRecoveryStatus('waiting');
    try {
      const skR = await requestRecovery({
        wkIdentity: envelope.wkIdentity,
        keyIdentityPubKeyHex: envelope.keyIdentityPubKey,
        relay: sspConfig().relay,
        chain: identityChain,
      });
      if (recoveryCancelledRef.current || !mountedRef.current) return;

      const plaintextRandomParams = await decryptRecoveryEnvelope({
        envelope,
        userPassword,
        skR,
      });
      if (recoveryCancelledRef.current || !mountedRef.current) return;

      // Re-encrypt randomParams under the fresh (drifted) fingerprint so
      // the normal fingerprint-gated decrypt works on the next login.
      // Safe to do even if user later cancels — writes only the opaque blob.
      const freshFingerprint = getFingerprint('forRandomParams');
      const newBlob = await passworderEncrypt(
        freshFingerprint,
        plaintextRandomParams,
      );
      if (recoveryCancelledRef.current || !mountedRef.current) return;
      secureLocalStorage.setItem('randomParams', newBlob);

      setRecoveryStatus('approved');
      recoveryPasswordRef.current = '';
      // Hand off to the rest of the login flow by setting the combined
      // password — the existing useEffect on `password` picks it up.
      setPassword(userPassword + plaintextRandomParams);
      // Close the dialog shortly after showing the success state.
      setTimeout(() => {
        if (mountedRef.current) setRecoveryStatus(null);
      }, 400);
    } catch (err) {
      if (recoveryCancelledRef.current || !mountedRef.current) return;
      if (err instanceof RecoveryError) {
        if (err.code === 'denied') {
          setRecoveryStatus('denied');
        } else if (err.code === 'timeout') {
          setRecoveryStatus('timeout');
        } else {
          setRecoveryErrorCode(err.code);
          setRecoveryStatus('error');
        }
      } else {
        setRecoveryErrorCode('L5R');
        setRecoveryStatus('error');
      }
      console.log('[recovery] failed:', err);
    }
  };

  const retryRecovery = () => {
    if (!recoveryPasswordRef.current) return;
    void runRecovery(recoveryPasswordRef.current);
  };

  const closeRecoveryDialog = () => {
    // Mark the in-flight recovery (if any) as cancelled so its resolution
    // callbacks won't re-open the dialog or drive the login forward.
    recoveryCancelledRef.current = true;
    setRecoveryStatus(null);
    setRecoveryErrorCode('');
    recoveryPasswordRef.current = '';
  };

  const onFinish = (values: loginForm) => {
    if (values.password.length < 8) {
      displayMessage('error', t('login:err_invalid_pw'));
      return;
    }
    // get random params from secure local storage, decrypt it with light device finger print and combine with password, use promise instead of await
    const randomParams = secureLocalStorage.getItem('randomParams');
    if (
      randomParams &&
      typeof randomParams === 'string' &&
      randomParams.length
    ) {
      const randomParamFingerprint = getFingerprint('forRandomParams');
      passworderDecrypt(randomParamFingerprint, randomParams)
        .then((decryptedRandomParams) => {
          console.log('Random params decrypted');
          if (typeof decryptedRandomParams === 'string') {
            setPassword(values.password + decryptedRandomParams);
          } else {
            displayMessage('error', t('login:err_lx', { code: 'L4' }));
          }
        })
        .catch((error) => {
          console.log(error);
          // Our-fingerprint drift (L5): try the ssp-key recovery envelope.
          // Stash raw password in a ref so retry can replay it without
          // triggering the password-useEffect with a half-assembled value.
          recoveryPasswordRef.current = values.password;
          void runRecovery(values.password);
        });
    } else {
      setPassword(values.password);
    }
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
          // only set if we can read xpubEncrypted from secure storage
          const xpubEncrypted = secureLocalStorage.getItem(
            `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
              blockchainConfig.scriptType,
            )}-${blockchainConfig.id}`,
          );
          if (xpubEncrypted) {
            dispatch(setActiveChain(aC));
          } else {
            dispatch(setActiveChain(identityChain));
            await localForage.setItem('activeChain', identityChain);
          }
        } else {
          dispatch(setActiveChain(identityChain));
          await localForage.setItem('activeChain', identityChain);
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
      console.log(xpubEncrypted);
      console.log(xpubEncryptedIdentity);
      console.log(
        `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
          blockchainConfig.scriptType,
        )}-${blockchainConfig.id}`,
      );
      displayMessage('error', t('login:err_lx', { code: 'L3' }));
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
            console.log('Wallet unlocked for chain:', activeChain);
            console.log('xpub:', xpub);
            console.log('activeChain:', activeChain);
            setXpubWallet(activeChain, xpub);
            console.log('xpubIdentity:', xpubIdentity);
            setXpubWalletIdentity(xpubIdentity);
            const fingerprint: string = getFingerprint();
            const pwBlob = await passworderEncrypt(fingerprint, password);
            if (browser?.storage?.session) {
              // if different browser we will need to be inputting password every time
              await browser.storage.session.set({
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
              } else {
                // check if we have xpub2, if not, navigate to home immediately as there we run a check if to keep localforage or clear it
                navigate('/home');
                return;
              }
            }
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
            const importedTokens: Token[] =
              (await localForage.getItem(`imported-tokens-${activeChain}`)) ??
              [];
            if (importedTokens) {
              setImportedTokens(activeChain, importedTokens || []);
            }
            if (activatedTokens) {
              setActivatedTokens(activeChain, walInUse, activatedTokens || []);
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
            displayMessage('error', t('login:err_lx', { code: 'L2' }));
            setIsLoading(false);
          }
        })
        .catch((error) => {
          setIsLoading(false);
          displayMessage('error', t('login:err_invalid_pw_2'));
          console.log(error);
        });
    } else {
      displayMessage('error', t('login:err_lx', { code: 'L1' }));
      setIsLoading(false);
    }
  };

  const stronEncryptionChangeAction = (status: boolean) => {
    setStrongEncryptionChange(status);
    navigate('/welcome');
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
          <h3>{t('login:to_secure_wallet')}</h3>
          <br />
          <br />
          <Form
            name="loginForm"
            onFinish={(values) => void onFinish(values as loginForm)}
            autoComplete="off"
            layout="vertical"
          >
            <div className="password-input-container">
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
            </div>

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
      <StrongEncryptionChange
        open={strongEncryptionChange}
        openAction={stronEncryptionChangeAction}
      />
      {recoveryStatus && (
        <RecoveryDialog
          open={true}
          status={recoveryStatus}
          errorCode={recoveryErrorCode}
          onClose={closeRecoveryDialog}
          onRetry={retryRecovery}
        />
      )}
      <PoweredByFlux isClickeable={true} />
      <div style={{ position: 'absolute', top: 6, right: 6 }}>
        <LanguageSelector label={false} />
      </div>
      <FloatingHelp showGuide={false} />
    </>
  );
}

export default Login;
