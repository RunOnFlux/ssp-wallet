import { useState, useEffect, useRef } from 'react';
import { Typography, Button, Modal, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { generateAddressKeypair } from '../../lib/wallet';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';

function Receive(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [privKey, setPrivKey] = useState('');
  const [messageApi, contextHolder] = message.useMessage();
  // private key, redeemScript, address
  const { open, openAction } = props;
  const { address, redeemScript } = useAppSelector((state) => state.flux);
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
        const keyPair = generateAddressKeypair(xprivFlux, 0, 0, 'flux');
        setPrivKey(keyPair.privKey);
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
        title="FLUX Address Details (BIP-48)"
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
        <h3>Wallet Address:</h3>
        <Paragraph copyable={{ text: address }} className="copyableAddress">
          <Text>{address}</Text>
        </Paragraph>
        <h3>Wallet Redeem Script:</h3>
        <Paragraph
          copyable={{ text: redeemScript }}
          className="copyableAddress"
        >
          <Text>{redeemScript}</Text>
        </Paragraph>
        <h3>Wallet Private Key:</h3>
        <Paragraph copyable={{ text: privKey }} className="copyableAddress">
          <Text>{privKey}</Text>
        </Paragraph>
      </Modal>
    </>
  );
}

export default Receive;
