import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Input, Space, Select, Tooltip, theme } from 'antd';
import {
  ChevronRight as ChevronRightIcon,
  CircleHelp as CircleHelpIcon,
  Link as LinkIcon,
} from 'lucide-react';
import { NoticeType } from 'antd/es/message/interface';
import { toast } from '../../lib/toast';
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
import { useThemeMode } from '../../contexts/ThemeContext';
import type { ThemeMode } from '../../contexts/ThemeContext';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import LanguageSelector from '../../components/LanguageSelector/LanguageSelector.tsx';
import { currency, cryptos } from '../../types';
import { supportedFiatValues, getFiatSymbol } from '../../lib/currency.ts';
import { setFiatRates } from '../../store';
import axios from 'axios';
import ConfirmPublicNoncesKey from '../ConfirmPublicNoncesKey/ConfirmPublicNoncesKey';
import secureLocalStorage from 'react-secure-storage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import { getFingerprint } from '../../lib/fingerprint';
import { getScriptType } from '../../lib/wallet';
import WkSign from '../WkSign/WkSign';
import type { WkSignResponse } from '../../lib/wkSign';
import AddressDetails from '../AddressDetails/AddressDetails';
import SspWalletDetails from '../SspWalletDetails/SspWalletDetails';
import ManualSign from '../ManualSign/ManualSign';
import PasswordConfirm from '../PasswordConfirm/PasswordConfirm';
import WalletConnect from '../WalletConnect/WalletConnect';
import TutorialTrigger from '../Tutorial/TutorialTrigger';
import './Settings.css';

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

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2 className="settings-section-title">{title}</h2>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function Row({
  label,
  help,
  children,
}: {
  label: React.ReactNode;
  help?: string;
  children: React.ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        {label}
        {help && (
          <Tooltip title={help}>
            <CircleHelpIcon
              style={{ marginLeft: 6, color: token.colorPrimary }}
            />
          </Tooltip>
        )}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

/**
 * Settings — Phase 3 sectioned, routed page (General / Security / Networks /
 * SSP Enterprise) replacing the old ~990-line single Settings modal. No
 * separate Advanced section: every power-user item already has a home (relay +
 * per-chain node/API/explorer endpoints live under Networks). Every previous
 * setting is preserved; the theme toggle lives under General, and the utilities
 * that used to hang off the Navbar burger (address details, SSP wallet details,
 * sign message, WalletConnect, tutorial) are relocated here so nothing became
 * unreachable when Home dropped the hamburger.
 */
function Settings() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const {
    activeChain,
    sspWalletKeyInternalIdentity,
    sspWalletInternalIdentity,
  } = useAppSelector((state) => state.sspState);
  const { createWkIdentityAuth } = useRelayAuth();
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const { fiatRates } = useAppSelector((state) => state.fiatCryptoRates);
  const { t } = useTranslation(['home', 'common']);
  const NC = backends()[activeChain].node;
  const API = backends()[activeChain].api;
  const EXPLORER = backends()[activeChain].explorer;
  const [sspConfigRelay, setSspConfigRelay] = useState(sspConfig().relay);
  const SSPFC = sspConfig().fiatCurrency;
  const [sspFiatCurrency, setSspFiatCurrency] = useState(SSPFC);
  const [nodeConfig, setNodeConfig] = useState(NC);
  const [apiConfig, setApiConfig] = useState(API);
  const [explorerConfig, setExplorerConfig] = useState(EXPLORER);
  const [publicNoncesModalOpen, setPublicNoncesModalOpen] = useState(false);
  const { token } = theme.useToken();
  const blockchainConfig = blockchains[activeChain];
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const isEVM = blockchainConfig.chainType === 'evm';

  // Relocated Navbar utilities
  const [openAddressDetails, setOpenAddressDetails] = useState(false);
  const [openSspWalletDetails, setOpenSspWalletDetails] = useState(false);
  const [openManualSign, setOpenManualSign] = useState(false);
  const [openWalletConnect, setOpenWalletConnect] = useState(false);
  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const [actionToPerform, setActionToPerform] = useState('');
  const [triggerTutorial, setTriggerTutorial] = useState(false);

  // SSP Enterprise Notification state
  const enterpriseConfigData = getEnterpriseNotificationConfig();
  const [enterpriseEmail, setEnterpriseEmail] = useState(
    enterpriseConfigData?.email ?? '',
  );
  const [isEnterpriseSubscribed, setIsEnterpriseSubscribed] = useState(
    !!(enterpriseConfigData?.isSubscribed && enterpriseConfigData?.email),
  );
  const [enterpriseLoading, setEnterpriseLoading] = useState(false);
  const [subscriptionStep, setSubscriptionStep] = useState<
    'email' | 'verification' | 'signing'
  >('email');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [, setCodeExpiresInMinutes] = useState<number | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(
    null,
  );

  const [showWkSign, setShowWkSign] = useState(false);
  const [wkSignMessage, setWkSignMessage] = useState<string>('');
  const [signingOperation, setSigningOperation] = useState<
    'subscribe' | 'unsubscribe' | null
  >(null);

  const backendsOriginalConfig = backendsOriginal();
  const originalConfig = sspConfigOriginal();

  useEffect(() => {
    setNodeConfig(NC);
    setApiConfig(API);
    setExplorerConfig(EXPLORER);
  }, [activeChain]);

  useEffect(() => {
    const config = getEnterpriseNotificationConfig();
    setEnterpriseEmail(config?.email ?? '');
    setIsEnterpriseSubscribed(!!(config?.isSubscribed && config?.email));
  }, []);

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

  const completeUnsubscribe = async (result: WkSignResponse) => {
    try {
      const requestBody: Record<string, unknown> = {
        wkIdentity: sspWalletKeyInternalIdentity,
        subscriptionMessage: result.message,
        walletSignature: result.walletSignature,
        walletPubKey: result.walletPubKey,
        keySignature: result.keySignature,
        keyPubKey: result.keyPubKey,
        wkWitnessScript: result.witnessScript,
      };
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
    void toast.open({ type, content });
  };

  const handleSave = async () => {
    try {
      const sspConf: sspConfigType = {};
      if (originalConfig.relay !== sspConfigRelay) {
        sspConf.relay = sspConfigRelay;
      }
      if (originalConfig.fiatCurrency !== sspFiatCurrency) {
        sspConf.fiatCurrency = sspFiatCurrency;
      }
      if (Object.keys(sspConf).length > 0) {
        await localForage.setItem('sspConfig', sspConf).catch(console.log);
      } else {
        await localForage.removeItem('sspConfig').catch(console.log);
      }
      const storedBackends: backends =
        (await localForage.getItem('backends')) ?? {};
      if (!storedBackends[activeChain]) {
        storedBackends[activeChain] = {
          ...backendsOriginalConfig[activeChain],
        };
      }
      if (storedBackends?.[activeChain]?.node !== nodeConfig) {
        storedBackends[activeChain].node = nodeConfig;
      }
      if (storedBackends?.[activeChain]?.api !== apiConfig) {
        storedBackends[activeChain].api = apiConfig;
      }
      if (storedBackends?.[activeChain]?.explorer !== explorerConfig) {
        storedBackends[activeChain].explorer = explorerConfig;
      }
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
      if (Object.keys(storedBackends?.[activeChain]).length === 0) {
        delete storedBackends?.[activeChain];
      }
      if (Object.keys(storedBackends).length === 0) {
        await localForage.removeItem('backends').catch(console.log);
      } else {
        await localForage
          .setItem('backends', storedBackends)
          .catch(console.log);
      }
      loadBackendsConfig();
      loadSSPConfig();
      displayMessage('success', t('common:saved', 'Saved'));
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
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) {
        Object.assign(data, auth);
      }
    } catch (error) {
      console.warn('[postAction] Auth not available', error);
    }
    axios
      .post(`https://${sspConfig().relay}/v1/action`, data)
      .then((res) => console.log(res))
      .catch((error) => console.log(error));
  };

  const handlePublicNoncesSync = () => {
    setPublicNoncesModalOpen(true);
    postAction(
      'publicnoncesrequest',
      '[]',
      activeChain,
      '',
      sspWalletKeyInternalIdentity,
    );
  };

  const validateEmail = (email: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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

  const handleEnterpriseVerifyCode = async (codeParam?: string) => {
    if (enterpriseLoading) return;
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

  const handleWkSignResult = (
    data: { status: string; result?: WkSignResponse } | null,
  ) => {
    setShowWkSign(false);
    if (!data || data.status !== 'SUCCESS' || !data.result) {
      if (signingOperation) {
        displayMessage(
          'error',
          t('home:settings.sspEnterprise.signing_cancelled'),
        );
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

  const passwordConfirmAction = (status: boolean) => {
    if (status === true) {
      if (actionToPerform === 'address') setOpenAddressDetails(true);
      if (actionToPerform === 'sspwallet') setOpenSspWalletDetails(true);
    }
    setPasswordConfirmOpen(false);
  };

  const fiatOptions = () => {
    const opts = [];
    for (const fiat of supportedFiatValues) {
      opts.push({
        value: fiat,
        label: fiat,
        desc: getFiatSymbol(fiat) ? `${fiat} (${getFiatSymbol(fiat)})` : fiat,
      });
    }
    return opts;
  };

  const navRow = (label: string, onClick: () => void, help?: string) => (
    <button type="button" className="settings-nav-row" onClick={onClick}>
      <span>
        {label}
        {help && (
          <Tooltip title={help}>
            <CircleHelpIcon
              style={{ marginLeft: 6, color: token.colorPrimary }}
            />
          </Tooltip>
        )}
      </span>
      <ChevronRightIcon className="settings-nav-caret" />
    </button>
  );

  return (
    <div className="settings-page">
      {/* The 4th tab destination is the full extended menu (settings +
          relocated utilities), so it is titled "Menu" everywhere user-visible. */}
      <h1 className="settings-page-title">{t('home:tabs.menu', 'Menu')}</h1>

      <Section title={t('home:settings.general', 'General')}>
        <Row label={t('home:settings.language')}>
          <LanguageSelector label={false} />
        </Row>
        <Row label={t('home:settings.fiat_currency')}>
          <Select
            popupMatchSelectWidth={false}
            value={sspFiatCurrency}
            optionLabelProp={'desc'}
            onChange={(value) => setSspFiatCurrency(value)}
            style={{ minWidth: 110 }}
            options={fiatOptions()}
            optionRender={(option) => <>{option.data.desc}</>}
          />
        </Row>
        <Row label={t('home:settings.theme')}>
          <Select
            popupMatchSelectWidth={false}
            value={themeMode}
            onChange={(value: ThemeMode) => setThemeMode(value)}
            style={{ minWidth: 110 }}
            options={[
              { value: 'system', label: t('home:settings.theme_system') },
              { value: 'light', label: t('home:settings.theme_light') },
              { value: 'dark', label: t('home:settings.theme_dark') },
            ]}
          />
        </Row>
        {navRow(t('home:tutorial.tutorial_help'), () =>
          setTriggerTutorial(true),
        )}
      </Section>

      <Section title={t('home:settings.security', 'Security')}>
        {navRow(t('home:navbar.addr_details'), () => {
          setActionToPerform('address');
          setPasswordConfirmOpen(true);
        })}
        {navRow(t('home:navbar.ssp_details'), () => {
          setActionToPerform('sspwallet');
          setPasswordConfirmOpen(true);
        })}
        {navRow(t('home:navbar.ssp_message_sign'), () =>
          setOpenManualSign(true),
        )}
        <Row
          label={t('home:settings.public_nonces_sync')}
          help={t('home:settings.public_nonces_sync_help')}
        >
          <Button size="middle" onClick={handlePublicNoncesSync}>
            {t('home:settings.sync_public_nonces')}
          </Button>
        </Row>
        <Row label={t('home:settings.change_pw')}>
          <Button type="default" size="middle">
            <Link to={'/restore'}>{t('home:settings.change_pw_restore')}</Link>
          </Button>
        </Row>
      </Section>

      <Section title={t('home:settings.networks', 'Networks')}>
        {navRow(
          t('home:walletconnect.title'),
          () => setOpenWalletConnect(true),
          isEVM
            ? undefined
            : t('home:walletconnect.evm_only', 'EVM chains only'),
        )}
        <Row label={t('home:settings.ssp_relay')}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder={originalConfig.relay}
              value={sspConfigRelay}
              onChange={(e) => setSspConfigRelay(e.target.value)}
            />
            <Button onClick={resetSSP}>{t('common:reset')}</Button>
          </Space.Compact>
        </Row>
        {backendsOriginalConfig[activeChain].node && (
          <Row
            label={t('home:settings.chain_node_service', {
              chain: blockchainConfig.name,
            })}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder={backendsOriginalConfig[activeChain].node}
                value={nodeConfig}
                onChange={(e) => setNodeConfig(e.target.value)}
              />
              <Button onClick={resetNodeConfig}>{t('common:reset')}</Button>
            </Space.Compact>
          </Row>
        )}
        {backendsOriginalConfig[activeChain].api && (
          <Row
            label={t('home:settings.chain_api_service', {
              chain: blockchainConfig.name,
            })}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder={backendsOriginalConfig[activeChain].api}
                value={apiConfig}
                onChange={(e) => setApiConfig(e.target.value)}
              />
              <Button onClick={resetApiConfig}>{t('common:reset')}</Button>
            </Space.Compact>
          </Row>
        )}
        {backendsOriginalConfig[activeChain].explorer && (
          <Row
            label={t('home:settings.chain_explorer_service', {
              chain: blockchainConfig.name,
            })}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder={backendsOriginalConfig[activeChain].explorer}
                value={explorerConfig}
                onChange={(e) => setExplorerConfig(e.target.value)}
              />
              <Button onClick={resetExplorerConfig}>{t('common:reset')}</Button>
            </Space.Compact>
          </Row>
        )}
      </Section>

      <Section
        title={
          <span>
            <LinkIcon style={{ marginRight: 6 }} />
            {t('home:settings.sspEnterprise.title')}
          </span>
        }
      >
        <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.7 }}>
          {t('home:settings.sspEnterprise.description')}
        </div>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {!isEnterpriseSubscribed ? (
            <>
              {subscriptionStep === 'email' && (
                <>
                  <Input
                    type="email"
                    placeholder={t(
                      'home:settings.sspEnterprise.email_placeholder',
                    )}
                    value={enterpriseEmail}
                    onChange={(e) => setEnterpriseEmail(e.target.value)}
                    disabled={enterpriseLoading}
                    onPressEnter={handleEnterpriseRequestCode}
                  />
                  <Button
                    type="primary"
                    onClick={handleEnterpriseRequestCode}
                    loading={enterpriseLoading}
                  >
                    {t('home:settings.sspEnterprise.subscribe')}
                  </Button>
                </>
              )}
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
                      onClick={() => {
                        setSubscriptionStep('email');
                        setVerificationCode('');
                      }}
                    >
                      {t('common:back')}
                    </Button>
                    <Button
                      type="primary"
                      onClick={() => handleEnterpriseVerifyCode()}
                      loading={enterpriseLoading}
                      disabled={verificationCode.length !== 6}
                    >
                      {t('home:settings.sspEnterprise.verify_code')}
                    </Button>
                  </Space>
                </>
              )}
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
                      onClick={() => {
                        setSubscriptionStep('email');
                        setVerifiedEmail(null);
                      }}
                    >
                      {t('common:cancel')}
                    </Button>
                    <Button
                      type="primary"
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
                danger
                onClick={handleEnterpriseUnsubscribe}
                loading={enterpriseLoading}
              >
                {t('home:settings.sspEnterprise.unsubscribe')}
              </Button>
            </>
          )}
        </Space>
      </Section>

      <div className="settings-save-bar">
        <Button type="primary" size="large" block onClick={handleSave}>
          {t('common:save')}
        </Button>
        <Button type="link" block onClick={() => navigate('/home')}>
          {t('common:done', 'Done')}
        </Button>
      </div>

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
      <PasswordConfirm
        open={passwordConfirmOpen}
        openAction={passwordConfirmAction}
      />
      <AddressDetails
        open={openAddressDetails}
        openAction={setOpenAddressDetails}
      />
      <SspWalletDetails
        open={openSspWalletDetails}
        openAction={setOpenSspWalletDetails}
      />
      <ManualSign open={openManualSign} openAction={setOpenManualSign} />
      <WalletConnect
        open={openWalletConnect}
        openAction={setOpenWalletConnect}
      />
      <TutorialTrigger
        autoStart={false}
        showWelcomePrompt={false}
        isNewWallet={false}
        walletSynced={false}
        forceShowWelcome={triggerTutorial}
        onWelcomeDismiss={() => setTriggerTutorial(false)}
      />
    </div>
  );
}

export default Settings;
