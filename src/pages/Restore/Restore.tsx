import { useState, useEffect, useRef } from 'react';
import { toast } from '../../lib/toast';
import { useNavigate } from 'react-router';
import {
  Input,
  Button,
  Checkbox,
  Form,
  Divider,
  Modal,
  Popover,
  Popconfirm,
  Space,
  App,
} from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import { useTranslation } from 'react-i18next';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import {
  CircleAlert as CircleAlertIcon,
  Copy as CopyIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  Lock as LockIcon,
} from 'lucide-react';
import secureLocalStorage from 'react-secure-storage';

import { useAppDispatch } from '../../hooks';
import { useThemeMode } from '../../contexts/ThemeContext';

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
import { resetTutorial } from '../../storage/ssp';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import CreationSteps from '../../components/CreationSteps/CreationSteps.tsx';
import Headerbar from '../../components/Headerbar/Headerbar.tsx';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter/PasswordStrengthMeter.tsx';
import OnboardingPersonalize from '../../components/OnboardingPersonalize/OnboardingPersonalize.tsx';
import PillarCelebration from '../../components/PillarCelebration/PillarCelebration.tsx';
import {
  setWalletMeta,
  setBackupVerified,
  markBackupVerifyNow,
} from '../../storage/walletMeta';
import { generateDefaultWalletName } from '../../storage/walletNames';

// The wallet restored by onboarding is always index 0-0.
const ONBOARDING_WALLET_ID = '0-0';

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
  const { modal } = App.useApp();
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
  const [localPasswordStrength, setLocalPasswordStrength] = useState('');
  const [mnemonic, setMnemonic] = useState<Uint8Array>(new Uint8Array());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mnemonicShow, setMnemonicShow] = useState(false);
  const [WSPbackedUp, setWSPbackedUp] = useState(false);
  const [wspWasShown, setWSPwasShown] = useState(false);
  const [wpCopied, setWpCopied] = useState(false);
  const [seedPhraseCopyingVisible, setSeedPhraseCopyingVisible] =
    useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { isDark } = useThemeMode();
  const [isNarrowScreen, setIsNarrowScreen] = useState(window.innerWidth < 420);
  const canvasWidth = isNarrowScreen ? 290 : 366;
  const canvasHeight = isNarrowScreen ? 240 : 180;
  const columns = isNarrowScreen ? 3 : 4;
  const columnWidth = isNarrowScreen ? 95 : 90;
  const browser = window.chrome || window.browser;

  useEffect(() => {
    const handleResize = () => setIsNarrowScreen(window.innerWidth < 420);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    if (WSPbackedUp && (wspWasShown || wpCopied)) {
      setIsModalOpen(false);
      setPersonalizeOpen(true);
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

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({
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
    if (temporaryPassword) {
      warningWeakPassword();
    }
  }, [temporaryPassword]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font =
          '10px "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace';
        ctx.fillStyle = isDark ? '#fff' : '#000';
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
  }, [mnemonic, mnemonicShow, isModalOpen, isNarrowScreen, isDark]);

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
      icon: <CircleAlertIcon />,
      content: (
        <>
          {t('cr:weak_password_info')}
          <br />
          <br />
          {t('cr:weak_password_confirm')}
        </>
      ),
      okText: t('cr:weak_password_change'),
      cancelText: t('cr:weak_password_keep'),
      onOk() {
        // SAFE choice (primary): discard and let the user pick a stronger password
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
      // Router state only — tells the shell's pairing screen to show the
      // "Import Wallet" wizard labels instead of the Create ones.
      navigate('/home', { state: { imported: true } });
    } else {
      navigate('/welcome');
    }
  };

  const storeMnemonic = (
    mnemonicPhrase: Uint8Array,
    meta?: { name: string; color: string },
  ) => {
    if (!mnemonicPhrase.length) {
      displayMessage('error', t('cr:err_wallet_phrase_invalid'));
      return;
    }
    // first clean all data from localForge and secureLocalStorage
    localStorage.clear();
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
        // Reset tutorial to ensure it shows for restored wallets
        await resetTutorial();
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
        // Append-only personalization keys (written after any localForage.clear()
        // above). Typing the full seed IS proof of backup possession — count it
        // as a verification so the periodic backup checkup starts a fresh
        // 30-day cycle instead of nagging a just-restored wallet.
        setBackupVerified(true);
        markBackupVerifyNow(Date.now());
        if (meta) {
          setWalletMeta(ONBOARDING_WALLET_ID, {
            name: meta.name,
            color: meta.color,
          });
        }
        const reduceMotion = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches;
        setCelebrating(true);
        setTimeout(
          () => {
            navigate('/login');
          },
          reduceMotion ? 900 : 2100,
        );
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
            <TextArea
              rows={4}
              placeholder={t('cr:input_seed_phrase')}
              className="seed-input"
            />
          </Form.Item>
          <br />
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
                <div>
                  <Input.Password
                    size="large"
                    placeholder={t('cr:set_password')}
                    prefix={<LockIcon />}
                    iconRender={(visible) =>
                      visible ? <EyeIcon /> : <EyeOffIcon />
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
                prefix={<LockIcon />}
                iconRender={(visible) =>
                  visible ? <EyeIcon /> : <EyeOffIcon />
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
          width={canvasWidth}
          height={canvasHeight}
          style={{
            border: `0.5px solid ${isDark ? '#fff' : '#000'}`,
            marginLeft: '-15px',
            marginRight: '-15px',
          }}
        />
        {mnemonicShow && (
          <div className="popconfirm-button">
            <Button
              type="dashed"
              icon={<EyeIcon />}
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
            icon={<CircleAlertIcon style={{ color: 'orange' }} />}
          >
            <div className="popconfirm-button">
              <Button type="dashed" icon={<EyeOffIcon />} style={{ margin: 5 }}>
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
          icon={<CircleAlertIcon style={{ color: 'orange' }} />}
        >
          <div className="popconfirm-button">
            <Button type="dashed" icon={<CopyIcon />} style={{ margin: 5 }}>
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
            icon={<CopyIcon />}
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
            icon={<CopyIcon />}
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
            icon={<CopyIcon />}
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
      <OnboardingPersonalize
        open={personalizeOpen}
        defaultName={generateDefaultWalletName(ONBOARDING_WALLET_ID)}
        identiconSeed={ONBOARDING_WALLET_ID}
        isImport={true}
        onContinue={(name, color) => {
          setPersonalizeOpen(false);
          storeMnemonic(mnemonic, { name, color });
        }}
        onBack={() => {
          setPersonalizeOpen(false);
          setIsModalOpen(true);
        }}
      />
      {celebrating && (
        <PillarCelebration
          title={t('cr:ready.title')}
          subtitle={t('cr:ready.subtitle')}
        />
      )}
      <PoweredByFlux />
    </>
  );
}

export default Restore;
