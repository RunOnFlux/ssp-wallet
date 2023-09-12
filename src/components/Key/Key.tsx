import { useState, useEffect, useRef } from 'react';
import { useAppSelector } from '../../hooks';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useAppDispatch } from '../../hooks';
import { setXpubKey } from '../../store';
import { Modal, QRCode, Button, Input, message, Space, Typography } from 'antd';
const { Paragraph, Text } = Typography;
import { NoticeType } from 'antd/es/message/interface';
import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import { getFingerprint } from '../../lib/fingerprint';
const { TextArea } = Input;
const { confirm } = Modal;
import './Key.css';
import secureLocalStorage from 'react-secure-storage';
import { generateMultisigAddress } from '../../lib/wallet.ts';
import axios from 'axios';
import { syncSSPRelay } from '../../types';
import { sspConfig } from '@storage/ssp';

const xpubRegex = /^(xpub[1-9A-HJ-NP-Za-km-z]{79,108})$/; // /^([xyYzZtuUvV]pub[1-9A-HJ-NP-Za-km-z]{79,108})$/; later

let pollingSyncInterval: string | number | NodeJS.Timer | undefined;
let syncRunning = false;

function Key(props: {
  derivationPath?: string;
  synchronised: (status: boolean) => void;
}) {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const { derivationPath = 'xpub-48-19167-0-0', synchronised } = props;
  const dispatch = useAppDispatch();
  const [isModalKeyOpen, setIsModalKeyOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyAutomaticInput, setKeyAutomaticInput] = useState('');
  const [keyInputVisible, setKeyInputVisible] = useState(false);
  const { xpubKey, xpubWallet, sspWalletIdentity } = useAppSelector(
    (state) => state.flux,
  );
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
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
    // check if we have 2-xpub-48-19167-0-0
    if (!xpubKey) {
      // no xpubKey, show modal of Key
      setIsModalKeyOpen(true);
      // start polling
      checkSynced();
      pollingSyncInterval = setInterval(() => {
        checkSynced();
      }, 1000);
    }
  });

  const checkSynced = () => {
    // check if we have 2-xpub-48-19167-0-0
    if (!syncRunning && sspWalletIdentity) {
      axios
        .get<syncSSPRelay>(
          `https://${sspConfig().relay}/v1/sync/${sspWalletIdentity}`,
        )
        .then((res) => {
          console.log(res);
          const xpubKey = res.data.keyXpub;
          const wkIdentity = res.data.wkIdentity;
          // check that wkIdentity is correct
          const generatedSspWalletKeyIdentity = generateMultisigAddress(
            xpubWallet,
            xpubKey,
            10,
            0,
            'flux',
          );
          const generatedWkIdentity = generatedSspWalletKeyIdentity.address;
          if (generatedWkIdentity !== wkIdentity) {
            displayMessage(
              'error',
              'Synchronisation failed. Please try again manually.',
            );
            syncRunning = false;
            if (pollingSyncInterval) {
              clearInterval(pollingSyncInterval);
            }
            return;
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
        'Awaiting SSP Key synchronisation or manual input.',
      );
      return;
    }
    const xpubKeyInput = keyInput || keyAutomaticInput;
    // validate xpub key is correct
    if (xpubKeyInput.trim() === xpubWallet.trim()) {
      displayMessage(
        'error',
        'Please input SSP Key XPUB. SSP Key XPUB is different than SSP Wallet XPUB.',
      );
      return;
    }
    if (xpubRegex.test(xpubKeyInput)) {
      // alright we are in business
      let keyValid = true;
      // try generating an address from it
      try {
        generateMultisigAddress(xpubWallet, xpubKeyInput, 0, 0, 'flux');
      } catch (error) {
        keyValid = false;
        displayMessage('error', 'Invalid SSP Key.');
      }
      if (!keyValid) return;
      const xpub2 = xpubKeyInput;
      dispatch(setXpubKey(xpub2));
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

  const logout = () => {
    try {
      setKeyInputVisible(false);
      setKeyInput('');
      setKeyAutomaticInput('');
      // tell parent of failiure to logout
      synchronised(false);
      if (pollingSyncInterval) {
        clearInterval(pollingSyncInterval);
      }
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
        logout();
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
        title="Dual Factor SSP Key"
        open={isModalKeyOpen}
        onOk={handleOkModalKey}
        onCancel={handleCancelModalKey}
        okText="Sync Key"
        style={{ textAlign: 'center', top: 60 }}
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
        <Space direction="vertical" size="small" style={{ marginBottom: 25 }}>
          <QRCode
            errorLevel="H"
            value={xpubWallet}
            icon="/ssp-logo.svg"
            size={256}
            style={{ margin: '0 auto' }}
          />
          <Paragraph
            copyable={{ text: xpubWallet }}
            className="copyableAddress"
          >
            <Text>{xpubWallet}</Text>
          </Paragraph>
        </Space>
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
              placeholder={`Input Extended Public Key ${derivationPath} of SSP Key here`}
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

Key.defaultProps = {
  derivationPath: 'xpub-48-19167-0-0',
};

export default Key;
