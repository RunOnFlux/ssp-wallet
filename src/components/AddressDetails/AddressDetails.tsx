import { useState, useEffect, useRef } from 'react';
import { Typography, Button, Modal, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { generateAddressKeypair } from '../../lib/wallet';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

function AddressDetails(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [privKey, setPrivKey] = useState('');
  const [redeemScriptVisible, setRedeemScriptVisible] = useState(false);
  const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
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
        const xprivFluxBlob = secureLocalStorage.getItem('xpriv-48-19167-0-0');
        if (typeof xprivFluxBlob !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_xpriv'));
        }
        const xprivFlux = await passworderDecrypt(password, xprivFluxBlob);
        if (typeof xprivFlux !== 'string') {
          throw new Error(
            t('home:sspWalletDetails.err_invalid_wallet_xpriv_2'),
          );
        }
        const keyPair = generateAddressKeypair(xprivFlux, 0, 0, 'flux');
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
        title={t('home:addressDetails.chain_bip', { chain: 'FLUX' })}
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
        <Paragraph copyable={{ text: address }} className="copyableAddress">
          <Text>{address}</Text>
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
          copyable={{ text: redeemScript }}
          className="copyableAddress"
        >
          <Text>
            {redeemScriptVisible ? redeemScript : '*** *** *** *** *** ***'}
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
