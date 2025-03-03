import { Typography, Button, Space, Modal, Input } from 'antd';
import { useAppSelector } from '../../hooks';
const { Paragraph, Text } = Typography;
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
                status: t('common:success'),
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
          status: t('common:error'),
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
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <Space direction="vertical" size="small">
            {wExternalIdentity === address || !address ? (
              <Text>{t('home:signMessage.sign_message_sspwid')}</Text>
            ) : (
              <Text>
                {t('home:signMessage.sign_message_info', {
                  chainName: blockchainConfig.name,
                })}
              </Text>
            )}
            <Paragraph
              copyable={{ text: wExternalIdentity }}
              className="copyableAddress"
            >
              <Text strong>{address || wExternalIdentity}</Text>
            </Paragraph>
          </Space>
          <Space direction="vertical" size="small">
            <Text>{t('home:signMessage.message')}:</Text>
            <TextArea
              onChange={handleTextInput}
              style={{ width: 340 }}
              size={'large'}
              rows={4}
              disabled={message ? true : false}
              value={message ? message : messageToSign}
            />
          </Space>
          {messageSignature && (
            <Space direction="vertical" size="small">
              <Text>{t('home:signMessage.signature')}:</Text>
              <Paragraph
                copyable={{ text: messageSignature }}
                className="copyableAddress"
              >
                {messageSignature}
              </Paragraph>
            </Space>
          )}
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button type="primary" size="large" onClick={handleOk}>
              {t('home:signMessage.sign')}
            </Button>
            <Button type="link" block size="small" onClick={handleCancel}>
              {t('common:cancel')}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

export default SignMessage;
