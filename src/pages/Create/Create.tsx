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
import { useTranslation } from 'react-i18next';

import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
  LeftOutlined,
} from '@ant-design/icons';
import secureLocalStorage from 'react-secure-storage';

import { useAppDispatch, useAppSelector } from '../../hooks';

import { setXpubWallet, setPasswordBlob } from '../../store';

import './Create.css';

import {
  generateMnemonic,
  getMasterXpriv,
  getMasterXpub,
  getScriptType,
} from '../../lib/wallet';
import { encrypt as passworderEncrypt } from '@metamask/browser-passworder';
import { NoticeType } from 'antd/es/message/interface';
import { getFingerprint } from '../../lib/fingerprint';
import { blockchains } from '@storage/blockchains';

interface passwordForm {
  password: string;
  confirm_password: string;
  tos: boolean;
}

// we always use flux
function Create() {
  const { t } = useTranslation(['cr', 'common']);
  const { identityChain } = useAppSelector(
    (state) => state.sspState,
  );
  const blockchainConfig = blockchains[identityChain];
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
      displayMessage('info', t('cr:info_backup_needed'));
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
      displayMessage('error', t('cr:err_pw_min_char'));
      return;
    }
    if (values.password !== values.confirm_password) {
      displayMessage('error', t('cr:err_pw_not_match'));
      return;
    }
    if (!values.tos) {
      displayMessage('error', t('cr:err_tos'));
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
      displayMessage('error', t('cr:err_wallet_phrase_invalid_login'));
      return;
    }
    passworderEncrypt(password, mnemonicPhrase)
      .then(async (blob) => {
        secureLocalStorage.setItem('walletSeed', blob);
        // generate master xpriv for flux - default chain
        const xpriv = getMasterXpriv(
          mnemonicPhrase,
          48,
          blockchainConfig.slip,
          0,
          blockchainConfig.scriptType,
          identityChain,
        );
        const xpub = getMasterXpub(
          mnemonicPhrase,
          48,
          blockchainConfig.slip,
          0,
          blockchainConfig.scriptType,
          identityChain,
        );
        const xprivBlob = await passworderEncrypt(password, xpriv);
        const xpubBlob = await passworderEncrypt(password, xpub);
        const fingerprint: string = getFingerprint();
        const pwBlob = await passworderEncrypt(fingerprint, password);
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
        setXpubWallet(identityChain, xpub);
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
        displayMessage('error', t('cr:err_c1'));
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
        <LeftOutlined style={{ fontSize: '12px' }} /> {t('common:back')}
      </Button>
      <Divider />
      <Image width={80} preview={false} src="/ssp-logo.svg" />
      <h2>{t('cr:create_pw')}</h2>
      <Form
        name="pwdForm"
        initialValues={{ tos: false }}
        onFinish={(values) => void onFinish(values as passwordForm)}
        autoComplete="off"
        layout="vertical"
      >
        <Form.Item
          label={t('cr:set_password')}
          name="password"
          rules={[
            {
              required: true,
              message: t('cr:input_password'),
            },
          ]}
        >
          <Input.Password
            size="large"
            placeholder={t('cr:set_password')}
            prefix={<LockOutlined />}
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
            className="password-input"
          />
        </Form.Item>

        <Form.Item
          label={t('cr:confirm_password')}
          name="confirm_password"
          rules={[{ required: true, message: t('cr:pls_conf_pwd') }]}
        >
          <Input.Password
            size="large"
            placeholder={t('cr:confirm_password')}
            prefix={<LockOutlined />}
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
            className="password-input"
          />
        </Form.Item>

        <Form.Item name="tos" valuePropName="checked">
          <Checkbox>
            {t('cr:i_agree')}{' '}
            <a
              href="https://www.youtube.com/watch?v=GJVk_LfASxk&ab_channel=FluxLabs"
              target="_blank"
              rel="noreferrer"
            >
              {t('cr:not_evil')}
            </a>
            .
          </Checkbox>
        </Form.Item>

        <Form.Item>
          <Button type="primary" size="large" htmlType="submit">
            {t('cr:create_wallet')}
          </Button>
        </Form.Item>
      </Form>
      <Button
        type="link"
        block
        size="small"
        onClick={() => navigate('/restore')}
      >
        {t('cr:restore_with_seed')}
      </Button>
      <Modal
        title={t('cr:backup_wallet_seed')}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText={t('cr:create_wallet')}
        style={{ textAlign: 'center', top: 60 }}
      >
        <p>{t('cr:wallet_seed_info')}</p>
        <p>{t('cr:keep_seed_safe')}</p>
        <p>
          <b>{t('cr:seed_loose_info')}</b>
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
          {mnemonicShow ? t('cr:hide_mnemonic') : t('cr:show_mnemonic')}{' '}
          {t('cr:wallet_seed_phrase')}
        </Button>
        <Divider />
        <br />
        <Checkbox onChange={onChangeWSP}>{t('cr:phrase_backed_up')}</Checkbox>
        <br />
        <br />
      </Modal>
    </>
  );
}

export default Create;
