import { useState, useEffect } from 'react';
import { useAppSelector } from '../../hooks';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useAppDispatch } from '../../hooks';
import { setXpubKey } from '../../store';
import { Modal, QRCode, Button, Input, message } from 'antd';
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

const xpubRegex = /^(xpub[1-9A-HJ-NP-Za-km-z]{79,108})$/; // /^([xyYzZtuUvV]pub[1-9A-HJ-NP-Za-km-z]{79,108})$/; later

function Key(props: {
  derivationPath?: string;
  synchronised: (status: boolean) => void;
}) {
  const { derivationPath = 'xpub-48-19167-0-0', synchronised } = props;
  const dispatch = useAppDispatch();
  const [isModalKeyOpen, setIsModalKeyOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyInputVisible, setKeyInputVisible] = useState(false);
  const { xpubKey, xpubWallet } = useAppSelector((state) => state.flux);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };
  useEffect(() => {
    // check if we have 2-xpub-48-19167-0-0
    if (!xpubKey) {
      // no xpubKey, show modal of Key
      setIsModalKeyOpen(true);
    }
  });

  const handleOkModalKey = () => {
    // display dialog awaiting synchronisation. This is automatic stuff
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
      let keyValid = true;
      // try generating an address from it
      try {
        generateMultisigAddress(xpubWallet, keyInput, 0, 0, 'flux');
      } catch (error) {
        keyValid = false;
        displayMessage('error', 'Invalid SSP Key.');
      }
      if (!keyValid) return;
      const xpub2 = keyInput;
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
            synchronised(true);
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
      // tell parent of failiure to logout
      synchronised(false);
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
