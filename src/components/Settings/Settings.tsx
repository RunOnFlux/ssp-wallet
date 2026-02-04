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
  getEnterpriseNotificationConfig,
  subscribeToEnterpriseNotifications,
  unsubscribeFromEnterpriseNotifications,
  getDefaultEnterpriseNotificationPreferences,
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
import WkSign from '../WkSign/WkSign';
import type { WkSignResponse } from '../../lib/wkSign';

interface sspConfigType {
  relay?: string;
  fiatCurrency?: keyof currency;
}

interface EnterpriseNotificationApiResponse {
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

  // SSP Enterprise Notification state
  const enterpriseConfigData = getEnterpriseNotificationConfig();
  const [enterpriseEmail, setEnterpriseEmail] = useState(
    enterpriseConfigData?.email ?? '',
  );
  const [isEnterpriseSubscribed, setIsEnterpriseSubscribed] = useState(
    !!(enterpriseConfigData?.isSubscribed && enterpriseConfigData?.email),
  );
  const [enterpriseLoading, setEnterpriseLoading] = useState(false);
  // Multi-step subscription state
  const [subscriptionStep, setSubscriptionStep] = useState<
    'email' | 'verification' | 'signing'
  >('email');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [, setCodeExpiresInMinutes] = useState<number | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(
    null,
  );

  // WK signing state for enterprise operations
  const [showWkSign, setShowWkSign] = useState(false);
  const [wkSignMessage, setWkSignMessage] = useState<string>('');
  const [signingOperation, setSigningOperation] = useState<
    'subscribe' | 'unsubscribe' | null
  >(null);

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

  // Sync enterprise state when modal opens
  useEffect(() => {
    if (open) {
      const config = getEnterpriseNotificationConfig();
      setEnterpriseEmail(config?.email ?? '');
      setIsEnterpriseSubscribed(!!(config?.isSubscribed && config?.email));
    }
  }, [open]);

  // Complete subscribe after receiving WK signature
  const completeSubscribe = async (result: WkSignResponse) => {
    if (!verifiedEmail) {
      displayMessage('error', t('home:settings.sspEnterprise.err_subscribe'));
      setEnterpriseLoading(false);
      return;
    }

    try {
      const fingerprint = getFingerprint();
      const password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') throw new Error('Failed to decrypt');

      const chainKeys = Object.keys(blockchains) as (keyof cryptos)[];
      const chains: Record<string, { walletXpub: string; keyXpub: string }> =
        {};

      for (const chain of chainKeys) {
        const chainConfig = blockchains[chain];
        const xpubKey = `xpub-48-${chainConfig.slip}-0-${getScriptType(chainConfig.scriptType)}-${chainConfig.id}`;
        const xpub2Key = `2-xpub-48-${chainConfig.slip}-0-${getScriptType(chainConfig.scriptType)}-${chainConfig.id}`;
        const xpubEncrypted = secureLocalStorage.getItem(xpubKey);
        const xpub2Encrypted = secureLocalStorage.getItem(xpub2Key);

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
          } catch {
            // Skip
          }
        }
      }

      // Build request body
      const requestBody: Record<string, unknown> = {
        wkIdentity: sspWalletKeyInternalIdentity,
        walletIdentity: sspWalletInternalIdentity,
        email: verifiedEmail,
        chains,
        preferences: getDefaultEnterpriseNotificationPreferences(),
        subscriptionMessage: result.message,
        walletSignature: result.walletSignature,
        walletPubKey: result.walletPubKey,
        keySignature: result.keySignature,
        keyPubKey: result.keyPubKey,
        wkWitnessScript: result.witnessScript,
      };

      // Add request authentication (required by middleware)
      const auth = await createWkIdentityAuth(
        'action',
        sspWalletKeyInternalIdentity,
        requestBody,
      );
      if (auth) {
        Object.assign(requestBody, auth);
      }

      const response = await axios.post<EnterpriseNotificationApiResponse>(
        `https://${sspConfig().relay}/v1/enterprise/subscribe`,
        requestBody,
      );

