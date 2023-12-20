import { useState, useEffect } from 'react';
import { Typography, Button, Modal, message, Space, QRCode } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { getScriptType } from '../../lib/wallet';

function SSPWalletDetails(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { activeChain } = useAppSelector((state) => state.sspState);
  const blockchainConfig = blockchains[activeChain];
  const { t } = useTranslation(['home', 'common']);
  const [xpriv, setXpriv] = useState('');
  const [xpub, setXpub] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [extendedPublicKeyVisible, setExtendedPublicKeyVisible] =
    useState(false);
  const [chainSyncKeyVisible, setChainSyncKeyVisible] = useState(false);
  const [extendedPrivateKeyVisible, setExtendedPrivateKeyVisible] =
    useState(false);
  const [seedPhraseVisible, setSeedPhraseVisible] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  // SSP is seedPhrase, xpub, xpriv
  const { open, openAction } = props;
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    generateAddressInformation();
  }, [activeChain]);

  const handleOk = () => {
    setExtendedPrivateKeyVisible(false);
    setExtendedPublicKeyVisible(false);
    setChainSyncKeyVisible(false);
    setSeedPhraseVisible(false);
    openAction(false);
  };

  const generateAddressInformation = () => {
    // get our password to decrypt xpriv from secure storage
    const fingerprint: string = getFingerprint();
    passworderDecrypt(fingerprint, passwordBlob)
      .then(async (password) => {
        if (typeof password !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_pw_not_valid'));
        }
        const xprivBlob = secureLocalStorage.getItem(
          `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (typeof xprivBlob !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_xpriv'));
        }
        const xprivChain = await passworderDecrypt(password, xprivBlob);
        if (typeof xprivChain !== 'string') {
          throw new Error(
            t('home:sspWalletDetails.err_invalid_wallet_xpriv_2'),
          );
        }
        setXpriv(xprivChain);

        const xpubBlob = secureLocalStorage.getItem(
          `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (typeof xpubBlob !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_xpub'));
        }
        const xpubChain = await passworderDecrypt(password, xpubBlob);
        if (typeof xpubChain !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_xpub_2'));
        }
        setXpub(xpubChain);
        const walletSeedBlob = secureLocalStorage.getItem('walletSeed');
        if (typeof walletSeedBlob !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_seed'));
        }
        const walletSeed = await passworderDecrypt(password, walletSeedBlob);
        if (typeof walletSeed !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_seed_2'));
        }
        setSeedPhrase(walletSeed);
      })
      .catch((error) => {
        console.log(error);
        displayMessage('error', t('home:sspWalletDetails.err_s1'));
      });
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:sspWalletDetails.ssp_bip', {
          chain: blockchainConfig.symbol,
        })}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            {t('common:ok')}
          </Button>,
        ]}
      >
        <h3>
          {chainSyncKeyVisible && (
            <EyeTwoTone onClick={() => setChainSyncKeyVisible(false)} />
          )}
          {!chainSyncKeyVisible && (
            <EyeInvisibleOutlined
              onClick={() => setChainSyncKeyVisible(true)}
            />
          )}{' '}
          {t('home:sspWalletDetails.chain_sync_ssp_key', {
            chain: blockchainConfig.name,
          })}
          :
        </h3>
        <Space direction="vertical" size="small">
          {chainSyncKeyVisible && (
            <QRCode
              errorLevel="H"
              value={activeChain + ':' + xpub}
              icon="/ssp-logo-black.svg"
              size={256}
              style={{ margin: '0 auto' }}
            />
          )}
          <Paragraph
            copyable={{ text: activeChain + ':' + xpub }}
            className="copyableAddress"
          >
            <Text>
              {chainSyncKeyVisible
                ? activeChain + ':' + xpub
                : '*** *** *** *** *** ***'}
            </Text>
          </Paragraph>
        </Space>
        <h3>
          {extendedPublicKeyVisible && (
            <EyeTwoTone onClick={() => setExtendedPublicKeyVisible(false)} />
          )}
          {!extendedPublicKeyVisible && (
            <EyeInvisibleOutlined
              onClick={() => setExtendedPublicKeyVisible(true)}
            />
          )}{' '}
          {t('home:sspWalletDetails.chain_extended_pub', {
            chain: blockchainConfig.name,
          })}
          :
        </h3>
        <Paragraph copyable={{ text: xpub }} className="copyableAddress">
          <Text>
            {extendedPublicKeyVisible ? xpub : '*** *** *** *** *** ***'}
          </Text>
        </Paragraph>
        <h3>
          {extendedPrivateKeyVisible && (
            <EyeTwoTone onClick={() => setExtendedPrivateKeyVisible(false)} />
          )}
          {!extendedPrivateKeyVisible && (
            <EyeInvisibleOutlined
              onClick={() => setExtendedPrivateKeyVisible(true)}
            />
          )}{' '}
          {t('home:sspWalletDetails.chain_extended_priv', {
            chain: blockchainConfig.name,
          })}
          :
        </h3>
        <Paragraph copyable={{ text: xpriv }} className="copyableAddress">
          <Text>
            {extendedPrivateKeyVisible ? xpriv : '*** *** *** *** *** ***'}
          </Text>
        </Paragraph>
        <h3>
          {seedPhraseVisible && (
            <EyeTwoTone onClick={() => setSeedPhraseVisible(false)} />
          )}
          {!seedPhraseVisible && (
            <EyeInvisibleOutlined onClick={() => setSeedPhraseVisible(true)} />
          )}{' '}
          {t('home:sspWalletDetails.ssp_mnemonic')}:
        </h3>
        <Paragraph copyable={{ text: seedPhrase }} className="copyableAddress">
          <Text>
            {seedPhraseVisible ? seedPhrase : '*** *** *** *** *** ***'}
          </Text>
        </Paragraph>
      </Modal>
    </>
  );
}

export default SSPWalletDetails;
