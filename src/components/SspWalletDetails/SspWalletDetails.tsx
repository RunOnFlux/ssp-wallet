import { useState, useEffect, useRef } from 'react';
import { Typography, Button, Modal, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';

function SSPWalletDetails(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [xpriv, setXpriv] = useState('');
  const [xpub, setXpub] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [extendedPublicKeyVisible, setExtendedPublicKeyVisible] =
    useState(false);
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
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    generateAddressInformation();
  });

  const handleOk = () => {
    setExtendedPrivateKeyVisible(false);
    setExtendedPublicKeyVisible(false);
    setSeedPhraseVisible(false);
    openAction(false);
  };

  const generateAddressInformation = () => {
    // get our password to decrypt xpriv from secure storage
    const fingerprint: string = getFingerprint();
    passworderDecrypt(fingerprint, passwordBlob)
      .then(async (password) => {
        if (typeof password !== 'string') {
          throw new Error('Password is not valid.');
        }
        const xprivFluxBlob = secureLocalStorage.getItem('xpriv-48-19167-0-0');
        if (typeof xprivFluxBlob !== 'string') {
          throw new Error('Invalid wallet xpriv');
        }
        const xprivFlux = await passworderDecrypt(password, xprivFluxBlob);
        if (typeof xprivFlux !== 'string') {
          throw new Error('Invalid wallet xpriv, unable to decrypt');
        }
        setXpriv(xprivFlux);

        const xpubFluxBlob = secureLocalStorage.getItem('xpub-48-19167-0-0');
        if (typeof xpubFluxBlob !== 'string') {
          throw new Error('Invalid wallet xpub');
        }
        const xpubFlux = await passworderDecrypt(password, xpubFluxBlob);
        if (typeof xpubFlux !== 'string') {
          throw new Error('Invalid wallet xpub, unable to decrypt');
        }
        setXpub(xpubFlux);
        const walletSeedBlob = secureLocalStorage.getItem('walletSeed');
        if (typeof walletSeedBlob !== 'string') {
          throw new Error('Invalid wallet seed');
        }
        const walletSeed = await passworderDecrypt(password, walletSeedBlob);
        if (typeof walletSeed !== 'string') {
          throw new Error('Invalid wallet xpub, unable to decrypt');
        }
        setSeedPhrase(walletSeed);
      })
      .catch((error) => {
        console.log(error);
        displayMessage(
          'error',
          'Code S1: Something went wrong while decrypting password.',
        );
      });
  };

  return (
    <>
      {contextHolder}
      <Modal
        title="FLUX SSP Wallet Details (BIP-48)"
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            OK
          </Button>,
        ]}
      >
        <h3>
          {seedPhraseVisible && (
            <EyeTwoTone onClick={() => setSeedPhraseVisible(false)} />
          )}
          {!seedPhraseVisible && (
            <EyeInvisibleOutlined onClick={() => setSeedPhraseVisible(true)} />
          )}{' '}
          SSP Wallet Mnemonic Seed Phrase:
        </h3>
        <Paragraph copyable={{ text: seedPhrase }} className="copyableAddress">
          <Text>
            {seedPhraseVisible ? seedPhrase : '*** *** *** *** *** ***'}
          </Text>
        </Paragraph>
        <h3>
          {extendedPublicKeyVisible && (
            <EyeTwoTone onClick={() => setExtendedPublicKeyVisible(false)} />
          )}
          {!extendedPublicKeyVisible && (
            <EyeInvisibleOutlined
              onClick={() => setExtendedPublicKeyVisible(true)}
            />
          )}{' '}
          SSP Wallet Extended Public Key:
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
          SSP Wallet Extended Private Key:
        </h3>
        <Paragraph copyable={{ text: xpriv }} className="copyableAddress">
          <Text>
            {extendedPrivateKeyVisible ? xpriv : '*** *** *** *** *** ***'}
          </Text>
        </Paragraph>
      </Modal>
    </>
  );
}

export default SSPWalletDetails;
