import { useState, useEffect } from 'react';
import { Button, Modal, Space, Typography, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';
import { WarningOutlined, LoadingOutlined } from '@ant-design/icons';

import axios from 'axios';

import './PurchaseCrypto.css';

import { sspConfig } from '@storage/ssp';

import { onramperSignatureSSPRelay } from '../../types';

function PurchaseCrypto(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  cryptoNetwork: string | undefined;
  cryptoAsset: string;
  wInUse: string;
}) {
  const { open, openAction } = props;
  const { t } = useTranslation(['home', 'common']);
  const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
  const [userConsentBuy, setUserConsentBuy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signature, setSignature] = useState('');
  const [payloadToSign, setPayloadToSign] = useState(
    `networkWallets=${props.cryptoNetwork}:${props.wInUse}`,
  );
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };
  const handleOk = () => {
    openAction(false);
  };

  useEffect(() => {
    if (open) {
      setLoading(true);
      askForSignature();
    } else {
      setSignature('');
    }
  }, [open, payloadToSign]);

  useEffect(() => {
    setPayloadToSign(`networkWallets=${props.cryptoNetwork}:${props.wInUse}`);
  }, [props.wInUse, props.cryptoAsset, props.cryptoNetwork]);

  const askForSignature = async () => {
    try {
      // ask ssp-relay for signature
      const signature = await axios.post<onramperSignatureSSPRelay>(
        `https://${sspConfig().relay}/v1/sign/onramper`,
        payloadToSign,
      );
      setSignature(signature.data.signature);
      setLoading(false);
    } catch (error) {
      console.log(error);
      // display error message todo
      setLoading(false);
      setSignature('');
      displayMessage('error', t('home:buy_sell_crypto.not_available_later'));
      setTimeout(() => {
        openAction(false);
      }, 100);
    }
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={null}
        open={open}
        onOk={handleOk}
        onCancel={handleOk}
        closable={true}
        centered
        width="min(600px, calc(100vw - 16px))"
        footer={null}
        wrapClassName="onramper-modal"
        className={`onramper-modal${userConsentBuy && signature && !loading ? ' onramper-iframe-active' : ''}`}
        styles={{ container: { padding: 0, margin: 0 } }}
      >
        {userConsentBuy && signature && !loading ? (
          <div className="onramper-container">
            {/* Security note: allow-scripts + allow-same-origin allows sandbox escape,
               but is required for Onramper widget to load resources (CORS).
               We accept this risk as we already trust Onramper with payment processing.
               Mitigations: user consent, extension isolation, referrer policy, HTTPS-only. */}
            <iframe
              src={`https://buy.onramper.com?onlyCryptoNetworks=${props.cryptoNetwork}&mode=buy,sell&defaultCrypto=${props.cryptoAsset}&sell_onlyCryptoNetworks=${props.cryptoNetwork}&sell_defaultCrypto=${props.cryptoAsset}&apiKey=pk_prod_01JDMCZ0ZRZ14VBRW20B4HC04V&successRedirectUrl=https%3A%2F%2Fsspwallet.io%2Fcheckout_success&failureRedirectUrl=https%3A%2F%2Fsspwallet.io%2Fcheckout_failure&themeName=${darkModePreference.matches ? 'dark' : 'light'}&containerColor=${darkModePreference.matches ? '1f1f1f' : 'ffffff'}&borderRadius=0&wgBorderRadius=0&${payloadToSign}&signature=${signature}`}
              title="Onramper"
              allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              referrerPolicy="no-referrer"
              className="onramper-iframe"
            />
          </div>
        ) : loading && userConsentBuy ? (
          <div className="onramper-loading">
            <Space direction="vertical" size={48}>
              <LoadingOutlined style={{ fontSize: '36px' }} />
              <Text strong style={{ fontSize: '24px' }}>
                {t('common:loading')}
              </Text>
            </Space>
            <div className="onramper-consent-buttons">
              <Button
                type="primary"
                size="middle"
                onClick={() => {
                  setUserConsentBuy(false);
                  handleOk();
                }}
              >
                {t('common:cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="onramper-consent">
            <Space
              direction="vertical"
              size={32}
              className="onramper-consent-content"
            >
              <Text strong style={{ fontSize: '24px' }}>
                {t('home:buy_sell_crypto.third_party_service')}
              </Text>
              <WarningOutlined style={{ fontSize: '36px' }} />
              <Text>{t('home:buy_sell_crypto.consent_info')}</Text>
            </Space>
            <div className="onramper-consent-buttons">
              <Button
                type="primary"
                size="middle"
                onClick={() => setUserConsentBuy(true)}
                className="onramper-consent-button"
              >
                {t('home:buy_sell_crypto.consent_info_2')}
              </Button>
              <Button
                onClick={() => {
                  setUserConsentBuy(false);
                  handleOk();
                }}
              >
                {t('common:cancel')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default PurchaseCrypto;
