import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Button,
  Modal,
  Input,
  Space,
  message,
  Select,
  Tooltip,
  theme,
} from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import {
  backends,
  backendsOriginal,
  loadBackendsConfig,
} from '@storage/backends';
import {
  sspConfig,
  sspConfigOriginal,
  loadSSPConfig,
  getPulseConfig,
  subscribeToPulse,
  unsubscribeFromPulse,
  getDefaultPulsePreferences,
} from '@storage/ssp';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import LanguageSelector from '../../components/LanguageSelector/LanguageSelector.tsx';
import { currency, cryptos } from '../../types';
import { supportedFiatValues, getFiatSymbol } from '../../lib/currency.ts';
import { setFiatRates } from '../../store';
import { QuestionCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import ConfirmPublicNoncesKey from '../ConfirmPublicNoncesKey/ConfirmPublicNoncesKey';
import secureLocalStorage from 'react-secure-storage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import { getFingerprint } from '../../lib/fingerprint';
import { getScriptType } from '../../lib/wallet';

interface sspConfigType {
  relay?: string;
  fiatCurrency?: keyof currency;
}

interface PulseApiResponse {
  status: string;
  data?: {
    success: boolean;
    message?: string;
    isNewSubscription?: boolean;
  };
}

function Settings(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const {
    activeChain,
    sspWalletKeyInternalIdentity,
    sspWalletInternalIdentity,
  } = useAppSelector((state) => state.sspState);
  const { createWkIdentityAuth } = useRelayAuth();
  const { fiatRates } = useAppSelector((state) => state.fiatCryptoRates);
  const { t } = useTranslation(['home', 'common']);
  const NC = backends()[activeChain].node;
  const API = backends()[activeChain].api;
  const EXPLORER = backends()[activeChain].explorer;
  const SSPR = sspConfig().relay;
  const [sspConfigRelay, setSspConfigRelay] = useState(sspConfig().relay);
  const SSPFC = sspConfig().fiatCurrency;
  const [sspFiatCurrency, setSspFiatCurrency] = useState(SSPFC);
  const [nodeConfig, setNodeConfig] = useState(NC);
  const [apiConfig, setApiConfig] = useState(API);
  const [explorerConfig, setExplorerConfig] = useState(EXPLORER);
  const [publicNoncesModalOpen, setPublicNoncesModalOpen] = useState(false);
  const { open, openAction } = props;
  const [messageApi, contextHolder] = message.useMessage();
  const { token } = theme.useToken();
  const blockchainConfig = blockchains[activeChain];
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);

  // SSP Pulse state
  const pulseConfigData = getPulseConfig();
  const [pulseEmail, setPulseEmail] = useState(pulseConfigData?.email ?? '');
  const [isPulseSubscribed, setIsPulseSubscribed] = useState(
    !!(pulseConfigData?.isSubscribed && pulseConfigData?.email),
  );
  const [pulseLoading, setPulseLoading] = useState(false);

  const backendsOriginalConfig = backendsOriginal();
  const originalConfig = sspConfigOriginal();

  console.log(backendsOriginalConfig);
  console.log(NC);
  console.log(API);
  console.log(EXPLORER);
  console.log(backends());

  useEffect(() => {
    setNodeConfig(NC);
    setApiConfig(API);
    setExplorerConfig(EXPLORER);
  }, [activeChain]);

  // Sync pulse state when modal opens
  useEffect(() => {
    if (open) {
      const config = getPulseConfig();
      setPulseEmail(config?.email ?? '');
      setIsPulseSubscribed(!!(config?.isSubscribed && config?.email));
    }
  }, [open]);

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleOk = async () => {
    try {
      // adjust ssp
      const sspConf: sspConfigType = {};
      if (originalConfig.relay !== sspConfigRelay) {
        sspConf.relay = sspConfigRelay;
      }
      if (originalConfig.fiatCurrency !== sspFiatCurrency) {
        sspConf.fiatCurrency = sspFiatCurrency;
      }
      if (Object.keys(sspConf).length > 0) {
        await localForage.setItem('sspConfig', sspConf).catch((err) => {
          console.log(err);
        });
      } else {
        // remove if present on localForge
        await localForage.removeItem('sspConfig').catch((err) => {
          console.log(err);
        });
      }
      // adjust node, api, explorer
      const storedBackends: backends =
        (await localForage.getItem('backends')) ?? {}; // load our backends
      if (!storedBackends[activeChain]) {
        storedBackends[activeChain] = {
          ...backendsOriginalConfig[activeChain],
        };
      } // if this coin is not present, add it
      // adjust node
      if (storedBackends?.[activeChain]?.node !== nodeConfig) {
        storedBackends[activeChain].node = nodeConfig;
      }
      // adjust api
      if (storedBackends?.[activeChain]?.api !== apiConfig) {
        storedBackends[activeChain].api = apiConfig;
      }
      // adjust explorer
      if (storedBackends?.[activeChain]?.explorer !== explorerConfig) {
        storedBackends[activeChain].explorer = explorerConfig;
      }
      // if any config or backend is the same as original, remove it
      if (
        storedBackends?.[activeChain]?.node ===
        backendsOriginalConfig[activeChain].node
      ) {
        delete storedBackends?.[activeChain]?.node;
      }
      if (
        storedBackends?.[activeChain]?.api ===
        backendsOriginalConfig[activeChain].api
      ) {
        delete storedBackends?.[activeChain]?.api;
      }
      if (
        storedBackends?.[activeChain]?.explorer ===
        backendsOriginalConfig[activeChain].explorer
      ) {
        delete storedBackends?.[activeChain]?.explorer;
      }
      // if config of backend coin is empty, delete it
      if (Object.keys(storedBackends?.[activeChain]).length === 0) {
        delete storedBackends?.[activeChain];
      }
      // if entire config of backends is empty, delete it, otherwise save it
      if (Object.keys(storedBackends).length === 0) {
        await localForage.removeItem('backends').catch((err) => {
          console.log(err);
        });
      } else {
        await localForage.setItem('backends', storedBackends).catch((err) => {
          console.log(err);
        });
      }

      // apply configuration
      loadBackendsConfig();
      loadSSPConfig();
      openAction(false);
      // this is to trigger useEffect reloads on txs, balances by adjusting slightly fiatRates otherwise change of fiat currency won't have an effect for a while
      setTimeout(() => {
        dispatch(
          setFiatRates({ ...fiatRates, IDR: fiatRates.IDR + 0.0000000001 }),
        );
      }, 100);
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:settings.err_saving_conf'));
    }
  };

  const handleNotOk = () => {
    if (SSPR !== sspConfigRelay) {
      setSspConfigRelay(SSPR);
    }
    if (NC !== nodeConfig) {
      setNodeConfig(NC);
    }
    if (API !== apiConfig) {
      setApiConfig(API);
    }
    if (EXPLORER !== explorerConfig) {
      setExplorerConfig(EXPLORER);
    }
    if (SSPFC !== sspFiatCurrency) {
      setSspFiatCurrency(SSPFC);
    }
    loadBackendsConfig();
    loadSSPConfig();
    openAction(false);
  };

  const resetSSP = () => {
    setSspConfigRelay(originalConfig.relay);
    setSspFiatCurrency(originalConfig.fiatCurrency);
  };

  const resetNodeConfig = () => {
    setNodeConfig(backendsOriginalConfig[activeChain].node);
  };

  const resetApiConfig = () => {
    setApiConfig(backendsOriginalConfig[activeChain].api);
  };

  const resetExplorerConfig = () => {
    setExplorerConfig(backendsOriginalConfig[activeChain].explorer);
  };

  const postAction = async (
    action: string,
    payload: string,
    chain: string,
    path: string,
    wkIdentity: string,
  ) => {
    const data: Record<string, unknown> = {
      action,
      payload,
      chain,
      path,
      wkIdentity,
    };

    // Add authentication if available (includes hash of request body)
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) {
        Object.assign(data, auth);
      }
    } catch (error) {
      console.warn(
        '[postAction] Auth not available, sending without signature',
        error,
      );
    }

    axios
      .post(`https://${sspConfig().relay}/v1/action`, data)
      .then((res) => {
        console.log(res);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const handlePublicNoncesSync = () => {
    setPublicNoncesModalOpen(true);
    // Request public nonces from SSP relay - response will come via socket
    postAction(
      'publicnoncesrequest',
      '[]',
      activeChain,
      '',
      sspWalletKeyInternalIdentity,
    );
  };

  // SSP Pulse handlers
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handlePulseSubscribe = async () => {
    if (!pulseEmail || !validateEmail(pulseEmail)) {
      displayMessage('error', t('home:settings.sspPulse.err_invalid_email'));
      return;
    }

    setPulseLoading(true);
    try {
      // Decrypt password from passwordBlob
      const fingerprint = getFingerprint();
      const password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        throw new Error('Failed to decrypt password');
      }

      // Load all synced chain xpubs from encrypted storage
      const chainKeys = Object.keys(blockchains) as (keyof cryptos)[];
      const chains: Record<string, { walletXpub: string; keyXpub: string }> =
        {};

      for (const chain of chainKeys) {
        const chainConfig = blockchains[chain];
        const xpubKey = `xpub-48-${chainConfig.slip}-0-${getScriptType(chainConfig.scriptType)}-${chainConfig.id}`;
        const xpub2Key = `2-xpub-48-${chainConfig.slip}-0-${getScriptType(chainConfig.scriptType)}-${chainConfig.id}`;

        const xpubEncrypted = secureLocalStorage.getItem(xpubKey);
        const xpub2Encrypted = secureLocalStorage.getItem(xpub2Key);

        // Only include chains where both wallet and key xpubs are synced
        if (
          xpubEncrypted &&
          typeof xpubEncrypted === 'string' &&
          xpub2Encrypted &&
          typeof xpub2Encrypted === 'string'
        ) {
          try {
            const walletXpub = await passworderDecrypt(password, xpubEncrypted);
            const keyXpub = await passworderDecrypt(password, xpub2Encrypted);

            if (typeof walletXpub === 'string' && typeof keyXpub === 'string') {
              chains[chain] = { walletXpub, keyXpub };
            }
          } catch (decryptError) {
            console.warn(
              `[Pulse] Failed to decrypt xpubs for chain ${chain}`,
              decryptError,
            );
          }
        }
      }

      const data: Record<string, unknown> = {
        wkIdentity: sspWalletKeyInternalIdentity,
        walletIdentity: sspWalletInternalIdentity,
        email: pulseEmail,
        chains,
        preferences: getDefaultPulsePreferences(),
      };

      // Add authentication
      try {
        const auth = await createWkIdentityAuth(
          'action',
          sspWalletKeyInternalIdentity,
          data,
        );
        if (auth) {
          Object.assign(data, auth);
        }
      } catch (error) {
        console.warn('[Pulse Subscribe] Auth not available', error);
      }

      const response = await axios.post<PulseApiResponse>(
        `https://${sspConfig().relay}/v1/pulse/subscribe`,
        data,
      );

      if (response.data?.status === 'success' && response.data?.data?.success) {
        await subscribeToPulse(pulseEmail);
        setIsPulseSubscribed(true);
        displayMessage(
          'success',
          t('home:settings.sspPulse.subscribe_success'),
        );
      } else {
        displayMessage(
          'error',
          response.data?.data?.message ||
            t('home:settings.sspPulse.err_subscribe'),
        );
      }
    } catch (error) {
      console.error('[Pulse Subscribe]', error);
      displayMessage('error', t('home:settings.sspPulse.err_subscribe'));
    } finally {
      setPulseLoading(false);
    }
  };

  const handlePulseUnsubscribe = async () => {
    setPulseLoading(true);
    try {
      const data: Record<string, unknown> = {
        wkIdentity: sspWalletKeyInternalIdentity,
      };

      // Add authentication
      try {
        const auth = await createWkIdentityAuth(
          'action',
          sspWalletKeyInternalIdentity,
          data,
        );
        if (auth) {
          Object.assign(data, auth);
        }
      } catch (error) {
        console.warn('[Pulse Unsubscribe] Auth not available', error);
      }

      const response = await axios.post<PulseApiResponse>(
        `https://${sspConfig().relay}/v1/pulse/unsubscribe`,
        data,
      );

      if (response.data?.status === 'success' && response.data?.data?.success) {
        await unsubscribeFromPulse();
        setIsPulseSubscribed(false);
        setPulseEmail('');
        displayMessage(
          'success',
          t('home:settings.sspPulse.unsubscribe_success'),
        );
      } else {
        displayMessage(
          'error',
          response.data?.data?.message ||
            t('home:settings.sspPulse.err_unsubscribe'),
        );
      }
    } catch (error) {
      console.error('[Pulse Unsubscribe]', error);
      displayMessage('error', t('home:settings.sspPulse.err_unsubscribe'));
    } finally {
      setPulseLoading(false);
    }
  };

  const fiatOptions = () => {
    const fiatOptions = [];
    for (const fiat of supportedFiatValues) {
      fiatOptions.push({
        value: fiat,
        label: fiat,
        desc: getFiatSymbol(fiat) ? `${fiat} (${getFiatSymbol(fiat)})` : fiat,
      });
    }
    return fiatOptions;
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:settings.settings')}
        open={open}
        onCancel={handleNotOk}
        style={{ textAlign: 'center', top: 60, width: 200 }}
        footer={[]}
      >
        <h3>{t('home:settings.language')}</h3>
        <Space direction="vertical" size="large">
          <LanguageSelector label={true} />
        </Space>
        <h3>{t('home:settings.fiat_currency')}</h3>
        <Space direction="vertical" size="large">
          <Select
            popupMatchSelectWidth={false}
            suffixIcon={undefined}
            variant={'outlined'}
            value={sspFiatCurrency}
            optionLabelProp={'desc'}
            onChange={(value) => setSspFiatCurrency(value)}
            style={{ width: 'fit-content' }}
            dropdownStyle={{ minWidth: '130px' }}
            options={fiatOptions()}
            optionRender={(option) => <>{option.data.desc}</>}
          />
        </Space>
        <h3>{t('home:settings.change_pw')}</h3>
        <Space direction="vertical" size="large">
          <Button type="default" block size="middle" onClick={handleNotOk}>
            <Link to={'/restore'}>{t('home:settings.change_pw_restore')}</Link>
          </Button>
        </Space>
        <h3>
          <span>
            {t('home:settings.public_nonces_sync')}
            <Tooltip title={t('home:settings.public_nonces_sync_help')}>
              <QuestionCircleOutlined
                style={{
                  marginLeft: 8,
                  color: token.colorPrimary,
                }}
              />
            </Tooltip>
          </span>
        </h3>
        <Space direction="vertical" size="large">
          <Button
            type="default"
            block
            size="middle"
            onClick={handlePublicNoncesSync}
          >
            {t('home:settings.sync_public_nonces')}
          </Button>
        </Space>
        <br />
        <br />
        <h3>
          <span>
            {t('home:settings.sspPulse.title')}
            <Tooltip title={t('home:settings.sspPulse.description')}>
              <QuestionCircleOutlined
                style={{
                  marginLeft: 8,
                  color: token.colorPrimary,
                }}
              />
            </Tooltip>
          </span>
        </h3>
        <Space direction="vertical" size="middle">
          {!isPulseSubscribed ? (
            <>
              <Input
                size="middle"
                type="email"
                placeholder={t('home:settings.sspPulse.email_placeholder')}
                value={pulseEmail}
                onChange={(e) => setPulseEmail(e.target.value)}
                disabled={pulseLoading}
                style={{ width: 220 }}
              />
              <Button
                type="primary"
                size="middle"
                onClick={handlePulseSubscribe}
                loading={pulseLoading}
              >
                {t('home:settings.sspPulse.subscribe')}
              </Button>
            </>
          ) : (
            <>
              <div style={{ color: token.colorTextSecondary }}>
                {t('home:settings.sspPulse.subscribed_as', {
                  email: pulseEmail,
                })}
              </div>
              <Button
                type="default"
                danger
                size="middle"
                onClick={handlePulseUnsubscribe}
                loading={pulseLoading}
              >
                {t('home:settings.sspPulse.unsubscribe')}
              </Button>
            </>
          )}
        </Space>
        <br />
        <br />
        <h3>{t('home:settings.ssp_relay')}</h3>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder={originalConfig.relay}
            value={sspConfigRelay}
            onChange={(e) => setSspConfigRelay(e.target.value)}
          />
          <Button type="default" size="large" onClick={resetSSP}>
            {t('common:reset')}
          </Button>
        </Space.Compact>
        {backendsOriginalConfig[activeChain].node && (
          <>
            <h3>
              {t('home:settings.chain_node_service', {
                chain: blockchainConfig.name,
              })}
            </h3>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                size="large"
                placeholder={backendsOriginalConfig[activeChain].node}
                value={nodeConfig}
                onChange={(e) => setNodeConfig(e.target.value)}
              />
              <Button type="default" size="large" onClick={resetNodeConfig}>
                {t('common:reset')}
              </Button>
            </Space.Compact>
          </>
        )}
        {backendsOriginalConfig[activeChain].api && (
          <>
            <h3>
              {t('home:settings.chain_api_service', {
                chain: blockchainConfig.name,
              })}
            </h3>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                size="large"
                placeholder={backendsOriginalConfig[activeChain].api}
                value={apiConfig}
                onChange={(e) => setApiConfig(e.target.value)}
              />
              <Button type="default" size="large" onClick={resetApiConfig}>
                {t('common:reset')}
              </Button>
            </Space.Compact>
          </>
        )}
        {backendsOriginalConfig[activeChain].explorer && (
          <>
            <h3>
              {t('home:settings.chain_explorer_service', {
                chain: blockchainConfig.name,
              })}
            </h3>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                size="large"
                placeholder={backendsOriginalConfig[activeChain].explorer}
                value={explorerConfig}
                onChange={(e) => setExplorerConfig(e.target.value)}
              />
              <Button type="default" size="large" onClick={resetExplorerConfig}>
                {t('common:reset')}
              </Button>
            </Space.Compact>
          </>
        )}
        <br />
        <br />
        <br />
        <br />
        <Space direction="vertical" size="large">
          <Button type="primary" size="large" onClick={handleOk}>
            {t('common:save')}
          </Button>
          <Button type="link" block size="small" onClick={handleNotOk}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Modal>
      <ConfirmPublicNoncesKey
        open={publicNoncesModalOpen}
        openAction={setPublicNoncesModalOpen}
      />
    </>
  );
}

export default Settings;
