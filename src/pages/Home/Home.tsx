import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useAppDispatch } from '../../hooks';
import { setXpubInitialState, setXpubKey } from '../../store';
import { Spin, Row, Col, Modal, QRCode, Button, Input, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import { getFingerprint } from '../../lib/fingerprint';
const { TextArea } = Input;
const { confirm } = Modal;
import './Home.css';
import secureLocalStorage from 'react-secure-storage';

const xpubRegex = /^(xpub[1-9A-HJ-NP-Za-km-z]{79,108})$/; // /^([xyYzZtuUvV]pub[1-9A-HJ-NP-Za-km-z]{79,108})$/; later

function App() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isModalKeyOpen, setIsModalKeyOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [keyInputVisible, setKeyInputVisible] = useState(false);
  const { xpubKey, xpubWallet, passwordBlob } = useAppSelector(
    (state) => state.xpubs,
  );
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!xpubWallet) {
      // we do not have it in redux, navigate to login
      navigate('/login');
      return;
    }
    // check if we have 2-xpub-48-19167-0-0
    if (!xpubKey) {
      // no xpubKey, show modal of Key
      setIsModalKeyOpen(true);
    }
    // if not, show modal. onModal close check 2-xpub again
    // if user exists, navigate to login
    setIsLoading(false);
  });

  const handleOkModalKey = () => {
    // display dialog awaiting synchronisation. This is automatic stuff
    console.log('here');
    if (!keyInput) {
      displayMessage(
        'warning',
        'Awaiting SSP Key synhronisation or manual input',
      );
      return;
    }
    // validate xpub key is correct
    if (xpubRegex.test(keyInput)) {
      // alright we are in business
      const xpub2 = keyInput;
      dispatch(setXpubKey(xpub2));
      const fingerprint: string = getFingerprint();

      passworderDecrypt(fingerprint, passwordBlob)
        .then(async (password) => {
          console.log(password);
          // encrypt xpub of key it and store it to secure storage
          if (typeof password === 'string') {
            const encryptedXpub2 = await passworderEncrypt(password, xpub2);
            secureLocalStorage.setItem('2-xpub-48-19167-0-0', encryptedXpub2);
            // now we have both xpubWallet and xpubKey
            // open our wallet
            setIsModalKeyOpen(false);
            setKeyInputVisible(false);
            setKeyInput('');
          } else {
            displayMessage(
              'error',
              'Code H2: Something went wrong while decrypting password.',
            );
          }
        })
        .catch((e) => {
          console.log(e);
          displayMessage(
            'error',
            'Code H1: Something went wrong while decrypting password.',
          );
        });
    } else {
      displayMessage('error', 'Invalid SSP Key.');
    }
  };

  const handleCancelModalKey = () => {
    // display confirmation dialog and tell that we are 2fa. If no Key, log out.
    showConfirmCancelModalKey();
  };

  const logout = async () => {
    try {
      setKeyInputVisible(false);
      setKeyInput('');
      if (chrome?.storage?.session) {
        // if different browser we will need to be inputting password every time
        await chrome.storage.session.clear();
      }
      dispatch(setXpubInitialState());
      navigate('/login');
    } catch (error) {
      console.log(error);
    }
  };

  const showConfirmCancelModalKey = () => {
    confirm({
      title: 'Cancel SSP Key Sync?',
      icon: <ExclamationCircleFilled />,
      okText: 'Cancel SSP Sync',
      cancelText: 'Back to SSP Key Sync',
      content:
        'SSP Wallet cannot be used without SSP Key. This will log you out of SSP Wallet.',
      onOk() {
        logout().catch((e) => console.log(e));
      },
      onCancel() {
        console.log('Cancel, just hidden');
      },
    });
  };

  return (
    <>
      {contextHolder}
      {isLoading && <Spin size="large" />}
      {!isLoading && (
        <>
          <Row>
            <Col span={4}>logo</Col>
            <Col span={16}>Wallet 1</Col>
            <Col span={4}>lock</Col>
          </Row>
          header - logo, Wallet 1, settings, lock address 0.0 FLUX usd value
          actions - send, receive transactions
        </>
      )}
      {xpubWallet}
      {xpubKey}
      <Modal
        title="Dual Factor SSP Key"
        open={isModalKeyOpen}
        onOk={handleOkModalKey}
        onCancel={handleCancelModalKey}
        okText="Sync Key"
        style={{ textAlign: 'center' }}
      >
        <p>
          SSP Wallet is a Dual Signature Wallet. You will need to download SSP
          Key on your mobile device to access your wallet.
        </p>
        <b>
          Scan the following QR code to sync your SSP Wallet with your SSP Key.
        </b>
        <br />
        <br />
        <QRCode
          errorLevel="H"
          value={xpubWallet}
          icon="/ssp-logo.svg"
          size={256}
          style={{ margin: '0 auto' }}
        />
        <br />
        {!keyInputVisible && (
          <Button
            type="link"
            block
            size="small"
            onClick={() => setKeyInputVisible(true)}
          >
            Issues syncing? Manual Input
          </Button>
        )}
        {keyInputVisible && (
          <>
            <TextArea
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Input Extended Public Key xpub-48-19167-0-0 of SSP Key here"
              autoSize
            />
          </>
        )}
        <br />
        <br />
      </Modal>
    </>
  );
}

export default App;
