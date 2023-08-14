import { useState, useEffect, useRef } from 'react';
import { Typography, Button, Modal, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';

function Receive(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [xpriv, setXpriv] = useState('');
  const [xpub, setXpub] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
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
        style={{ textAlign: 'center' }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            OK
          </Button>,
        ]}
      >
        <h3>SSP Wallet Mnemonic Seed Phrase:</h3>
        <Paragraph copyable={{ text: seedPhrase }} className="copyableAddress">
          <Text>{seedPhrase}</Text>
        </Paragraph>
        <h3>SSP Wallet Extended Public Key:</h3>
        <Paragraph copyable={{ text: xpub }} className="copyableAddress">
          <Text>{xpub}</Text>
        </Paragraph>
        <h3>SSP Wallet Extended Private Key:</h3>
        <Paragraph copyable={{ text: xpriv }} className="copyableAddress">
          <Text>{xpriv}</Text>
        </Paragraph>
      </Modal>
    </>
  );
}

export default Receive;