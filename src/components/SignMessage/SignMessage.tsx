import { Typography, Button, Modal, Input } from 'antd';
import { useAppSelector } from '../../hooks';
import '../DappRequest/DappRequest.css';
const { Text } = Typography;
const { TextArea } = Input;
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import {
  getScriptType,
  generateExternalIdentityKeypair,
  wifToPrivateKey,
} from '../../lib/wallet.ts';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import { fluxnode } from '@runonflux/flux-sdk';
import { randomBytes } from 'crypto';
import { cryptos } from '../../types';
import { useState } from 'react';

interface signMessageData {
  status: string;
  signature?: string;
  address?: string;
  message?: string;
  data?: string;
}

interface Props {
  open: boolean;
  message: string;
  address: string;
  chain: keyof cryptos;
  openAction?: (data: signMessageData | null) => void;
  exitAction?: () => void;
}

function SignMessage({
  open,
  message,
  address,
  chain,
  openAction,
  exitAction,
}: Props) {
  const { sspWalletExternalIdentity: wExternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { identityChain } = useAppSelector((state) => state.sspState);
  const { t } = useTranslation(['home', 'common', 'cr']);
  const selectedChain = chain || identityChain;
  const blockchainConfig = blockchains[selectedChain];
  console.log(blockchainConfig);
  const identityChainConfig = blockchains[identityChain];
  const [messageSignature, setMessageSignature] = useState('');
  const [messageToSign, setMessageToSign] = useState('');

  const handleOk = async () => {
    try {
      if (address === wExternalIdentity || !address) {
        const xprivEncrypted = secureLocalStorage.getItem(
          `xpriv-48-${identityChainConfig.slip}-0-${getScriptType(
            identityChainConfig.scriptType,
          )}-${identityChainConfig.id}`,
        );
        const fingerprint: string = getFingerprint();
        let password = await passworderDecrypt(fingerprint, passwordBlob);
        if (typeof password !== 'string') {
          throw new Error('Unable to decrypt password');
        }
        if (xprivEncrypted && typeof xprivEncrypted === 'string') {
          let xpriv = await passworderDecrypt(password, xprivEncrypted);
          // generate keypair
          if (xpriv && typeof xpriv === 'string') {
            const externalIdentity = generateExternalIdentityKeypair(xpriv);
            // sign message
            const signature = signMessage(
              message ? message : messageToSign,
              externalIdentity.privKey,
            );
            if (!signature) {
              throw new Error('Unable to sign message');
            }
            setMessageSignature(signature);
            if (openAction) {
              openAction({
                status: 'SUCCESS', // do not translate
                signature: signature,
                address: externalIdentity.address,
                message: message,
              });
            }
          } else {
            throw new Error('Unknown error: address mismatch');
          }
          // reassign xpriv to null as it is no longer needed
          xpriv = null;
        }
        password = null;
      } else {
        console.log('todo');
        // todo case for signing with any address
      }
    } catch (error) {
      console.log(error);
      if (openAction) {
        openAction({
          status: 'ERROR', // do not translate
          data: t('home:signMessage.err_sign_message'),
        });
      }
    }
  };

  /**
   * Signs the message with the private key.
   *
   * @param {string} message
   * @param {string} pk - private key
   *
   * @returns {string} signature
   */
  function signMessage(message: string, pk: string) {
    let signature;
    try {
      const isCompressed = true; // ssp always has compressed keys

      const privateKey = wifToPrivateKey(pk, selectedChain);

      const messagePrefix = blockchainConfig.messagePrefix;

      // this is base64 encoded
      signature = fluxnode.signMessage(
        message,
        privateKey,
        isCompressed,
        messagePrefix,
        { extraEntropy: randomBytes(32) },
      );

      // => different (but valid) signature each time
    } catch (e) {
      console.log(e);
      signature = null;
    }
    return signature;
  }

  const handleCancel = () => {
    setMessageSignature('');
    setMessageToSign('');
    if (openAction) {
      openAction(null);
    }
    if (exitAction) {
      exitAction();
    }
  };

  const handleTextInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageToSign(event.target.value.trim());
  };

  return (
    <>
      <Modal
        title={t('home:signMessage.sign_message')}
        open={open}
        onCancel={handleCancel}
        footer={[]}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            marginTop: 16,
          }}
        >
          <p className="dapp-ask">
            {wExternalIdentity === address || !address
              ? t('home:signMessage.sign_message_sspwid')
              : t('home:signMessage.sign_message_info', {
                  chainName: blockchainConfig.name,
                })}
          </p>
          <div className="dapp-summary">
            <div className="dapp-summary-row">
              <span className="dapp-summary-label">{t('common:address')}</span>
              <Text
                className="dapp-summary-value dapp-mono"
                copyable={{ text: address || wExternalIdentity }}
              >
                {address || wExternalIdentity}
              </Text>
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div
              className="dapp-summary-label"
              style={{ fontSize: 12, marginBottom: 4 }}
            >
              {t('home:signMessage.message')}
            </div>
            <TextArea
              onChange={handleTextInput}
              rows={4}
              disabled={message ? true : false}
              value={message ? message : messageToSign}
              style={{ fontFamily: 'var(--ssp-mono)', fontSize: 12 }}
              aria-label={t('home:signMessage.message')}
            />
          </div>
          {messageSignature && (
            <div style={{ textAlign: 'left' }}>
              <div
                className="dapp-summary-label"
                style={{ fontSize: 12, marginBottom: 4 }}
              >
                {t('home:signMessage.signature')}
              </div>
              <Text
                className="dapp-payload"
                style={{ display: 'block' }}
                copyable={{ text: messageSignature }}
              >
                {messageSignature}
              </Text>
            </div>
          )}
          <div className="dapp-actions">
            <Button type="primary" size="large" block onClick={handleOk}>
              {t('home:signMessage.sign')}
            </Button>
            <Button type="text" block onClick={handleCancel}>
              {t('common:cancel')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default SignMessage;
