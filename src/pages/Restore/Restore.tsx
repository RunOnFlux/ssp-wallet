import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Input,
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
} from '@ant-design/icons';
import secureLocalStorage from 'react-secure-storage';

import { useAppDispatch } from '../../hooks';

import {
  setSSPInitialState,
  setXpubWallet,
  setPasswordBlob,
  setInitialStateForAllChains,
} from '../../store';

import './Restore.css';

import { getMasterXpriv, getMasterXpub, getScriptType } from '../../lib/wallet';
import { encrypt as passworderEncrypt } from '@metamask/browser-passworder';
import { NoticeType } from 'antd/es/message/interface';

import localForage from 'localforage';
import { getFingerprint } from '../../lib/fingerprint';
import { useAppSelector } from '../../hooks';
import { blockchains } from '@storage/blockchains';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import CreationSteps from '../../components/CreationSteps/CreationSteps.tsx';
import Headerbar from '../../components/Headerbar/Headerbar.tsx';

interface passwordForm {
  mnemonic: string;
  password: string;
  confirm_password: string;
  tos: boolean;
}

const { TextArea } = Input;

// we always use btc as default
function Restore() {
  const { t } = useTranslation(['cr', 'common']);
  const { identityChain } = useAppSelector((state) => state.sspState);
  const blockchainConfig = blockchains[identityChain];
  const { wallets } = useAppSelector((state) => state[identityChain]);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // use secure local storage for storing mnemonic 'walletSeed', 'xpriv-48-slip-0-0-coin', 'xpub-48-slip-0-0-coin' and '2-xpub-48-slip-0-0-coin' (2- as for second key) of together with encryption of browser-passworder
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
      storeMnemonic(mnemonic.trim());
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
    if (mnemonic) {
      showModal();
    }
  }, [mnemonic]);

  const onFinish = (values: passwordForm) => {
    const seedPhrase = values.mnemonic.trim();
    if (!seedPhrase) {
      displayMessage('error', t('cr:err_enter_seed'));
      return;
    }
    const splittedSeed = seedPhrase.split(' ');
    if (splittedSeed.length < 12) {
      displayMessage('error', t('cr:err_seed_invalid'));
      return;
    }

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
    setMnemonic(seedPhrase);
  };

  const handleNavigation = () => {
    if (!Object.keys(wallets).length) {
      navigate('/home');
    } else {
      navigate('/welcome');
    }
  };

  const storeMnemonic = (mnemonicPhrase: string) => {
    if (!mnemonicPhrase) {
      displayMessage('error', t('cr:err_wallet_phrase_invalid'));
      return;
    }
    // first clean all data from localForge and secureLocalStorage
    secureLocalStorage.clear();
    localForage
      .clear()
      .then(async () => {
        if (chrome?.storage?.session) {
          await chrome.storage.session.clear();
        }
        const mnemonicBlob = await passworderEncrypt(password, mnemonicPhrase);
        secureLocalStorage.setItem('walletSeed', mnemonicBlob);
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
        console.log(xpub);
        const xprivBlob = await passworderEncrypt(password, xpriv);
        const xpubBlob = await passworderEncrypt(password, xpub);
        const fingerprint: string = getFingerprint();
        const pwBlob = await passworderEncrypt(fingerprint, password);
        secureLocalStorage.setItem(
          `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
          xprivBlob,
        );
        secureLocalStorage.setItem(
          `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
          xpubBlob,
        );
        setInitialStateForAllChains();
        dispatch(setSSPInitialState());
        if (chrome?.storage?.session) {
          await chrome.storage.session.set({
            pwBlob: pwBlob,
          });
        }
        setXpubWallet(identityChain, xpub);
        dispatch(setPasswordBlob(pwBlob));
        navigate('/login');
      })
      .catch((error) => {
        displayMessage('error', t('cr:err_r1'));
        console.log(error);
      });
  };

  const onChangeWSP = (e: CheckboxChangeEvent) => {
    setWSPbackedUp(e.target.checked);
  };

  return (
    <>
      {contextHolder}
      <div style={{ paddingBottom: '63px' }}>
        <Headerbar
          headerTitle={t('cr:import_seed')}
          navigateTo={!Object.keys(wallets).length ? '/home' : '/welcome'}
        />
        <Divider />
        <CreationSteps step={1} import={true} />
        <br />
        <Form
          name="seedForm"
          onFinish={(values) => void onFinish(values as passwordForm)}
          autoComplete="off"
          layout="vertical"
        >
          <Form.Item
            label={t('cr:wallet_seed')}
            name="mnemonic"
            rules={[
              {
                required: true,
                message: t('cr:input_wallet_seed'),
              },
            ]}
          >
            <TextArea rows={4} placeholder={t('cr:input_seed_phrase')} />
          </Form.Item>
          <br />
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
                href="https://github.com/RunOnFlux/ssp-wallet/blob/master/DISCLAIMER.md"
                target="_blank"
                rel="noreferrer"
              >
                {t('cr:ssp_wallet_disclaimer')}
              </a>
              .
            </Checkbox>
          </Form.Item>

          <Form.Item>
            <Button type="primary" size="large" htmlType="submit">
              {t('cr:import_wallet')}
            </Button>
          </Form.Item>
        </Form>
        <Button
          type="link"
          block
          size="small"
          style={{ padding: '0' }}
          onClick={() => handleNavigation()}
        >
          {t('common:cancel')}
        </Button>
      </div>
      <Modal
        title={t('cr:backup_wallet_seed')}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText={t('cr:restore_wallet')}
        style={{ textAlign: 'center', top: 60 }}
      >
        <CreationSteps step={2} import={true} />
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
      <PoweredByFlux />
    </>
  );
}

export default Restore;