      if (response.data?.status === 'success' && response.data?.data?.success) {
        await subscribeToEnterpriseNotifications(verifiedEmail);
        setIsEnterpriseSubscribed(true);
        setSubscriptionStep('email');
        setVerifiedEmail(null);
        setVerificationCode('');
        displayMessage(
          'success',
          t('home:settings.sspEnterprise.subscribe_success'),
        );
      } else {
        displayMessage(
          'error',
          response.data?.data?.message ||
            t('home:settings.sspEnterprise.err_subscribe'),
        );
      }
    } catch (error) {
      console.error('[Settings completeSubscribe]', error);
      displayMessage('error', t('home:settings.sspEnterprise.err_subscribe'));
    } finally {
      setEnterpriseLoading(false);
    }
  };

  // Complete unsubscribe after receiving WK signature
  const completeUnsubscribe = async (result: WkSignResponse) => {
    try {
      // Build request body
      const requestBody: Record<string, unknown> = {
        wkIdentity: sspWalletKeyInternalIdentity,
        subscriptionMessage: result.message,
        walletSignature: result.walletSignature,
        walletPubKey: result.walletPubKey,
        keySignature: result.keySignature,
        keyPubKey: result.keyPubKey,
        wkWitnessScript: result.witnessScript,
      };

      // Add request authentication (required by middleware)
      const auth = await createWkIdentityAuth(
        'action',
        sspWalletKeyInternalIdentity,
        requestBody,
      );
      if (auth) {
        Object.assign(requestBody, auth);
      }

      const response = await axios.post<EnterpriseNotificationApiResponse>(
        `https://${sspConfig().relay}/v1/enterprise/unsubscribe`,
        requestBody,
      );

      if (response.data?.status === 'success' && response.data?.data?.success) {
        await unsubscribeFromEnterpriseNotifications();
        setIsEnterpriseSubscribed(false);
        setEnterpriseEmail('');
        displayMessage(
          'success',
          t('home:settings.sspEnterprise.unsubscribe_success'),
        );
      } else {
        displayMessage(
          'error',
          response.data?.data?.message ||
            t('home:settings.sspEnterprise.err_unsubscribe'),
        );
      }
    } catch (error) {
      console.error('[Settings completeUnsubscribe]', error);
      displayMessage('error', t('home:settings.sspEnterprise.err_unsubscribe'));
    } finally {
      setEnterpriseLoading(false);
    }
  };

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
    // Reset enterprise subscription state
    setSubscriptionStep('email');
    setVerificationCode('');
    setVerifiedEmail(null);
    setCodeExpiresInMinutes(null);
    setRemainingAttempts(null);
    setShowWkSign(false);
    setWkSignMessage('');
    setSigningOperation(null);
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

  // SSP Enterprise Notification handlers
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Step 1: Request verification code for new subscription
  const handleEnterpriseRequestCode = async () => {
    if (!enterpriseEmail || !validateEmail(enterpriseEmail)) {
      displayMessage(
        'error',
        t('home:settings.sspEnterprise.err_invalid_email'),
      );
      return;
    }

    setEnterpriseLoading(true);
    try {
      const response = await axios.post<{
        status: string;
        data?: {
          success: boolean;
          message?: string;
          expiresInMinutes?: number;
          remainingCodes?: number;
          error?: string;
        };
      }>(`https://${sspConfig().relay}/v1/enterprise/email/verify/request`, {
        email: enterpriseEmail,
        wkIdentity: sspWalletKeyInternalIdentity,
        purpose: 'subscription',
      });

      if (response.data?.status === 'success' && response.data?.data?.success) {
        setCodeExpiresInMinutes(response.data.data.expiresInMinutes || 10);
        setSubscriptionStep('verification');
        setVerificationCode('');
        setRemainingAttempts(null);
        displayMessage('success', t('home:settings.sspEnterprise.code_sent'));
      } else {
        displayMessage(
          'error',
          response.data?.data?.error ||
            response.data?.data?.message ||
            t('home:settings.sspEnterprise.err_request_code'),
        );
      }
    } catch (error) {
      console.error('[Enterprise Request Code]', error);
      displayMessage(
        'error',
        t('home:settings.sspEnterprise.err_request_code'),
      );
    } finally {
      setEnterpriseLoading(false);
    }
  };

  // Step 2: Verify the code for new subscription
  const handleEnterpriseVerifyCode = async (codeParam?: string) => {
    // Prevent duplicate calls while loading
    if (enterpriseLoading) {
      return;
    }

    // Use passed code (from onChange) or fall back to state (from button click)
    const codeToVerify = codeParam ?? verificationCode;
    const cleanCode = codeToVerify.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!cleanCode || cleanCode.length !== 6) {
      displayMessage(
        'error',
        t('home:settings.sspEnterprise.err_invalid_code'),
      );
      return;
    }

    setEnterpriseLoading(true);
    try {
      const response = await axios.post<{
        status: string;
        data?: {
          success: boolean;
          message?: string;
          remainingAttempts?: number;
          error?: string;
        };
      }>(`https://${sspConfig().relay}/v1/enterprise/email/verify/confirm`, {
        email: enterpriseEmail,
        code: cleanCode,
        wkIdentity: sspWalletKeyInternalIdentity,
        purpose: 'subscription',
      });

      if (response.data?.status === 'success' && response.data?.data?.success) {
        setVerifiedEmail(enterpriseEmail);
        setSubscriptionStep('signing');
        displayMessage(
          'success',
          t('home:settings.sspEnterprise.email_verified'),
        );
      } else {
        if (response.data?.data?.remainingAttempts !== undefined) {
          setRemainingAttempts(response.data.data.remainingAttempts);
        }
        displayMessage(
          'error',
          response.data?.data?.error ||
            response.data?.data?.message ||
            t('home:settings.sspEnterprise.err_invalid_code'),
        );
      }
    } catch (error) {
      console.error('[Enterprise Verify Code]', error);
      displayMessage('error', t('home:settings.sspEnterprise.err_verify_code'));
    } finally {
      setEnterpriseLoading(false);
    }
  };

  // Step 3: Show WK signing dialog for subscription
  const handleEnterpriseSignAndSubscribe = () => {
    if (!verifiedEmail) {
      displayMessage(
        'error',
        t('home:settings.sspEnterprise.err_email_not_verified'),
      );
      return;
    }

    const msg = `${Date.now()} SSP Enterprise subscription for ${verifiedEmail}`;
    setWkSignMessage(msg);
    setSigningOperation('subscribe');
    setShowWkSign(true);
  };

  const handleEnterpriseUnsubscribe = () => {
    const msg = `${Date.now()} SSP Enterprise unsubscribe for ${enterpriseEmail}`;
    setWkSignMessage(msg);
    setSigningOperation('unsubscribe');
    setShowWkSign(true);
  };

  // Handle WkSign result
  const handleWkSignResult = (data: { status: string; result?: WkSignResponse } | null) => {
    setShowWkSign(false);

    if (!data || data.status !== 'SUCCESS' || !data.result) {
      // Cancelled or failed
      if (signingOperation) {
        displayMessage('error', t('home:settings.sspEnterprise.signing_cancelled'));
      }
      setSigningOperation(null);
      return;
    }

    setEnterpriseLoading(true);

    if (signingOperation === 'subscribe') {
      void completeSubscribe(data.result);
    } else if (signingOperation === 'unsubscribe') {
      void completeUnsubscribe(data.result);
    }

    setSigningOperation(null);
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
            {t('home:settings.sspEnterprise.title')}
            <Tooltip title={t('home:settings.sspEnterprise.description')}>
              <QuestionCircleOutlined
                style={{
                  marginLeft: 8,
                  color: token.colorPrimary,
                }}
              />
            </Tooltip>
          </span>
        </h3>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {!isEnterpriseSubscribed ? (
            <>
              {/* Step 1: Email Input */}
              {subscriptionStep === 'email' && (
                <>
                  <Input
                    size="middle"
                    type="email"
                    placeholder={t(
                      'home:settings.sspEnterprise.email_placeholder',
                    )}
                    value={enterpriseEmail}
                    onChange={(e) => setEnterpriseEmail(e.target.value)}
                    disabled={enterpriseLoading}
                    style={{ width: 220 }}
                    onPressEnter={handleEnterpriseRequestCode}
                  />
                  <Button
                    type="primary"
                    size="middle"
                    onClick={handleEnterpriseRequestCode}
                    loading={enterpriseLoading}
                  >
                    {t('home:settings.sspEnterprise.subscribe')}
                  </Button>
                </>
              )}

              {/* Step 2: Verification Code */}
              {subscriptionStep === 'verification' && (
                <>
                  <div
                    style={{ color: token.colorTextSecondary, fontSize: 12 }}
                  >
                    {t('home:settings.sspEnterprise.code_sent_to', {
                      email: enterpriseEmail,
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Input.OTP
                      length={6}
                      size="large"
                      value={verificationCode}
                      onChange={(value) => {
                        const cleanValue = value
                          .replace(/[^A-Za-z0-9]/g, '')
                          .toUpperCase();
                        setVerificationCode(cleanValue);
                        if (cleanValue.length === 6 && !enterpriseLoading) {
                          handleEnterpriseVerifyCode(cleanValue);
                        }
                      }}
                      disabled={enterpriseLoading}
                    />
                  </div>
                  {remainingAttempts !== null && remainingAttempts < 5 && (
                    <div style={{ color: token.colorWarning, fontSize: 11 }}>
                      {t('home:settings.sspEnterprise.remaining_attempts', {
                        count: remainingAttempts,
                      })}
                    </div>
                  )}
                  <Space>
                    <Button
                      type="default"
                      size="middle"
                      onClick={() => {
                        setSubscriptionStep('email');
                        setVerificationCode('');
                      }}
                    >
                      {t('common:back')}
                    </Button>
                    <Button
                      type="primary"
                      size="middle"
                      onClick={() => handleEnterpriseVerifyCode()}
                      loading={enterpriseLoading}
                      disabled={verificationCode.length !== 6}
                    >
                      {t('home:settings.sspEnterprise.verify_code')}
                    </Button>
                  </Space>
                </>
              )}

              {/* Step 3: WK Signing */}
              {subscriptionStep === 'signing' && (
                <>
                  <div style={{ color: token.colorSuccess, fontSize: 12 }}>
                    ✓ {t('home:settings.sspEnterprise.email_verified')}
                  </div>
                  <div
                    style={{ color: token.colorTextSecondary, fontSize: 12 }}
                  >
                    {t('home:settings.sspEnterprise.signing_required')}
                  </div>
                  <Space>
                    <Button
                      type="default"
                      size="middle"
                      onClick={() => {
                        setSubscriptionStep('email');
                        setVerifiedEmail(null);
                      }}
                    >
                      {t('common:cancel')}
                    </Button>
                    <Button
                      type="primary"
                      size="middle"
                      onClick={handleEnterpriseSignAndSubscribe}
                      loading={enterpriseLoading}
                    >
                      {t('home:settings.sspEnterprise.sign_and_subscribe')}
                    </Button>
                  </Space>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ color: token.colorTextSecondary }}>
                {t('home:settings.sspEnterprise.subscribed_as', {
                  email: enterpriseEmail,
                })}
              </div>
              <Button
                type="default"
                danger
                size="middle"
                onClick={handleEnterpriseUnsubscribe}
                loading={enterpriseLoading}
              >
                {t('home:settings.sspEnterprise.unsubscribe')}
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
      <WkSign
        open={showWkSign}
        message={wkSignMessage}
        authMode={2}
        requesterInfo={{
          siteName: 'SSP Enterprise',
          origin: 'SSP Wallet',
          description: t('home:settings.sspEnterprise.description'),
        }}
        openAction={handleWkSignResult}
      />
    </>
  );
}

export default Settings;
