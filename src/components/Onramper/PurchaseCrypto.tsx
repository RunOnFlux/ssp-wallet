import { useState, useEffect } from 'react';
import { toast } from '../../lib/toast';
import { Button, Modal, Space, Typography } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';
import {
  LoaderCircle as LoaderCircleIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react';

import './PurchaseCrypto.css';

import { sspConfig } from '@storage/ssp';
import { useThemeMode } from '../../contexts/ThemeContext';
import { fetchOnramperWidgetUrl } from '../../lib/onramper';

function PurchaseCrypto(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  cryptoNetwork: string | undefined;
  cryptoAsset: string;
  wInUse: string;
}) {
  const { open, openAction } = props;
  const { t } = useTranslation(['home', 'common']);
  const { isDark } = useThemeMode();
  const [userConsentBuy, setUserConsentBuy] = useState(false);
  const [loading, setLoading] = useState(false);
  // Signed Onramper widget URL from the SSP relay. With Onramper Signature V2
  // it is single-use (its nonce burns on first load) and expires after 15
  // minutes, so a fresh one is requested for every load of the iframe:
  // whenever the dialog opens or anything in the URL (network, asset,
  // address, theme) changes. Never reuse one.
  const [widgetUrl, setWidgetUrl] = useState('');
  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({
      type,
      content,
    });
  };
  const handleOk = () => {
    openAction(false);
  };

  useEffect(() => {
    setWidgetUrl('');
    if (!open || !userConsentBuy) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    // ask ssp-relay for the signed widget URL
    fetchOnramperWidgetUrl(
      sspConfig().relay,
      {
        network: props.cryptoNetwork ?? '',
        asset: props.cryptoAsset,
        address: props.wInUse,
        theme: isDark ? 'dark' : 'light',
      },
      controller.signal,
    )
      .then((url) => {
        setWidgetUrl(url);
        setLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return; // superseded by a newer request
        console.log(error);
        setLoading(false);
        setWidgetUrl('');
        displayMessage('error', t('home:buy_sell_crypto.not_available_later'));
        setTimeout(() => {
          openAction(false);
        }, 100);
      });
    return () => controller.abort();
  }, [
    open,
    userConsentBuy,
    props.cryptoNetwork,
    props.cryptoAsset,
    props.wInUse,
    isDark,
  ]);

  return (
    <>
      <Modal
        title={null}
        open={open}
        onOk={handleOk}
        onCancel={handleOk}
        closable={true}
        centered
        // Cap at the Onramper widget's natural max width — any wider and the
        // widget floats letterboxed on its own (white) page body inside the
        // iframe. At this width the widget fills the iframe edge-to-edge.
        width="min(460px, calc(100vw - 16px))"
        footer={null}
        className={`onramper-modal${userConsentBuy && widgetUrl && !loading ? ' onramper-iframe-active' : ''}`}
        styles={{ container: { padding: 0, margin: 0 } }}
      >
        {userConsentBuy && widgetUrl && !loading ? (
          <div className="onramper-container">
            {/* Security note: allow-scripts + allow-same-origin allows sandbox escape,
               but is required for Onramper widget to load resources (CORS).
               We accept this risk as we already trust Onramper with payment processing.
               Mitigations: user consent, extension isolation, referrer policy, HTTPS-only. */}
            <iframe
              src={widgetUrl}
              title="Onramper"
              allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              referrerPolicy="no-referrer"
              className="onramper-iframe"
            />
          </div>
        ) : userConsentBuy ? (
          <div className="onramper-loading">
            <Space direction="vertical" size={48}>
              <LoaderCircleIcon
                className="lucide-spin"
                style={{ fontSize: '36px' }}
              />
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
              <TriangleAlertIcon style={{ fontSize: '36px' }} />
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
