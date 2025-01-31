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
        title="&nbsp;"
        open={open}
        onOk={handleOk}
        onCancel={handleOk}
        style={{
          textAlign: 'center',
          top: 5,
          paddingBottom: '5px',
          margin: '0 auto',
          padding: '0 !important',
          maxWidth: '404px',
        }}
        footer={null}
        wrapClassName="onramper-modal"
        className="onramper-modal"
      >
        {userConsentBuy && signature && !loading ? (
          <iframe
            src={`https://buy.onramper.com?onlyCryptoNetworks=${props.cryptoNetwork}&mode=buy,sell&defaultCrypto=${props.cryptoAsset}&sell_onlyCryptoNetworks=${props.cryptoNetwork}&sell_defaultCrypto=${props.cryptoAsset}&apiKey=pk_prod_01JDMCZ0ZRZ14VBRW20B4HC04V&themeName=${darkModePreference.matches ? 'dark' : 'light'}&containerColor=${darkModePreference.matches ? '1f1f1f' : 'ffffff'}&borderRadius=0&wgBorderRadius=0&${payloadToSign}&signature=${signature}`}
            title="Onramper"
            height="540px"
            width="404px"
            allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
            sandbox="allow-scripts allow-same-origin allow-popups"
            style={{
              border: 'none',
              margin: '-6px',
              borderRadius: '5px',
            }}
          />
        ) : loading && userConsentBuy ? (
          <div
            style={{
              height: '534px',
              width: '404px',
            }}
          >
            <Space
              direction="vertical"
              size={48}
              style={{
                marginBottom: 16,
                marginTop: 120,
              }}
            >
              <LoadingOutlined style={{ fontSize: '36px' }} />
              <Text strong style={{ fontSize: '24px' }}>
                {t('common:loading')}
              </Text>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Button
                  type="primary"
                  size="middle"
                  style={{
                    position: 'absolute',
                    bottom: '40px',
                  }}
                  onClick={() => {
                    setUserConsentBuy(false);
                    handleOk();
                  }}
                >
                  {t('common:cancel')}
                </Button>
              </div>
            </Space>
          </div>
        ) : (
          <div
            style={{
              height: '534px',
              width: '404px',
            }}
          >
            <Space
              direction="vertical"
              size={48}
              style={{
                marginBottom: 16,
                marginTop: 16,
                maxWidth: '354px',
              }}
            >
              <Text strong style={{ fontSize: '24px' }}>
                {t('home:buy_sell_crypto.third_party_service')}
              </Text>
              <WarningOutlined style={{ fontSize: '36px' }} />
              <Text>{t('home:buy_sell_crypto.consent_info')}</Text>
              <div
                style={{
                  marginBottom: 16,
                  marginTop: 16,
                  maxWidth: '354px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Space
                  direction="vertical"
                  size="large"
                  style={{ position: 'absolute', bottom: '40px' }}
                >
                  <Button
                    type="primary"
                    size="middle"
                    onClick={() => setUserConsentBuy(true)}
                    block
                    style={{
                      maxWidth: '284px',
                      display: 'block',
                      whiteSpace: 'normal',
                      height: 'auto',
                      padding: '5px 12px',
                    }}
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
                </Space>
              </div>
            </Space>
          </div>
        )}
      </Modal>
    </>
  );
}

export default PurchaseCrypto;
