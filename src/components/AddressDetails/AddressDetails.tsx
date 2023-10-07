import { useState, useEffect } from 'react';
import { Typography, Button, Modal, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { generateAddressKeypair, getScriptType } from '../../lib/wallet';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';

function AddressDetails(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const [privKey, setPrivKey] = useState('');
  const [redeemScriptVisible, setRedeemScriptVisible] = useState(false);
  const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  // private key, redeemScript, address
  const { open, openAction } = props;
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector((state) => state[activeChain]);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const blockchainConfig = blockchains[activeChain];
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    generateAddressInformation();
  }, [walletInUse]);

  const handleOk = () => {
    setRedeemScriptVisible(false);
    setPrivateKeyVisible(false);
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
          )}`,
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
        const splittedDerPath = walletInUse.split('-');
        const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
        const addressIndex = Number(splittedDerPath[1]);
        const keyPair = generateAddressKeypair(
          xprivChain,
          typeIndex,
          addressIndex,
          activeChain,
        );
        setPrivKey(keyPair.privKey);
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
        title={t('home:addressDetails.chain_bip', {
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
        <h3>{t('home:receive.wallet_address')}:</h3>
        <Paragraph
          copyable={{ text: wallets[walletInUse].address }}
          className="copyableAddress"
        >
          <Text>{wallets[walletInUse].address}</Text>
        </Paragraph>
        <h3>
          {redeemScriptVisible && (
            <EyeTwoTone onClick={() => setRedeemScriptVisible(false)} />
          )}
          {!redeemScriptVisible && (
            <EyeInvisibleOutlined
              onClick={() => setRedeemScriptVisible(true)}
            />
          )}{' '}
          {t('home:addressDetails.wallet_redeem_script')}:
        </h3>
        <Paragraph
          copyable={{ text: wallets[walletInUse].redeemScript }}
          className="copyableAddress"
        >
          <Text>
            {redeemScriptVisible
              ? wallets[walletInUse].redeemScript
              : '*** *** *** *** *** ***'}
          </Text>
        </Paragraph>
        <h3>
          {privateKeyVisible && (
            <EyeTwoTone onClick={() => setPrivateKeyVisible(false)} />
          )}
          {!privateKeyVisible && (
            <EyeInvisibleOutlined onClick={() => setPrivateKeyVisible(true)} />
          )}{' '}
          {t('home:addressDetails.wallet_priv_key')}:
        </h3>
        <Paragraph copyable={{ text: privKey }} className="copyableAddress">
          <Text>{privateKeyVisible ? privKey : '*** *** *** *** *** ***'}</Text>
        </Paragraph>
      </Modal>
    </>
  );
}

export default AddressDetails;
