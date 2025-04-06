import { useState, useEffect } from 'react';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import localForage from 'localforage';
import { Modal, QRCode, Button, Input, message, Space, Typography } from 'antd';
const { Paragraph, Text } = Typography;
import { NoticeType } from 'antd/es/message/interface';
import secureLocalStorage from 'react-secure-storage';
import axios from 'axios';

import './Key.css';

import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import { getFingerprint } from '../../lib/fingerprint';
import { generateMultisigAddress, getScriptType } from '../../lib/wallet.ts';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { syncSSPRelay } from '../../types';
import { setXpubKey, setActiveChain } from '../../store';
import CreationSteps from '../../components/CreationSteps/CreationSteps.tsx';

import { sspConfig } from '@storage/ssp';

const { TextArea } = Input;
const { confirm } = Modal;

const xpubRegex = /^([a-zA-Z]{2}ub[1-9A-HJ-NP-Za-km-z]{79,140})$/; // xpub start is the most usual, but can also be Ltub

let pollingSyncInterval: string | number | NodeJS.Timeout | undefined;
let syncRunning = false;

function Key(props: { synchronised: (status: boolean) => void }) {
  const { t } = useTranslation(['home', 'common']);
  const { synchronised } = props;
  const [isModalKeyOpen, setIsModalKeyOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyAutomaticInput, setKeyAutomaticInput] = useState('');
  const [keyInputVisible, setKeyInputVisible] = useState(false);
  const { sspWalletInternalIdentity, activeChain, identityChain } =
    useAppSelector((state) => state.sspState);
  const dispatch = useAppDispatch();
  const { xpubKey, xpubWallet } = useAppSelector((state) => state[activeChain]);
  const [isSSPKeyDownloadOpen, setIsSSPKeyDownloadOpen] = useState(false);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const [messageApi, contextHolder] = message.useMessage();
  const blockchainConfig = blockchains[activeChain];
  const derivationPath = `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
    blockchainConfig.scriptType,
  )}-${blockchainConfig.id}`;
  const isIdentityChain = activeChain === identityChain;
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };
  useEffect(() => {
    console.log('Hello');
    // check if we have 2-xpub-48-slip-0-ScriptType-coin
    if (!xpubKey) {
      // no xpubKey, show modal of Key
      setIsModalKeyOpen(true);
      // start polling
      checkSynced();
      if (pollingSyncInterval) {
        clearInterval(pollingSyncInterval);
      }
      pollingSyncInterval = setInterval(() => {
        checkSynced();
      }, 1000);
    }
  }, [xpubWallet, activeChain]);

  const checkSynced = () => {
    if (!syncRunning && sspWalletInternalIdentity) {
      axios
        .get<syncSSPRelay>(
          `https://${sspConfig().relay}/v1/sync/${sspWalletInternalIdentity}`,
        )
        .then(async (res) => {
          if (res.data.chain !== activeChain) {
            return;
          }
          console.log(res);
          const xpubKey = res.data.keyXpub;
          const wkIdentity = res.data.wkIdentity;
          const sspKeyGeneratedAddress = res.data.generatedAddress;
          // check that wkIdentity is correct
          if (activeChain === identityChain) {
            const generatedSspWalletKeyIdentity = generateMultisigAddress(
              xpubWallet,
              xpubKey,
              10,
              0,
              activeChain,
            );
            const generatedWkIdentity = generatedSspWalletKeyIdentity.address;
            if (generatedWkIdentity !== wkIdentity) {
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
          } else {
            const generatedAddress = generateMultisigAddress(
              xpubWallet,
              xpubKey,
              0,
              0,
              activeChain,
            );
            if (
              sspKeyGeneratedAddress &&
              generatedAddress.address !== sspKeyGeneratedAddress
            ) {
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
          }
          if (res.data.publicNonces) {
            // ssp key can send us newly generated public nonces. Replace our nonces with these
            const sspKeyPublicNonces = res.data.publicNonces;
            await localForage
              .setItem('sspKeyPublicNonces', sspKeyPublicNonces)
              .catch((error) => console.log(error)); // we do not need to throw an error
          }
          // synced ok
          syncRunning = false;
          if (pollingSyncInterval) {
            clearInterval(pollingSyncInterval);
          }

          setKeyInput(xpubKey);
          setKeyAutomaticInput(xpubKey);
        })
        .catch((error) => {
          console.log(error);
          syncRunning = false;
        });
    }
  };

  useEffect(() => {
    if (keyAutomaticInput) {
      console.log('keyAutomaticInput', keyAutomaticInput);
      handleOkModalKey();
    }
  }, [keyAutomaticInput]);

  const handleOkModalKey = () => {
    // display dialog awaiting synchronisation. This is automatic stuff
    console.log(keyAutomaticInput);
    if (!keyInput && !keyAutomaticInput) {
      displayMessage(
        'warning',
        identityChain
          ? t('home:key.warn_await_sync')
          : t('home:key.warn_await_sync_chain', {
              chain: blockchainConfig.name,
            }),
      );
      return;
    }
    const xpubKeyInput = keyInput || keyAutomaticInput;
    // validate xpub key is correct
    if (xpubKeyInput.trim() === xpubWallet.trim()) {
      displayMessage(
        'error',
        identityChain
          ? t('home:key.err_sync_1')
          : t('home:key.err_sync_1_chain', { chain: blockchainConfig.name }),
      );
      return;
    }
    if (xpubRegex.test(xpubKeyInput)) {
      // alright we are in business
      let keyValid = true;
      // try generating an address from it
      try {
        generateMultisigAddress(xpubWallet, xpubKeyInput, 0, 0, activeChain);
      } catch (error) {
        console.log(error);
        keyValid = false;
        displayMessage('error', t('home:key.err_invalid_key'));
      }
      if (!keyValid) return;
      const xpub2 = xpubKeyInput;
      setXpubKey(activeChain, xpub2);
      const fingerprint: string = getFingerprint();

      passworderDecrypt(fingerprint, passwordBlob)
        .then(async (password) => {
          // encrypt xpub of key it and store it to secure storage
          if (typeof password === 'string') {
            const encryptedXpub2 = await passworderEncrypt(password, xpub2);
            secureLocalStorage.setItem(`2-${derivationPath}`, encryptedXpub2);
            // now we have both xpubWallet and xpubKey
            // open our wallet
            setIsModalKeyOpen(false);
            setKeyInputVisible(false);
            setKeyInput('');
            setKeyAutomaticInput('');
            synchronised(true);
            if (pollingSyncInterval) {
              clearInterval(pollingSyncInterval);
            }
            // tell parent that all is synced
          } else {
            displayMessage('error', t('home:key.err_k2'));
          }
        })
        .catch((e) => {
          console.log(e);
          displayMessage('error', t('home:key.err_k1'));
        });
    } else {
      displayMessage('error', t('home:key.err_invalid_key'));
    }
  };

  const handleCancelModalKey = () => {
    // display confirmation dialog and tell that we are 2fa. If no Key, log out.
    showConfirmCancelModalKey();
  };

  const logoutOrSwitchChain = () => {
    try {
      setKeyInputVisible(false);
      setKeyInput('');
      setKeyAutomaticInput('');
      if (activeChain !== identityChain) {
        dispatch(setActiveChain(identityChain));
        void (async function () {
          await localForage.setItem('activeChain', identityChain);
          setTimeout(() => {
            setIsModalKeyOpen(false);
            synchronised(true);
          }, 50);
        })();
      } else {
        // tell parent of failiure to logout
        synchronised(false);
      }
      if (pollingSyncInterval) {
        clearInterval(pollingSyncInterval);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const showConfirmCancelModalKey = () => {
    confirm({
      title: isIdentityChain
        ? t('home:key.cancel_sync_q')
        : t('home:key.cancel_sync_q_chain', { chain: blockchainConfig.name }),
      icon: <ExclamationCircleFilled />,
      okText: t('home:key.cancel_sync'),
      cancelText: t('home:key.back_to_sync'),
      content: isIdentityChain
        ? t('home:key.sync_info_content')
        : t('home:key.sync_info_content_chain', {
            chain: blockchainConfig.name,
          }),
      onOk() {
        logoutOrSwitchChain();
      },
      onCancel() {
        console.log('Cancel, just hide confirmation dialog');
      },
    });
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={
          isIdentityChain
            ? t('home:key.dual_factor_key')
            : t('home:key.dual_factor_key_chain', {
                chain: blockchainConfig.name,
              })
        }
        open={isModalKeyOpen}
        onOk={handleOkModalKey}
        onCancel={handleCancelModalKey}
        cancelText={t('common:cancel')}
        okText={
          isIdentityChain
            ? t('home:key.sync_key')
            : t('home:key.sync_key_chain', { chain: blockchainConfig.name })
        }
        style={{ textAlign: 'center', top: 60 }}
      >
        {isIdentityChain && <CreationSteps step={3} import={false} />}
        <p>{t('home:key.sync_info_1')}</p>
        <b>
          {isIdentityChain
            ? t('home:key.sync_info_2')
            : t('home:key.sync_info_2_chain', { chain: blockchainConfig.name })}
        </b>
        <br />
        <br />
        <Space direction="vertical" size="small" style={{ marginBottom: 25 }}>
          <QRCode
            errorLevel="H"
            value={
              isIdentityChain ? xpubWallet : `${activeChain}:${xpubWallet}`
            }
            icon="/ssp-logo-black.svg"
            size={256}
            style={{ margin: '0 auto' }}
          />
          <Paragraph
            copyable={{
              text: isIdentityChain
                ? xpubWallet
                : `${activeChain}:${xpubWallet}`,
            }}
            className="copyableAddress"
          >
            <Text>
              {isIdentityChain ? xpubWallet : `${activeChain}:${xpubWallet}`}
            </Text>
          </Paragraph>
        </Space>
        {!keyInputVisible && (
          <Button
            type="link"
            block
            size="small"
            onClick={() => setKeyInputVisible(true)}
          >
            {t('home:key.issues_syncing')}
          </Button>
        )}
        {keyInputVisible && (
          <>
            <TextArea
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={t('home:key.input_xpub', {
                path: derivationPath,
                chain: blockchainConfig.name,
              })}
              autoSize
            />
          </>
        )}
        {isIdentityChain && (
          <>
            <br />
            <br />
            <Button
              type="link"
              block
              size="large"
              onClick={() => setIsSSPKeyDownloadOpen(true)}
            >
              {t('home:key.ssp_key_download_here')}
            </Button>
          </>
        )}
        <br />
        <br />
      </Modal>
      <Modal
        title={t('home:key.setup_ssp_key')}
        open={isSSPKeyDownloadOpen}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={() => setIsSSPKeyDownloadOpen(false)}
        footer={
          <Button type="primary" onClick={() => setIsSSPKeyDownloadOpen(false)}>
            {t('home:key.ssp_key_ready')}
          </Button>
        }
      >
        <p>
          <b>{t('home:key.ssp_key_2fa')}</b>
        </p>
        <p>{t('home:key.ssp_key_download')}</p>
        <Space direction="vertical" size="small">
          <QRCode
            errorLevel="H"
            value="https://sspwallet.io/download/ssp-key"
            icon="/ssp-logo-black.svg"
            size={256}
            style={{ margin: '0 auto' }}
          />
          <Paragraph
            copyable={{
              text: 'https://sspwallet.io/download/ssp-key',
            }}
            className="copyableAddress"
          >
            <Text>https://sspwallet.io/download/ssp-key</Text>
          </Paragraph>
        </Space>
        <p>{t('home:key.ssp_key_download_2')}</p>
        <p>
          <b>{t('home:key.ssp_key_download_3')}</b>
        </p>
      </Modal>
    </>
  );
}

export default Key;
