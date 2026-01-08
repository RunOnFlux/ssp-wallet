import { useState, useEffect, useRef, JSX } from 'react';
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
  App,
} from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';

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
import { getFingerprint, getRandomParams } from '../../lib/fingerprint';
import { blockchains } from '@storage/blockchains';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import CreationSteps from '../../components/CreationSteps/CreationSteps.tsx';
import Headerbar from '../../components/Headerbar/Headerbar.tsx';
import FloatingHelp from '../../components/FloatingHelp/FloatingHelp.tsx';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter/PasswordStrengthMeter.tsx';
import { wordlist } from '@scure/bip39/wordlists/english.js';

interface passwordForm {
  password: string;
  confirm_password: string;
  tos: boolean;
}

// we always use btc
function Create() {
  const { t } = useTranslation(['cr', 'common']);
  const { modal } = App.useApp();
  const { identityChain } = useAppSelector((state) => state.sspState);
  const blockchainConfig = blockchains[identityChain];
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // use secure local storage for storing mnemonic 'walletSeed', 'xpriv-48-slip-0-0-coin', 'xpub-48-slip-0-0-coin' and '2-xpub-48-slip-0-0-coin' (2- as for second key) of together with encryption of browser-passworder
  // use localforage to store addresses, balances, transactions and other data. This data is not encrypted for performance reasons and they are not sensitive.
  // if user exists, navigate to login
  const [password, setPassword] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [mnemonic, setMnemonic] = useState<Uint8Array>(new Uint8Array());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfrimModalOpen, setIsConfrimModalOpen] = useState(false);
  const browser = window.chrome || window.browser;

  const showModal = () => {
    setIsModalOpen(true);
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
    // check if wallet already exists on mount
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  useEffect(() => {
    if (mnemonic.length) {
      showModal();
    }
  }, [mnemonic]);

  useEffect(() => {
    if (password) {
      generateMnemonicPhrase(256);
    }
  }, [password]);

  useEffect(() => {
    if (temporaryPassword) {
      warningWeakPassword();
      console.log('warningWeakPassword');
    }
  }, [temporaryPassword]);

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
    modal.confirm({
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

  const generateMnemonicPhrase = (entValue: 128 | 256) => {
    let generatedMnemonic: string | null = generateMnemonic(entValue);
    setMnemonic(new TextEncoder().encode(generatedMnemonic));
    // reassign generatedMnemonic to null as it is no longer needed
    generatedMnemonic = null;
  };

  const storeMnemonic = (mnemonicPhrase: Uint8Array) => {
    if (!mnemonicPhrase.length) {
      displayMessage('error', t('cr:err_wallet_phrase_invalid_login'));
      return;
    }
    passworderEncrypt(password, new TextDecoder().decode(mnemonicPhrase))
      .then(async (blob) => {
        localStorage.clear();
        secureLocalStorage.clear();
        await localForage.clear();
        if (browser?.storage?.session) {
          await browser.storage.session.clear();
        }
        const randomParamFingerprint = getFingerprint('forRandomParams');
        // take last 64 bytes from password, thats our random params
        const randomParams = password.slice(-128);
        const randomParamsBlob = await passworderEncrypt(
          randomParamFingerprint,
          randomParams,
        );
        secureLocalStorage.setItem('randomParams', randomParamsBlob);
        secureLocalStorage.setItem('walletSeed', blob);
        // generate master xpriv for btc - default chain
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
        setXpubWallet(identityChain, xpub);
        if (browser?.storage?.session) {
          await browser.storage.session.set({
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

  const PasswordForm = () => {
    const [localPasswordStrength, setLocalPasswordStrength] = useState('');

    return (
      <div style={{ paddingBottom: '43px' }}>
        <Headerbar headerTitle={t('cr:create_pw')} navigateTo="/welcome" />
        <Divider />
        <CreationSteps step={1} import={false} />
        <br />
        <Form
          name="pwdForm"
          initialValues={{ tos: false }}
          onFinish={(values) => void onFinish(values as passwordForm)}
          autoComplete="off"
          layout="vertical"
        >
          <Popover
            placement="top"
            content={t('cr:strong_password')}
            arrow={false}
            styles={{ content: { maxWidth: 300 } }}
          >
            <div className="password-input-container">
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
                <div style={{ position: 'relative' }}>
                  <Input.Password
                    size="large"
                    placeholder={t('cr:set_password')}
                    prefix={<LockOutlined />}
                    iconRender={(visible) =>
                      visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                    }
                    className="password-input"
                    onChange={(e) => {
                      setLocalPasswordStrength(e.target.value);
                    }}
                  />
                  <PasswordStrengthMeter password={localPasswordStrength} />
                </div>
              </Form.Item>
            </div>
          </Popover>
          <div className="password-input-container">
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
          </div>
          <Form.Item name="tos" valuePropName="checked">
            <Checkbox>
              {t('cr:i_agree')}{' '}
              <a
                href="https://sspwallet.io/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('common:terms_of_service')}
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
        <br />
        <br />
      </div>
    );
  };

  const BackupConfirmModal = () => {
    const [mnemonicShow, setMnemonicShow] = useState(false);
    const [wspWasShown, setWSPwasShown] = useState(false);
    const [WSPbackedUp, setWSPbackedUp] = useState(false);
    const [wpCopied, setWpCopied] = useState(false);
    const [seedPhraseCopyingVisible, setSeedPhraseCopyingVisible] =
      useState(false);

    const handleCancel = () => {
      setIsModalOpen(false);
      mnemonic.fill(0);
      setMnemonic(new Uint8Array());
      setPassword('');
      setTemporaryPassword('');
      setWSPwasShown(false);
      setWSPbackedUp(false);
      setMnemonicShow(false);
      setWpCopied(false);
    };

    const handleOk = () => {
      if (WSPbackedUp && (wspWasShown || wpCopied)) {
        setIsModalOpen(false);
        setIsConfrimModalOpen(true);
      } else {
        displayMessage('info', t('cr:info_backup_needed'));
      }
    };

    const onChangeWSP = (e: CheckboxChangeEvent) => {
      if (wspWasShown || wpCopied) {
        setWSPbackedUp(e.target.checked);
      } else {
        displayMessage('info', t('cr:info_backup_needed'));
      }
    };

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const darkModePreference = window.matchMedia(
      '(prefers-color-scheme: dark)',
    );
    const [isNarrowScreen, setIsNarrowScreen] = useState(
      window.innerWidth < 420,
    );

    useEffect(() => {
      const handleResize = () => setIsNarrowScreen(window.innerWidth < 420);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    const canvasWidth = isNarrowScreen ? 290 : 366;
    const canvasHeight = isNarrowScreen ? 240 : 180;
    const columns = isNarrowScreen ? 3 : 4;
    const columnWidth = isNarrowScreen ? 95 : 90;

    useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.font =
            '10px "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace';
          ctx.fillStyle = darkModePreference.matches ? '#fff' : '#000';
          new TextDecoder()
            .decode(mnemonic)
            .split(' ')
            .forEach((word, index) => {
              const x = (index % columns) * columnWidth + 5;
              const y = Math.floor(index / columns) * 30 + 20;
              ctx.fillText(`${index + 1}.`, x, y); // Smaller number above the word
              ctx.font =
                '14px "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace'; // Larger font for the word
              ctx.fillText(mnemonicShow ? word : '*****', x + 20, y);
              ctx.font =
                '10px "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace'; // Reset font for the next number
            });
        }
      }
    }, [mnemonic, mnemonicShow, isNarrowScreen]);

    return (
      <>
        <Modal
          title={t('cr:backup_wallet_seed')}
          open={isModalOpen}
          onOk={handleOk}
          onCancel={handleCancel}
          okText={t('common:confirm')}
          cancelText={t('common:cancel')}
          style={{ textAlign: 'center', top: 60, padding: 10 }}
        >
          <CreationSteps step={2} import={false} />
          <p>{t('cr:wallet_seed_info')}</p>
          <p>{t('cr:keep_seed_safe')}</p>
          <p>
            <b>{t('cr:seed_loose_info')}</b>
          </p>
          <Divider />
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            style={{
              border: `0.5px solid ${darkModePreference.matches ? '#fff' : '#000'}`,
              marginLeft: '-15px',
              marginRight: '-15px',
            }}
          />
          {mnemonicShow && (
            <div className="popconfirm-button">
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
            </div>
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
              classNames={{ container: 'popconfirm-container' }}
              okText={t('common:confirm')}
              cancelText={t('common:cancel')}
              onConfirm={() => {
                setMnemonicShow(!mnemonicShow);
                setWSPwasShown(true);
              }}
              icon={<ExclamationCircleFilled style={{ color: 'orange' }} />}
            >
              <div className="popconfirm-button">
                <Button
                  type="dashed"
                  icon={<EyeInvisibleFilled />}
                  style={{ margin: 5 }}
                >
                  {t('cr:show_mnemonic')} {t('cr:wallet_seed_phrase')}
                </Button>
              </div>
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
            classNames={{ container: 'popconfirm-container' }}
            okText={t('common:confirm')}
            cancelText={t('common:cancel')}
            onConfirm={() => {
              setSeedPhraseCopyingVisible(true);
              setWpCopied(true);
            }}
            icon={<ExclamationCircleFilled style={{ color: 'orange' }} />}
          >
            <div className="popconfirm-button">
              <Button
                type="dashed"
                icon={<CopyOutlined />}
                style={{ margin: 5 }}
              >
                {t('cr:copy_wallet_seed')}
              </Button>
            </div>
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
      </>
    );
  };

  const ConfirmWordsModal = () => {
    const [wordIndex, setWordIndex] = useState(1);
    const [isConfirmed, setIsConfirmed] = useState(false);

    const RandomWord = () => {
      const pos = Math.floor(Math.random() * wordlist.length);
      return wordlist[pos];
    };

    // Generate word list that does not include any words in seedphrase or duplicates
    const generateWordList = () => {
      const randomWordList: string[] = [];
      for (let index = 0; index < 10; index++) {
        const newWord = RandomWord();
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        randomWordList.includes(newWord) ||
        new TextDecoder().decode(mnemonic).split(' ').includes(newWord)
          ? index--
          : randomWordList.push(newWord);
      }
      return randomWordList;
    };

    const incorrectWord = () => {
      displayMessage('warning', t('cr:incorrect_backup_confirmation'));
    };

    const correctWord = () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      wordIndex === 9
        ? setIsConfirmed(true)
        : setWordIndex((prevIndex) => prevIndex + 4);
    };

    const Randomize = (compProps: { wordIndex: number }) => {
      const randomWords: JSX.Element[] = [];
      const generatedWords = generateWordList();
      const realPos = Math.floor(Math.random() * 10);

      generatedWords.map((word: string, index) => {
        if (index === realPos) {
          randomWords.push(
            <Button
              size="large"
              onClick={correctWord}
              key={index}
              style={{ margin: 5 }}
            >
              {
                new TextDecoder().decode(mnemonic).split(' ')[
                  compProps.wordIndex
                ]
              }
            </Button>,
          );
        } else {
          randomWords.push(
            <Button
              size="large"
              onClick={incorrectWord}
              key={index}
              style={{ margin: 5 }}
            >
              {word}
            </Button>,
          );
        }
      });
      return randomWords;
    };

    const handleExit = () => {
      setWordIndex(1);
      setIsConfrimModalOpen(false);
      setIsConfirmed(false);
      setIsModalOpen(true);
    };

    const handleOK = () => {
      setIsConfrimModalOpen(false);
      setIsConfirmed(false);
      storeMnemonic(mnemonic);
    };

    return (
      <Modal
        title={t('cr:backup_wallet_seed')}
        open={isConfrimModalOpen}
        onCancel={handleExit}
        cancelText={t('common:cancel')}
        onOk={handleOK}
        okButtonProps={{ disabled: !isConfirmed }}
        okText={t('cr:create_wallet')}
        style={{ textAlign: 'center', top: 60, padding: 10 }}
      >
        <CreationSteps step={2} import={false} />
        {isConfirmed && (
          <div style={{ marginBottom: 80, marginTop: 60 }}>
            <h2>{t('cr:backup_confirmed')}</h2>
          </div>
        )}

        {!isConfirmed && (
          <div style={{ marginBottom: 60 }}>
            <h2>
              {t('cr:confirm_wallet_seed_word')}
              <br /> {t('cr:word_number', { number: wordIndex + 1 })}
            </h2>
            <Randomize wordIndex={wordIndex} />
          </div>
        )}
      </Modal>
    );
  };

  return (
    <>
      {contextHolder}
      <PasswordForm />
      <BackupConfirmModal />
      <ConfirmWordsModal />
      <FloatingHelp showGuide={true} />
      <PoweredByFlux />
    </>
  );
}

export default Create;
