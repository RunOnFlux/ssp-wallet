import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Input, Button, Checkbox, Form, Divider, message, Modal } from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';

import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
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
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import CreationSteps from '../../components/CreationSteps/CreationSteps.tsx';
import Headerbar from '../../components/Headerbar/Headerbar.tsx';
import { wordlist } from '@scure/bip39/wordlists/english';

interface passwordForm {
  password: string;
  confirm_password: string;
  tos: boolean;
}

// we always use btc
function Create() {
  const { t } = useTranslation(['cr', 'common']);
  const { identityChain } = useAppSelector((state) => state.sspState);
  const blockchainConfig = blockchains[identityChain];
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // use secure local storage for storing mnemonic 'walletSeed', 'xpriv-48-slip-0-0-coin', 'xpub-48-slip-0-0-coin' and '2-xpub-48-slip-0-0-coin' (2- as for second key) of together with encryption of browser-passworder
  // use localforage to store addresses, balances, transactions and other data. This data is not encrypted for performance reasons and they are not sensitive.
  // if user exists, navigate to login
  const [password, setPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfrimModalOpen, setIsConfrimModalOpen] = useState(false);

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
        secureLocalStorage.clear();
        await localForage.clear();
        if (chrome?.storage?.session) {
          await chrome.storage.session.clear();
        }
        secureLocalStorage.setItem('walletSeed', blob);
        // generate master xpriv for btc - default chain
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
        if (chrome?.storage?.session) {
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

  const PasswordForm = () => {
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

    const handleCancel = () => {
      setIsModalOpen(false);
      setMnemonic('');
      setPassword('');
      setWSPwasShown(false);
      setWSPbackedUp(false);
      setMnemonicShow(false);
    };

    const handleOk = () => {
      if (WSPbackedUp && wspWasShown) {
        setIsModalOpen(false);
        setIsConfrimModalOpen(true);
      } else {
        displayMessage('info', t('cr:info_backup_needed'));
      }
    };

    const onChangeWSP = (e: CheckboxChangeEvent) => {
      if (wspWasShown) {
        setWSPbackedUp(e.target.checked);
      } else {
        displayMessage('info', t('cr:info_backup_needed'));
      }
    };

    return (
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
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            setMnemonicShow(!mnemonicShow), setWSPwasShown(true);
          }}
        >
          {mnemonicShow ? t('cr:hide_mnemonic') : t('cr:show_mnemonic')}{' '}
          {t('cr:wallet_seed_phrase')}
        </Button>
        <Divider />
        <br />
        <Checkbox disabled={!wspWasShown} onChange={onChangeWSP}>
          {t('cr:phrase_backed_up')}
        </Checkbox>
        <br />
        <br />
      </Modal>
    );
  };

  const ConfirmWordsModal = () => {
    const [wordIndex, setWordIndex] = useState(1);
    const [isConfirmed, setIsConfirmed] = useState(false);

    const RandomWord = () => {
      const pos = Math.floor(Math.random() * (wordlist.length + 1));
      return wordlist[pos];
    };

    // Generate word list that does not include any words in seedphrase or duplicates
    const generateWordList = () => {
      const randomWordList: string[] = [];
      for (let index = 0; index < 10; index++) {
        const newWord = RandomWord();
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        randomWordList.includes(newWord) || mnemonic.includes(newWord)
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
              {mnemonic.split(' ')[compProps.wordIndex]}
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
      <PoweredByFlux />
    </>
  );
}

export default Create;
