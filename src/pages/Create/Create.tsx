import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Input,
  Image,
  Button,
  Checkbox,
  Form,
  Divider,
  message,
  Modal,
} from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';

import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
  LeftOutlined,
} from '@ant-design/icons';
import secureLocalStorage from 'react-secure-storage';

import { useAppDispatch } from '../../hooks';

import { setXpubWallet, setPasswordBlob } from '../../store';

import './Create.css';

import {
  generateMnemonic,
  getMasterXpriv,
  getMasterXpub,
} from '../../lib/wallet';
import { encrypt as passworderEncrypt } from '@metamask/browser-passworder';
import { NoticeType } from 'antd/es/message/interface';
import { getFingerprint } from '../../lib/fingerprint';
interface passwordForm {
  password: string;
  confirm_password: string;
  tos: boolean;
}

function Create() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // use secure local storage for storing mnemonic 'walletSeed', 'xpriv-48-slip-0-0', 'xpub-48-slip-0-0' and '2-xpub-48-slip-0-0' (2- as for second key) of together with encryption of browser-passworder
  // use localforage to store addresses, balances, transactions and other data. This data is not encrypted for performance reasons and they are not sensitive.
  // if user exists, navigate to login
  const [password, setPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mnemonicShow, setMnemonicShow] = useState(false);
  const [WSPbackedUp, setWSPbackedUp] = useState(false);
  const [wspWasShown, setWSPwasShown] = useState(false);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    if (WSPbackedUp && wspWasShown) {
      setIsModalOpen(false);
      storeMnemonic(mnemonic);
    } else {
      displayMessage(
        'info',
        'You must backup your wallet seed phrase before you can create a wallet.',
      );
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setMnemonic('');
    setPassword('');
    setWSPwasShown(false);
    setWSPbackedUp(false);
    setMnemonicShow(false);
  };

  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    // generate seed
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
  });

  useEffect(() => {
    if (mnemonic) {
      showModal();
    }
  }, [mnemonic]);

  useEffect(() => {
    if (password) {
      generateMnemonicPhrase(256);
    }
  }, [password]);

  const onFinish = (values: passwordForm) => {
    if (values.password.length < 8) {
      displayMessage('error', 'Password must have at least 8 characters.');
      return;
    }
    if (values.password !== values.confirm_password) {
      displayMessage('error', 'Passwords do not match');
      return;
    }
    if (!values.tos) {
      displayMessage('error', 'Please agree with Terms of Service');
      return;
    }
    setPassword(values.password);
  };

  const generateMnemonicPhrase = (entValue: 128 | 256) => {
    const generatedMnemonic = generateMnemonic(entValue);
    setMnemonic(generatedMnemonic);
  };

  const storeMnemonic = (mnemonicPhrase: string) => {
    if (!mnemonicPhrase) {
      displayMessage('error', 'Wallet seed phrase is invalid.');
      return;
    }
    passworderEncrypt(password, mnemonicPhrase)
      .then(async (blob) => {
        secureLocalStorage.setItem('walletSeed', blob);
        // generate master xpriv for flux
        const xpriv = getMasterXpriv(mnemonicPhrase, 48, 19167, 0, 'p2sh');
        const xpub = getMasterXpub(mnemonicPhrase, 48, 19167, 0, 'p2sh');
        const xprivBlob = await passworderEncrypt(password, xpriv);
        const xpubBlob = await passworderEncrypt(password, xpub);
        const fingerprint: string = getFingerprint();
        console.log(fingerprint);
        const pwBlob = await passworderEncrypt(fingerprint, password);
        secureLocalStorage.setItem('xpriv-48-19167-0-0', xprivBlob);
        secureLocalStorage.setItem('xpub-48-19167-0-0', xpubBlob);
        dispatch(setXpubWallet(xpub));
        if (chrome?.storage?.session) {
          await chrome.storage.session.clear();
          await chrome.storage.session.set({
            pwBlob: pwBlob,
          });
        }
        dispatch(setPasswordBlob(pwBlob));
        navigate('/login');
      })
      .catch((error) => {
        displayMessage(
          'error',
          'Code C1: Something went wrong while creating wallet.',
        );
        console.log(error);
      });
  };

  const onChangeWSP = (e: CheckboxChangeEvent) => {
    setWSPbackedUp(e.target.checked);
  };

  return (
    <>
      {contextHolder}
      <Button
        type="link"
        block
        size="small"
        style={{ textAlign: 'left', padding: '0' }}
        onClick={() => navigate('/welcome')}
      >
        <LeftOutlined style={{ fontSize: '12px' }} /> Back
      </Button>
      <Divider />
      <Image width={80} preview={false} src="/ssp-logo.svg" />
      <h2>Create Password</h2>
      <Form
        name="pwdForm"
        initialValues={{ tos: false }}
        onFinish={(values) => void onFinish(values as passwordForm)}
        autoComplete="off"
        layout="vertical"
      >
        <Form.Item
          label="Set Password"
          name="password"
          rules={[
            {
              required: true,
              message: 'Please input your password of at least 8 characters!',
            },
          ]}
        >
          <Input.Password
            size="large"
            placeholder="Set Password"
            prefix={<LockOutlined />}
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
            className="password-input"
          />
        </Form.Item>

        <Form.Item
          label="Confirm Password"
          name="confirm_password"
          rules={[{ required: true, message: 'Please confirm your password!' }]}
        >
          <Input.Password
            size="large"
            placeholder="Confirm Password"
            prefix={<LockOutlined />}
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
            className="password-input"
          />
        </Form.Item>

        <Form.Item name="tos" valuePropName="checked">
          <Checkbox>
            I agree with{' '}
            <a
              href="https://www.youtube.com/watch?v=GJVk_LfASxk&ab_channel=FluxLabs"
              target="_blank"
              rel="noreferrer"
            >
              not being evil
            </a>
            .
          </Checkbox>
        </Form.Item>

        <Form.Item>
          <Button type="primary" size="large" htmlType="submit">
            Create Wallet
          </Button>
        </Form.Item>
      </Form>
      <Button
        type="link"
        block
        size="small"
        onClick={() => navigate('/restore')}
      >
        Restore with Seed Phrase
      </Button>
      <Modal
        title="Backup Wallet Seed"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Create Wallet"
        style={{ textAlign: 'center' }}
      >
        <p>
          Wallet seed is used to generate all addresses. Anyone with the access
          to the wallet seed has partial control over the wallet.
        </p>
        <p>Keep your wallet seed backup safe and secure.</p>
        <p>
          <b>
            Loosing the wallet seed will result in the loss of access to your
            wallet.
          </b>
        </p>
        <br />
        <Divider />
        <h3>
          <i>
            {mnemonicShow
              ? mnemonic
              : '*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***'}
          </i>
        </h3>
        <Button
          type="dashed"
          onClick={() => {
            setMnemonicShow(!mnemonicShow), setWSPwasShown(true);
          }}
        >
          {mnemonicShow ? 'Hide Mnemonic' : 'Show Mnemonic'} Wallet Seed Phrase
        </Button>
        <Divider />
        <br />
        <Checkbox onChange={onChangeWSP}>
          I have backed up my wallet seed phrase in a secure location.
        </Checkbox>
        <br />
        <br />
      </Modal>
    </>
  );
}

export default Create;
