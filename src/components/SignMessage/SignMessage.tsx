/* eslint-disable @typescript-eslint/no-misused-promises */
import { Typography, Button, Space, Modal } from 'antd';
import { useAppSelector } from '../../hooks';
const { Text } = Typography;
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
import { sign as bitcoinjsSign } from 'bitcoinjs-message';
import { randomBytes } from 'crypto';
import { cryptos } from '../../types';

interface signMessageData {
  status: string;
  result: string;
}

function SignMessage(props: {
  open: boolean;
  openAction: (data: signMessageData | null) => void;
  message: string;
  address: string;
  chain: keyof cryptos;
}) {
  const { sspWalletExternalIdentity: wExternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { identityChain } = useAppSelector((state) => state.sspState);
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction, message, address } = props;
  let { chain } = props;
  chain = chain || 'btc';
  const blockchainConfig = blockchains[chain];
  console.log(blockchainConfig);
  const identityChainConfig = blockchains[identityChain];

  const handleOk = async () => {
    try {
      if (address === wExternalIdentity || !address) {
        const xprivEncrypted = secureLocalStorage.getItem(
          `xpriv-48-${identityChainConfig.slip}-0-${getScriptType(
            identityChainConfig.scriptType,
          )}`,
        );
        const fingerprint: string = getFingerprint();
        const password = await passworderDecrypt(fingerprint, passwordBlob);
        if (typeof password !== 'string') {
          throw new Error('Unable to decrypt password');
        }
        if (xprivEncrypted && typeof xprivEncrypted === 'string') {
          const xpriv = await passworderDecrypt(password, xprivEncrypted);
          // generate keypair
          if (xpriv && typeof xpriv === 'string') {
            const externalIdentity = generateExternalIdentityKeypair(xpriv);
            // sign message
            const signature = signMessage(message, externalIdentity.privKey);
            if (!signature) {
              throw new Error('Unable to sign message');
            }
            openAction({
              status: t('common:success'),
              result: signature,
            });
          } else {
            throw new Error('Unknown error: address mismatch');
          }
        }
      } else {
        console.log('todo');
      }
    } catch (error) {
      openAction({
        status: t('common:error'),
        result: 'Error signing message.',
      });
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
      console.log(pk);
      const isCompressed = true; // ssp always has compressed keys

      const privateKey = wifToPrivateKey(pk, chain);

      signature = bitcoinjsSign(
        message,
        Buffer.from(privateKey, 'hex'),
        isCompressed,
        { extraEntropy: randomBytes(32) },
      );
      signature = signature.toString('base64');
      // => different (but valid) signature each time
    } catch (e) {
      console.log(e);
      signature = null;
    }
    return signature;
  }

  const handleCancel = () => {
    openAction(null);
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
          size={32}
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
            <Text strong>{address || wExternalIdentity}</Text>
          </Space>
          <Space direction="vertical" size="small">
            <Text>{t('home:signMessage.message')}:</Text>
            <Text strong>{message}</Text>
          </Space>
        </Space>
        <Space direction="vertical" size="large" style={{ marginTop: 64 }}>
          <Button type="primary" size="large" onClick={handleOk}>
            {t('home:signMessage.sign')}
          </Button>
          <Button type="link" block size="small" onClick={handleCancel}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default SignMessage;
