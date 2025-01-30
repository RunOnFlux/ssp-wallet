import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Input,
  Button,
  Checkbox,
  Form,
  Divider,
  message,
  Modal,
  Popover,
  Popconfirm,
} from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import { useTranslation } from 'react-i18next';
import { wordlist } from '@scure/bip39/wordlists/english';

import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
  ExclamationCircleFilled,
  CopyOutlined,
  EyeInvisibleFilled,
  EyeFilled,
} from '@ant-design/icons';
import secureLocalStorage from 'react-secure-storage';

import { useAppDispatch } from '../../hooks';

import {
  setSSPInitialState,
  setXpubWallet,
  setPasswordBlob,
  setInitialStateForAllChains,
  setInitialContactsState,
} from '../../store';

import {
  getMasterXpriv,
  getMasterXpub,
  getScriptType,
  validateMnemonic,
} from '../../lib/wallet';
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
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mnemonicShow, setMnemonicShow] = useState(false);
  const [WSPbackedUp, setWSPbackedUp] = useState(false);
  const [wspWasShown, setWSPwasShown] = useState(false);
  const [wpCopied, setWpCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    if (WSPbackedUp && (wspWasShown || wpCopied)) {
      setIsModalOpen(false);
      storeMnemonic(mnemonic);
    } else {
      displayMessage('info', t('cr:info_backup_needed'));
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setMnemonic([]);
    setPassword('');
    setTemporaryPassword('');
    setWSPwasShown(false);
    setWpCopied(false);
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
    return () => {
      // reset state
      setPassword('');
      setTemporaryPassword('');
      setMnemonic([]);
      console.log('reset state');
    };
  }, []); // Empty dependency array ensures this effect runs only on mount/unmount

  useEffect(() => {
    if (password) {
      showModal();
    }
  }, [password]);

  useEffect(() => {
    if (temporaryPassword && mnemonic.length) {
      warningWeakPassword();
    }
  }, [temporaryPassword, mnemonic]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '10px Tahoma';
        mnemonic.forEach((word, index) => {
          const x = (index % 4) * 90 + 5; // Adjust x position for 4 words per row
          const y = Math.floor(index / 4) * 30 + 20; // Adjust y position for each row
          ctx.fillText(`${index + 1}.`, x, y); // Smaller number above the word
          ctx.font = '16px Tahoma'; // Larger font for the word
          ctx.fillText(mnemonicShow ? word : '*****', x + 20, y);
          ctx.font = '10px Tahoma'; // Reset font for the next number
        });
      }
    }
  }, [mnemonic, mnemonicShow, isModalOpen]);

  const isPasswordStrong = (password: string) => {
    return (
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!@#$%^&*]/.test(password)
    );
  };

  const warningWeakPassword = () => {
    Modal.confirm({
      title: t('cr:weak_password'),
      icon: <ExclamationCircleFilled />,
      content: (
        <>
          {t('cr:weak_password_info')}
          <br />
          <br />
          {t('cr:weak_password_confirm')}
        </>
      ),
      okText: t('cr:weak_password_confirm_cancel'),
      cancelText: t('cr:weak_password_confirm_ok'),
      onOk() {
        // close dialog
        setMnemonic([]);
        setTemporaryPassword('');
      },
      onCancel() {
        // proceed with weak password
        setPassword(temporaryPassword);
      },
    });
  };

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
    if (splittedSeed.includes('')) {
      displayMessage('error', t('cr:err_seed_invalid_spaces'));
      return;
    }
    const isValid = validateMnemonic(seedPhrase);
    if (!isValid) {
      // here show what word is not alright
      // we check ONLY for english wordlist
      const invalidWords = splittedSeed.filter(
        (word) => !wordlist.includes(word),
      );
      if (invalidWords.length) {
        displayMessage(
          'error',
          t('cr:err_seed_invalid_words', { words: invalidWords.join(', ') }),
        );
      } else {
        console.log('here');
        displayMessage('error', t('cr:err_seed_invalid'));
      }
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
    setMnemonic(splittedSeed);
    // check if password is strong
    if (!isPasswordStrong(values.password)) {
      // display confirmation modal that password is not strong
      setTemporaryPassword(values.password);
      return;
    }
    setPassword(values.password);
  };

  const handleNavigation = () => {
    if (!Object.keys(wallets).length) {
      navigate('/home');
    } else {
      navigate('/welcome');
    }
  };

  const storeMnemonic = (mnemonicPhrase: string[]) => {
    if (!mnemonicPhrase.length) {
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
        const mnemonicBlob = await passworderEncrypt(
          password,
          mnemonicPhrase.join(' '),
        );
        secureLocalStorage.setItem('walletSeed', mnemonicBlob);
        let xpriv = getMasterXpriv(
          mnemonicPhrase.join(' '),
          48,
          blockchainConfig.slip,
          0,
          blockchainConfig.scriptType,
          identityChain,
        );
        const xpub = getMasterXpub(
          mnemonicPhrase.join(' '),
          48,
          blockchainConfig.slip,
          0,
          blockchainConfig.scriptType,
          identityChain,
        );
        console.log(xpub);
        // reassign mnemonicPhrase to empty string as it is no longer needed
        mnemonicPhrase = [];
        const xprivBlob = await passworderEncrypt(password, xpriv);
        // reassign xpriv to empty string as it is no longer needed
        xpriv = '';
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
        dispatch(setInitialContactsState());
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
    if (wspWasShown || wpCopied) {
      setWSPbackedUp(e.target.checked);
    } else {
      displayMessage('info', t('cr:info_backup_needed'));
    }
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
          <Popover
            placement="top"
            content={t('cr:strong_password')}
            arrow={false}
            styles={{ body: { marginBottom: -30, maxWidth: 300 } }}
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
          </Popover>

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
        cancelText={t('common:cancel')}
        okText={t('cr:restore_wallet')}
        style={{ textAlign: 'center', top: 60 }}
      >
        <CreationSteps step={2} import={true} />
        <p>{t('cr:wallet_seed_info')}</p>
        <p>{t('cr:wallet_seed_info_2')}</p>
        <p>{t('cr:keep_seed_safe')}</p>
        <p>
          <b>{t('cr:seed_loose_info')}</b>
        </p>
        <Divider />
        <canvas
          ref={canvasRef}
          width={366}
          height={180}
          style={{ border: '1px solid black', marginLeft: '-15px' }}
        />
        {mnemonicShow && (
          <Button
            type="dashed"
            icon={<EyeFilled />}
            onClick={() => {
              setMnemonicShow(!mnemonicShow);
              setWSPwasShown(true);
            }}
            style={{ margin: 5 }}
          >
            {t('cr:hide_mnemonic')} {t('cr:wallet_seed_phrase')}
          </Button>
        )}
        {!mnemonicShow && (
          <Popconfirm
            title={t('cr:show_wallet_seed', {
              sensitive_data: t('cr:wallet_seed_phrase'),
            })}
            description={
              <>
                {t('cr:show_sensitive_data', {
                  sensitive_data: t('cr:wallet_seed_phrase'),
                })}
              </>
            }
            overlayStyle={{ maxWidth: 360, margin: 10 }}
            okText={t('common:confirm')}
            cancelText={t('common:cancel')}
            onConfirm={() => {
              setMnemonicShow(!mnemonicShow);
              setWSPwasShown(true);
            }}
            icon={<ExclamationCircleFilled style={{ color: 'orange' }} />}
          >
            <Button
              type="dashed"
              icon={<EyeInvisibleFilled />}
              style={{ margin: 5 }}
            >
              {t('cr:show_mnemonic')} {t('cr:wallet_seed_phrase')}
            </Button>
          </Popconfirm>
        )}
        <Popconfirm
          title={t('cr:copy_wallet_seed')}
          description={
            <>
              {t('cr:copy_sensitive_data_desc', {
                sensitive_data: t('cr:wallet_seed_phrase'),
              })}
            </>
          }
          overlayStyle={{ maxWidth: 360, margin: 10 }}
          okText={t('common:confirm')}
          cancelText={t('common:cancel')}
          onConfirm={() => {
            navigator.clipboard.writeText(mnemonic.join(' '));
            displayMessage('success', t('cr:copied'));
            setWpCopied(true);
          }}
          icon={<ExclamationCircleFilled style={{ color: 'orange' }} />}
        >
          <Button type="dashed" icon={<CopyOutlined />} style={{ margin: 5 }}>
            {t('cr:copy_wallet_seed')}
          </Button>
        </Popconfirm>
        <Divider />
        <br />
        <Checkbox disabled={!wspWasShown && !wpCopied} onChange={onChangeWSP}>
          {t('cr:phrase_backed_up')}
        </Checkbox>
        <br />
        <br />
      </Modal>
      <PoweredByFlux />
    </>
  );
}

export default Restore;
