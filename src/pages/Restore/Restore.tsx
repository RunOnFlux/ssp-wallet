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
  Space,
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
import { getFingerprint, getRandomParams } from '../../lib/fingerprint';
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
  const [mnemonic, setMnemonic] = useState<Uint8Array>(new Uint8Array());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mnemonicShow, setMnemonicShow] = useState(false);
  const [WSPbackedUp, setWSPbackedUp] = useState(false);
  const [wspWasShown, setWSPwasShown] = useState(false);
  const [wpCopied, setWpCopied] = useState(false);
  const [seedPhraseCopyingVisible, setSeedPhraseCopyingVisible] =
    useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
  const browser = window.chrome || window.browser;

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
    mnemonic.fill(0);
    setMnemonic(new Uint8Array());
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
      mnemonic.fill(0);
      setMnemonic(new Uint8Array());
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
        ctx.fillStyle = darkModePreference.matches ? '#fff' : '#000';
        new TextDecoder()
          .decode(mnemonic)
          .split(' ')
          .forEach((word, index) => {
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
        mnemonic.fill(0);
        setMnemonic(new Uint8Array());
        setTemporaryPassword('');
      },
      onCancel() {
        // proceed with weak password
        // add randomly generated parameters to the password randomBytes(64)
        let randomParams = getRandomParams();
        let passwordWithParams = temporaryPassword + randomParams;
        setPassword(passwordWithParams);
        // @ts-expect-error assign to null as it is no longer needed
        randomParams = null;
        // @ts-expect-error assign to null as it is no longer needed
        passwordWithParams = null;
      },
    });
  };

  const onFinish = (values: passwordForm) => {
    let seedPhrase = values.mnemonic.trim();
    if (!seedPhrase) {
      displayMessage('error', t('cr:err_enter_seed'));
      return;
    }
    let splittedSeed = seedPhrase.split(' ');
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
    setMnemonic(new TextEncoder().encode(splittedSeed.join(' ')));
    // @ts-expect-error assign to null as it is no longer needed
    splittedSeed = null;
    // @ts-expect-error assign to null as it is no longer needed
    seedPhrase = null;
    // @ts-expect-error assign to null as it is no longer needed
    values.mnemonic = null;
    // check if password is strong
    if (!isPasswordStrong(values.password)) {
      // display confirmation modal that password is not strong
      setTemporaryPassword(values.password);
      return;
    }
    // add randomly generated parameters to the password randomBytes(64)
    let randomParams = getRandomParams();
    let passwordWithParams = values.password + randomParams;
    setPassword(passwordWithParams);
    // @ts-expect-error assign to null as it is no longer needed
    randomParams = null;
    // @ts-expect-error assign to null as it is no longer needed
    passwordWithParams = null;
  };

  const handleNavigation = () => {
    if (!Object.keys(wallets).length) {
      navigate('/home');
    } else {
      navigate('/welcome');
    }
  };

  const storeMnemonic = (mnemonicPhrase: Uint8Array) => {
    if (!mnemonicPhrase.length) {
      displayMessage('error', t('cr:err_wallet_phrase_invalid'));
      return;
    }
    // first clean all data from localForge and secureLocalStorage
    secureLocalStorage.clear();
    localForage
      .getItem(`wallets-${identityChain}`)
      .then(async (wallets) => {
        if (!wallets) {
          // otherwise we are restoring. Later we check if restored address matches, if not we delete, if yes we keep
          await localForage.clear();
        } else {
          await localForage.setItem('activeChain', identityChain);
        }
        if (browser?.storage?.session) {
          await browser.storage.session.clear();
        }
        const mnemonicBlob = await passworderEncrypt(
          password,
          new TextDecoder().decode(mnemonicPhrase),
        );
        const randomParamFingerprint = getFingerprint('forRandomParams');
        // take last 64 bytes from password, thats our random params
        const randomParams = password.slice(-128);
        const randomParamsBlob = await passworderEncrypt(
          randomParamFingerprint,
          randomParams,
        );
        secureLocalStorage.setItem('randomParams', randomParamsBlob);
        secureLocalStorage.setItem('walletSeed', mnemonicBlob);
        let xpriv = getMasterXpriv(
          new TextDecoder().decode(mnemonicPhrase),
          48,
          blockchainConfig.slip,
          0,
          blockchainConfig.scriptType,
          identityChain,
        );
        const xpub = getMasterXpub(
          new TextDecoder().decode(mnemonicPhrase),
          48,
          blockchainConfig.slip,
          0,
          blockchainConfig.scriptType,
          identityChain,
        );
        console.log(xpub);
        // reassign mnemonicPhrase to null as it is no longer needed
        mnemonicPhrase.fill(0);
        const xprivBlob = await passworderEncrypt(password, xpriv);
        // @ts-expect-error assign to null as it is no longer needed
        xpriv = null;
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
        if (browser?.storage?.session) {
          await browser.storage.session.set({
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
          style={{
            border: `0.5px solid ${darkModePreference.matches ? '#fff' : '#000'}`,
            marginLeft: '-15px',
          }}
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
            <Space
              direction="vertical"
              size={'middle'}
              style={{ marginTop: 12, marginBottom: 12 }}
            >
              <span>
                {t('cr:copy_sensitive_data_desc', {
                  sensitive_data: t('cr:wallet_seed_phrase'),
                })}
              </span>
              <span>{t('cr:copy_anyone_can_read')}</span>
            </Space>
          }
          overlayStyle={{ maxWidth: 360, margin: 10 }}
          okText={t('common:confirm')}
          cancelText={t('common:cancel')}
          onConfirm={() => {
            setSeedPhraseCopyingVisible(true);
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
      <Modal
        title={t('cr:copy_wallet_seed')}
        open={seedPhraseCopyingVisible}
        onOk={() => setSeedPhraseCopyingVisible(false)}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={() => setSeedPhraseCopyingVisible(false)}
        footer={[
          <Button
            key="ok"
            type="primary"
            onClick={() => setSeedPhraseCopyingVisible(false)}
          >
            {t('cr:finished')}
          </Button>,
        ]}
      >
        <h3>{t('cr:seed_phrase_split')}</h3>
        <Space direction="vertical" size="middle">
          <Button
            type="dashed"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(
                new TextDecoder().decode(
                  mnemonic.slice(0, Math.round(mnemonic.length / 3)),
                ),
              );
              displayMessage('success', t('cr:copied'));
            }}
          >
            {t('cr:copy_part_x', { part: 1 })}
          </Button>
          <Button
            type="dashed"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(
                new TextDecoder().decode(
                  mnemonic.slice(
                    Math.round(mnemonic.length / 3),
                    Math.round(mnemonic.length / 3) * 2,
                  ),
                ),
              );
              displayMessage('success', t('cr:copied'));
            }}
          >
            {t('cr:copy_part_x', { part: 2 })}
          </Button>
          <Button
            type="dashed"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(
                new TextDecoder().decode(
                  mnemonic.slice(
                    Math.round(mnemonic.length / 3) * 2,
                    mnemonic.length,
                  ),
                ),
              );
              displayMessage('success', t('cr:copied'));
            }}
          >
            {t('cr:copy_part_x', { part: 3 })}
          </Button>
        </Space>
      </Modal>
      <PoweredByFlux />
    </>
  );
}

export default Restore;
