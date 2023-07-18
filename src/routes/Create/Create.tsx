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

import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
  LeftOutlined,
} from '@ant-design/icons';
import secureLocalStorage from 'react-secure-storage';

import { useAppDispatch } from '../../hooks';

import { setXpub } from '../../store';

import './Create.css';

import {
  generateMnemonic,
  getMasterXpriv,
  getMasterXpub,
} from '../../lib/wallet';
import { encrypt as passworderEncrypt } from '@metamask/browser-passworder';
import { NoticeType } from 'antd/es/message/interface';

interface passwordForm {
  password: string;
  confirm_password: string;
  tos: boolean;
}

function App() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // use secure local storage for storing mnemonic 'walletSeed', 'xpriv-48-slip-0-0', 'xpub-48-slip-0-0' and '2-xpub-48-slip-0-0' (2- as for second key) of together with encryption of browser-passworder
  // use localforage to store addresses, balances, transactions and other data. This data is not encrypted for performance reasons and they are not sensitive.
  // if user exists, navigate to login
  const [password, setPassword] = useState('');
  const [menominc, setMnemonic] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    setIsModalOpen(false);
    storeMnemonic(menominc);
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

  useEffect(() => {
    if (password) {
      generateMnemonicPhrase(256);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    console.log('fired');
    const generatedMnemonic = generateMnemonic(entValue);
    setMnemonic(generatedMnemonic);
  };

  const storeMnemonic = (mnemonic: string) => {
    console.log(mnemonic);
    if (!mnemonic) {
      console.log('mnemonic is empty');
      return;
    }
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
            console.log(error);
          });
        const xpub = getMasterXpub(mnemonic, 48, 19167, 0, 'p2sh');
        passworderEncrypt(password, xpub)
          .then((blob) => {
            secureLocalStorage.setItem('xpub-48-19167-0-0', blob);
          })
          .catch((error) => {
            console.log(error);
          });
        dispatch(setXpub(xpub));
      })
      .catch((error) => {
        console.log(error);
      });
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
      <br />
      <br />
      <Button
        type="link"
        block
        size="small"
        onClick={() => navigate('/recover')}
      >
        Import with Seed Phrase
      </Button>
      <Modal
        title="Backup Wallet Seed"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Create Wallet"
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

        <Divider />
        <h3 style={{ textAlign: 'center' }}>
          <i>{menominc}</i>
        </h3>
        <Divider />
      </Modal>
    </>
  );
}

export default App;
