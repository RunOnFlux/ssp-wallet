import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Image, Button, Form, message, Spin } from 'antd';
import localForage from 'localforage';
import { setTransactions, setBlockheight } from '../../store';
import { setBalance, setUnconfirmedBalance } from '../../store';

import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
} from '@ant-design/icons';
import secureLocalStorage from 'react-secure-storage';

import { useAppDispatch } from '../../hooks';

import {
  setXpubWallet,
  setXpubKey,
  setPasswordBlob,
  setSspWalletIdentity,
} from '../../store';

import './Login.css';
import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import { NoticeType } from 'antd/es/message/interface';
import { getFingerprint } from '../../lib/fingerprint';

import { generateIdentityAddress } from '../../lib/wallet.ts';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import { transaction } from '../../types';

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

function Login() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    // check if existing user
    const accPresent = secureLocalStorage.getItem('walletSeed');
    // no wallet seed present
    if (!accPresent) {
      navigate('/welcome');
      return;
    }
    // check if we have password
    void (async function () {
      if (chrome?.storage?.session) {
        try {
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
      displayMessage('error', 'Not a valid password. Please try again.');
      return;
    }
    setPassword(values.password);
  };

  useEffect(() => {
    if (password) {
      decryptWallet();
    }
  }, [password]);

  const decryptWallet = () => {
    // we only need xpub for now
    const xpubEncrypted = secureLocalStorage.getItem('xpub-48-19167-0-0');
    const xpub2Encrypted = secureLocalStorage.getItem('2-xpub-48-19167-0-0'); // key xpub
    if (!xpubEncrypted) {
      displayMessage(
        'error',
        'Code L3: Wallet data missing. Please restore your wallet.',
      );
      setIsLoading(false);
      return;
    }
    if (typeof xpubEncrypted === 'string') {
      passworderDecrypt(password, xpubEncrypted)
        .then(async (xpub) => {
          if (typeof xpub === 'string') {
            console.log(xpub);
            dispatch(setXpubWallet(xpub));
            // generate ssp wallet identity
            const generatedSspWalletIdentity = generateIdentityAddress(
              xpub,
              'flux',
            );
            dispatch(setSspWalletIdentity(generatedSspWalletIdentity));
            if (typeof xpub2Encrypted === 'string') {
              const xpub2 = await passworderDecrypt(password, xpub2Encrypted);
              if (typeof xpub2 === 'string') {
                dispatch(setXpubKey(xpub2));
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
            // disaptch decryption of xpub of key 2-xpub-48-19167-0-0 if exists, if not, navigate to Key
            // load txs, balances, settings etc.
            const txsFlux: transaction[] =
              (await localForage.getItem('transactions-flux')) ?? [];
            const blockheightFlux: number =
              (await localForage.getItem('blockheight-flux')) ?? 0;
            const balancesFlux: balancesObj =
              (await localForage.getItem('balances-flux')) ?? balancesObject;
            if (txsFlux) {
              dispatch(setTransactions(txsFlux)) ?? balancesObject;
            }
            if (balancesFlux) {
              dispatch(setBalance(balancesFlux.confirmed));
              dispatch(setUnconfirmedBalance(balancesFlux.unconfirmed));
            }
            if (blockheightFlux) {
              dispatch(setBlockheight(blockheightFlux));
            }
            navigate('/home');
          } else {
            displayMessage(
              'error',
              'Code L2: Wallet data missing. Please restore your wallet.',
            );
            setIsLoading(false);
          }
        })
        .catch((error) => {
          setIsLoading(false);
          displayMessage('error', 'Invalid password. Please try again.');
          console.log(error);
        });
    } else {
      displayMessage(
        'error',
        'Code L1:  Wallet data missing. Please restore your wallet.',
      );
      setIsLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      {isLoading && <Spin size="large" />}
      {!isLoading && (
        <>
          <Image
            width={80}
            preview={false}
            src="/ssp-logo.svg"
            style={{ paddingTop: 70 }}
          />
          <h2>Welcome back!</h2>
          <h3>To your decentralized Cloud</h3>
          <br />
          <br />
          <Form
            name="loginForm"
            initialValues={{ tos: false }}
            onFinish={(values) => void onFinish(values as loginForm)}
            autoComplete="off"
            layout="vertical"
          >
            <Form.Item label="Unlock with Password" name="password">
              <Input.Password
                size="large"
                placeholder="Enter Password"
                prefix={<LockOutlined />}
                iconRender={(visible) =>
                  visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                }
                className="password-input"
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" size="large" htmlType="submit">
                Unlock Wallet
              </Button>
            </Form.Item>
          </Form>
          <br />
          <br />
          <Button
            type="link"
            block
            size="small"
            onClick={() => navigate('/restore')}
          >
            Forgot Password? <i> Restore</i>
          </Button>
          <PoweredByFlux />
        </>
      )}
    </>
  );
}

export default Login;
