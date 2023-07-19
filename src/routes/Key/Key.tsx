import { useState, useEffect } from 'react';
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

import { setXpub } from '../../store';

import './Key.css';

import { getMasterXpriv, getMasterXpub } from '../../lib/wallet';
import { encrypt as passworderEncrypt } from '@metamask/browser-passworder';
import { NoticeType } from 'antd/es/message/interface';

import localForage from 'localforage';

interface passwordForm {
  mnemonic: string;
  password: string;
  confirm_password: string;
  tos: boolean;
}

const { TextArea } = Input;

localForage.config({
  name: 'SSPWallet',
  driver: [localForage.INDEXEDDB, localForage.WEBSQL, localForage.LOCALSTORAGE],
  version: 1.0,
  size: 4980736, // Size of database, in bytes. WebSQL-only for now.
  storeName: 'keyvaluepairs', // Should be alphanumeric, with underscores.
  description: 'Database for SSP Wallet',
});

function App() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // use secure local storage for storing mnemonic 'walletSeed', 'xpriv-48-slip-0-0', 'xpub-48-slip-0-0' and '2-xpub-48-slip-0-0' (2- as for second key) of together with encryption of browser-passworder
  // use localforage to store addresses, balances, transactions and other data. This data is not encrypted for performance reasons and they are not sensitive.
  // if user exists, navigate to login
  const [password, setPassword] = useState('');
  const [menominc, setMnemonic] = useState('');
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
      storeMnemonic(menominc);
      navigate('/login');
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
  };

  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    // generate seed
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
  });

  useEffect(() => {
    if (menominc) {
      showModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menominc]);

  const onFinish = (values: passwordForm) => {
    const seedPhrase = values.mnemonic.trim();
    if (!seedPhrase) {
      displayMessage('error', 'Please enter your seed phrase');
      return;
    }
    const splittedSeed = seedPhrase.split(' ');
    if (splittedSeed.length < 12) {
      displayMessage(
        'error',
        'Wallet Seed Phrase is invalid. Seed Phrase consists of at least 12 words.',
      );
      return;
    }

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
    setMnemonic(seedPhrase);
  };

  const storeMnemonic = (mnemonic: string) => {
    if (!mnemonic) {
      displayMessage('error', 'Your wallet seed phrase is invalid.');
      return;
    }
    // first clean all data from localForge and secureLocalStorage
    secureLocalStorage.clear();
    localForage
      .clear()
      .then(() => {
        passworderEncrypt(password, mnemonic)
          .then((blob) => {
            secureLocalStorage.setItem('walletSeed', blob);
            // generate master xpriv for flux
            const xpriv = getMasterXpriv(mnemonic, 48, 19167, 0, 'p2sh');
            passworderEncrypt(password, xpriv)
              .then((blob) => {
                secureLocalStorage.setItem('xpriv-48-19167-0-0', blob);
              })
              .catch((error) => {
                displayMessage(
                  'error',
                  'Code R4: Something went wrong while creating wallet.',
                );
                console.log(error);
              });
            const xpub = getMasterXpub(mnemonic, 48, 19167, 0, 'p2sh');
            passworderEncrypt(password, xpub)
              .then((blob) => {
                secureLocalStorage.setItem('xpub-48-19167-0-0', blob);
              })
              .catch((error) => {
                displayMessage(
                  'error',
                  'Code R3: Something went wrong while creating wallet.',
                );
                console.log(error);
              });
            dispatch(setXpub(xpub));
          })
          .catch((error) => {
            displayMessage(
              'error',
              'Code R2: Something went wrong while creating wallet.',
            );
            console.log(error);
          });
      })
      .catch((error) => {
        displayMessage(
          'error',
          'Code R1: Something went wrong while creating wallet.',
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
      <h2>Import Wallet Seed Phrase</h2>
      <Form
        name="seedForm"
        onFinish={(values) => void onFinish(values as passwordForm)}
        autoComplete="off"
        layout="vertical"
      >
        <Form.Item
          label="Wallet Seed"
          name="mnemonic"
          rules={[
            {
              required: true,
              message: 'Please input your mnemonic wallet seed',
            },
          ]}
        >
          <TextArea rows={4} placeholder="Input Seed Phrase" />
        </Form.Item>
        <br />
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
            Import Wallet
          </Button>
        </Form.Item>
      </Form>
      <br />
      <br />
      <Modal
        title="Backup Wallet Seed"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Create Wallet"
        style={{ textAlign: 'center' }}
      >
        <p>
          Wallet weed is used to generate all addresses. Anyone with the access
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
              ? menominc
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

export default App;
