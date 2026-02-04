import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { RootState } from '../../store';
import { useAppSelector } from '../../hooks';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import TutorialOverlay, { TutorialStep } from './TutorialOverlay';
import { getTutorialSteps } from './tutorialSteps';
import { setTutorialState, setTutorialStep } from '../../store/index';
import {
  updateTutorialConfig,
  resetTutorial,
  sspConfig,
  subscribeToEnterpriseNotifications,
  getDefaultEnterpriseNotificationPreferences,
  getEnterpriseNotificationConfig,
} from '../../storage/ssp';
import { blockchains } from '../../storage/blockchains';
import { getFingerprint } from '../../lib/fingerprint';
import { getScriptType } from '../../lib/wallet';
import WkSign from '../WkSign/WkSign';
import type { WkSignResponse } from '../../lib/wkSign';
import { cryptos } from '../../types';

interface TutorialContextType {
  startTutorial: (tutorialType?: string) => void;
  skipTutorial: () => void;
  pauseTutorial: () => void;
  resetTutorial: () => void;
  isActive: boolean;
  currentStep: number;
  tutorialType: string;
}

const TutorialContext = createContext<TutorialContextType | undefined>(
  undefined,
);

interface TutorialProviderProps {
  children: ReactNode;
}

interface EnterpriseNotificationApiResponse {
  status: string;
  data?: {
    success: boolean;
    message?: string;
  };
}

export const TutorialProvider: React.FC<TutorialProviderProps> = ({
  children,
}) => {
  const dispatch = useDispatch();
  const { t } = useTranslation(['home']);
  const tutorialState = useSelector((state: RootState) => state.tutorial);
  const {
    activeChain,
    sspWalletKeyInternalIdentity,
    sspWalletInternalIdentity,
  } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const { xpubKey: ethXpubKey } = useAppSelector((state) => state.eth);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { createWkIdentityAuth } = useRelayAuth();
  const [currentSteps, setCurrentSteps] = useState<TutorialStep[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [expectedChain, setExpectedChain] = useState<string>('');
  const [pendingTutorialType, setPendingTutorialType] = useState<string>('');

  // Enterprise notification subscription state for tutorial completion
  const [enterpriseEmail, setEnterpriseEmail] = useState('');
  const [enterpriseVerificationCode, setEnterpriseVerificationCode] =
    useState('');
  const [enterpriseSubscriptionStep, setEnterpriseSubscriptionStep] = useState<
    'email' | 'verification' | 'signing'
  >('email');
  const [enterpriseLoading, setEnterpriseLoading] = useState(false);
  const [enterpriseSubscribed, setEnterpriseSubscribed] = useState(() => {
    const config = getEnterpriseNotificationConfig();
    return !!(config?.isSubscribed && config?.email);
  });
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
  const [codeExpiresInMinutes, setCodeExpiresInMinutes] = useState<
    number | null
  >(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(
    null,
  );
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  // WkSign state for enterprise subscription
  const [showWkSign, setShowWkSign] = useState(false);
  const [wkSignMessage, setWkSignMessage] = useState<string>('');

  // Step 1: Request verification code
  const handleEnterpriseRequestCode = async (
    email: string,
  ): Promise<boolean> => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEnterpriseError(t('home:settings.sspEnterprise.err_invalid_email'));
      return false;
    }

    setEnterpriseLoading(true);
    setEnterpriseError(null);

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
        email,
        wkIdentity: sspWalletKeyInternalIdentity,
        purpose: 'subscription',
      });

      if (response.data?.status === 'success' && response.data?.data?.success) {
        setCodeExpiresInMinutes(response.data.data.expiresInMinutes || 10);
        setEnterpriseSubscriptionStep('verification');
        setEnterpriseVerificationCode('');
        setRemainingAttempts(null);
        messageApi.success(t('home:settings.sspEnterprise.code_sent'));
        return true;
      } else {
        setEnterpriseError(
          response.data?.data?.error ||
            response.data?.data?.message ||
            t('home:settings.sspEnterprise.err_request_code'),
        );
        return false;
      }
    } catch (error) {
      console.error('[Enterprise Request Code]', error);
      setEnterpriseError(t('home:settings.sspEnterprise.err_request_code'));
      return false;
    } finally {
      setEnterpriseLoading(false);
    }
  };

  // Step 2: Verify the code
  const handleEnterpriseVerifyCode = async (
    email: string,
    code: string,
  ): Promise<boolean> => {
    // Prevent duplicate calls while loading
    if (enterpriseLoading) {
      return false;
    }

    const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!cleanCode || cleanCode.length !== 6) {
      setEnterpriseError(t('home:settings.sspEnterprise.err_invalid_code'));
      return false;
    }

    setEnterpriseLoading(true);
    setEnterpriseError(null);

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
        email,
        code: cleanCode,
        wkIdentity: sspWalletKeyInternalIdentity,
        purpose: 'subscription',
      });

      if (response.data?.status === 'success' && response.data?.data?.success) {
        setVerifiedEmail(email);
        setEnterpriseSubscriptionStep('signing');
        messageApi.success(t('home:settings.sspEnterprise.email_verified'));
        return true;
      } else {
        if (response.data?.data?.remainingAttempts !== undefined) {
          setRemainingAttempts(response.data.data.remainingAttempts);
        }
        setEnterpriseError(
          response.data?.data?.error ||
            response.data?.data?.message ||
            t('home:settings.sspEnterprise.err_invalid_code'),
        );
        return false;
      }
    } catch (error) {
      console.error('[Enterprise Verify Code]', error);
      setEnterpriseError(t('home:settings.sspEnterprise.err_verify_code'));
      return false;
    } finally {
      setEnterpriseLoading(false);
    }
  };

  // Complete subscription after receiving WK signature
  const completeEnterpriseSubscription = async (result: WkSignResponse) => {
    if (!verifiedEmail) {
      setEnterpriseError(t('home:settings.sspEnterprise.err_subscribe'));
      setEnterpriseLoading(false);
      return;
    }

    try {
      // Decrypt password and get chain xpubs
      const fingerprint = getFingerprint();
      const password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        throw new Error('Failed to decrypt password');
      }

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
            // Skip chain if decryption fails
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

      // Submit subscription with signatures
      const response = await axios.post<EnterpriseNotificationApiResponse>(
        `https://${sspConfig().relay}/v1/enterprise/subscribe`,
        requestBody,
      );

      if (response.data?.status === 'success' && response.data?.data?.success) {
        await subscribeToEnterpriseNotifications(verifiedEmail);
        setEnterpriseSubscribed(true);
        messageApi.success(t('home:settings.sspEnterprise.subscribe_success'));
      } else {
        setEnterpriseError(
          response.data?.data?.message ||
            t('home:settings.sspEnterprise.err_subscribe'),
        );
      }
    } catch (error) {
      console.error('[Enterprise Subscribe]', error);
      setEnterpriseError(t('home:settings.sspEnterprise.err_subscribe'));
    } finally {
      setEnterpriseLoading(false);
    }
  };

  // Handle WkSign result
  const handleWkSignResult = (data: { status: string; result?: WkSignResponse } | null) => {
    setShowWkSign(false);

    if (!data || data.status !== 'SUCCESS' || !data.result) {
      // Cancelled or failed
      setEnterpriseError(t('home:settings.sspEnterprise.signing_cancelled'));
      return;
    }

    setEnterpriseLoading(true);
    void completeEnterpriseSubscription(data.result);
  };

  // Step 3: Show WK signing dialog for subscription
  const handleEnterpriseSignAndSubscribe = async (): Promise<boolean> => {
    if (!verifiedEmail) {
      setEnterpriseError(
        t('home:settings.sspEnterprise.err_email_not_verified'),
      );
      return false;
    }

    setEnterpriseError(null);

    // Generate the message to sign (with timestamp prefix for relay validation)
    const msg = `${Date.now()} SSP Enterprise subscription for ${verifiedEmail}`;
    setWkSignMessage(msg);
    setShowWkSign(true);

    return true; // WkSign modal will handle the rest
  };

  const startTutorial = (tutorialType: string = 'onboarding') => {
    // Ensure we're on the home page
    if (window.location.pathname !== '/home') {
      messageApi.info({
        content: t('home:tutorial.navigating_to_home'),
        duration: 2,
        style: { zIndex: 99999 },
      });

      // Try to navigate using history API if available
      if (window.history && window.history.pushState) {
        window.history.pushState({}, '', '/home');
        // Trigger a popstate event to notify React Router
        window.dispatchEvent(new PopStateEvent('popstate'));
        setPendingTutorialType(tutorialType);
        return;
      } else {
        // Fallback to page reload navigation
        window.location.href = '/home';
        return;
      }
    }

    // Ensure we're on Bitcoin blockchain for the tutorial
    if (activeChain !== 'btc') {
      messageApi.warning({
        content: t('home:tutorial.switch_to_bitcoin_first'),
        duration: 5,
        style: { zIndex: 99999 },
      });
      return;
    }

    // If we're already on home page and Bitcoin chain, check wallet data
    if (wallets && walletInUse && wallets[walletInUse]) {
      setPendingTutorialType('');
      startTutorialInternal(tutorialType);
    } else {
      // Wallet data not ready yet - wait for it
      messageApi.info({
        content: t('home:tutorial.waiting_wallet_data'),
        duration: 2,
        style: { zIndex: 99999 },
      });
      setPendingTutorialType(tutorialType);
    }
  };

  const startTutorialInternal = async (tutorialType: string = 'onboarding') => {
    // Final safety check - ensure we have wallet data
    if (!wallets || !walletInUse || !wallets[walletInUse]) {
      console.error('Cannot start tutorial - wallet data not available');
      messageApi.error({
        content: t('home:tutorial.err_tutorial_wallet_data'),
        duration: 5,
        style: { zIndex: 99999 },
      });
      return;
    }

    const tutorialSteps = getTutorialSteps(t as (key: string) => string);
    const steps = tutorialSteps[tutorialType] || tutorialSteps.onboarding;
    setCurrentSteps(steps);
    dispatch(
      setTutorialState({ isActive: true, tutorialType, currentStep: 0 }),
    );

    // Always start fresh - reset tutorial config and clear cancelled flag
    await updateTutorialConfig({
      completed: false,
      cancelled: false,
      currentStep: 0,
      tutorialType,
      lastShown: Date.now(),
    });
  };

  const skipTutorial = async () => {
    dispatch(
      setTutorialState({ isActive: false, tutorialType: '', currentStep: 0 }),
    );

    await updateTutorialConfig({
      completed: true,
      currentStep: 0,
      tutorialType: tutorialState.tutorialType,
      lastShown: Date.now(),
    });
  };

  const nextStep = async () => {
    const nextStepIndex = tutorialState.currentStep + 1;
    if (nextStepIndex < currentSteps.length) {
      dispatch(setTutorialStep(nextStepIndex));

      await updateTutorialConfig({
        completed: false,
        currentStep: nextStepIndex,
        tutorialType: tutorialState.tutorialType,
        lastShown: Date.now(),
      });
    } else {
      completeTutorial();
    }
  };

  const previousStep = () => {
    const prevStepIndex = tutorialState.currentStep - 1;
    if (prevStepIndex >= 0) {
      dispatch(setTutorialStep(prevStepIndex));
    }
  };

  const completeTutorial = async () => {
    dispatch(
      setTutorialState({ isActive: false, tutorialType: '', currentStep: 0 }),
    );

    await updateTutorialConfig({
      completed: true,
      cancelled: false,
      currentStep: 0,
      tutorialType: tutorialState.tutorialType,
      lastShown: Date.now(),
    });
  };

  const pauseTutorial = async () => {
    dispatch(
      setTutorialState({
        isActive: false,
        tutorialType: tutorialState.tutorialType,
        currentStep: tutorialState.currentStep,
      }),
    );

    await updateTutorialConfig({
      completed: false,
      cancelled: false,
      currentStep: tutorialState.currentStep,
      tutorialType: tutorialState.tutorialType,
      lastShown: Date.now(),
    });
  };

  const handleResetTutorial = async () => {
    await resetTutorial();
    dispatch(
      setTutorialState({ isActive: false, tutorialType: '', currentStep: 0 }),
    );
  };

  const closeTutorial = async () => {
    // Show cancellation message
    messageApi.info({
      content: t('home:tutorial.tutorial_cancelled'),
      duration: 5,
      style: {
        zIndex: 99999,
      },
    });

    dispatch(
      setTutorialState({ isActive: false, tutorialType: '', currentStep: 0 }),
    );

    // Mark as cancelled to prevent auto-restart
    await updateTutorialConfig({
      completed: false,
      cancelled: true,
      currentStep: 0,
      tutorialType: tutorialState.tutorialType,
      lastShown: Date.now(),
    });
  };

  useEffect(() => {
    if (tutorialState.isActive && tutorialState.tutorialType) {
      const tutorialSteps = getTutorialSteps(t as (key: string) => string);
      const steps =
        tutorialSteps[tutorialState.tutorialType] || tutorialSteps.onboarding;
      setCurrentSteps(steps);
    }
  }, [tutorialState.tutorialType, tutorialState.isActive, t]);

  // Re-check enterprise subscription status when tutorial becomes active
  useEffect(() => {
    if (tutorialState.isActive) {
      const config = getEnterpriseNotificationConfig();
      const isSubscribed = !!(config?.isSubscribed && config?.email);
      setEnterpriseSubscribed(isSubscribed);
    }
  }, [tutorialState.isActive]);

  // Monitor chain changes during tutorial
  useEffect(() => {
    if (tutorialState.isActive && tutorialState.currentStep === 3) {
      // On select-ethereum step, expect eth chain
      if (expectedChain === '' && activeChain === 'btc') {
        setExpectedChain('eth');
      } else if (
        expectedChain === 'eth' &&
        activeChain !== 'eth' &&
        activeChain !== 'btc'
      ) {
        // User selected wrong chain - cancel tutorial
        messageApi.error({
          content: t('home:tutorial.tutorial_cancelled_wrong_chain'),
          duration: 8,
          style: {
            zIndex: 99999,
          },
        });

        // Cancel tutorial (same as clicking X) instead of pausing
        setTimeout(() => {
          dispatch(
            setTutorialState({
              isActive: false,
              tutorialType: '',
              currentStep: 0,
            }),
          );
        }, 500);

        // Mark as cancelled to prevent auto-restart
        setTimeout(async () => {
          await updateTutorialConfig({
            completed: false,
            cancelled: true,
            currentStep: 0,
            tutorialType: tutorialState.tutorialType,
            lastShown: Date.now(),
          });
        }, 600);
      }
    } else {
      setExpectedChain('');
    }
  }, [
    activeChain,
    tutorialState.isActive,
    tutorialState.currentStep,
    tutorialState.tutorialType,
    expectedChain,
    messageApi,
    dispatch,
  ]);

  // Handle pending tutorial start after navigation
  useEffect(() => {
    if (pendingTutorialType && window.location.pathname === '/home') {
      // Clear pending tutorial and try to start normally
      const tutorialType = pendingTutorialType;
      setPendingTutorialType('');
      setTimeout(() => startTutorial(tutorialType), 100);
    }
  }, [pendingTutorialType]);

  // Auto-advance from ethereum-sync-waiting (step 5) to ethereum-tokens (step 6)
  useEffect(() => {
    if (
      tutorialState.isActive &&
      tutorialState.currentStep === 4 && // Step 5 (ethereum-sync-waiting) is index 4
      activeChain === 'eth' &&
      ethXpubKey // Ensure Ethereum SSP Key is actually synced
    ) {
      const checkEthereumSync = () => {
        // Check if we're on the Ethereum overview with tokens section visible
        const tokensSection = document.querySelector(
          '[data-tutorial="tokens-section"]',
        );
        const walletOverview = document.querySelector(
          '[data-tutorial="wallet-overview"]',
        );

        // Make sure we're on the main wallet page with Ethereum loaded
        if (tokensSection && walletOverview) {
          console.log(
            'Ethereum sync detected - auto-advancing tutorial to step 6',
          );
          nextStep();
          return true; // Stop polling
        }
        return false; // Continue polling
      };

      // Immediate check
      if (!checkEthereumSync()) {
        // Poll every 500ms for up to 30 seconds
        let attempts = 0;
        const maxAttempts = 60;
        const pollInterval = setInterval(() => {
          attempts++;
          if (checkEthereumSync() || attempts >= maxAttempts) {
            clearInterval(pollInterval);
            if (attempts >= maxAttempts) {
              console.warn(
                'Ethereum sync detection timed out after 30 seconds',
              );
            }
          }
        }, 500);

        // Cleanup interval on unmount or when dependencies change
        return () => clearInterval(pollInterval);
      }
    }
  }, [
    tutorialState.isActive,
    tutorialState.currentStep,
    activeChain,
    ethXpubKey,
    nextStep,
  ]);

  const contextValue: TutorialContextType = {
    startTutorial,
    skipTutorial,
    pauseTutorial,
    resetTutorial: handleResetTutorial,
    isActive: tutorialState.isActive,
    currentStep: tutorialState.currentStep,
    tutorialType: tutorialState.tutorialType,
  };

  return (
    <TutorialContext.Provider value={contextValue}>
      {contextHolder}
      {children}
      <TutorialOverlay
        steps={currentSteps}
        isActive={tutorialState.isActive}
        currentStep={tutorialState.currentStep}
        onNext={nextStep}
        onPrevious={previousStep}
        onSkip={skipTutorial}
        onComplete={completeTutorial}
        onClose={closeTutorial}
        onPause={pauseTutorial}
        enterpriseEmail={enterpriseEmail}
        setEnterpriseEmail={setEnterpriseEmail}
        enterpriseVerificationCode={enterpriseVerificationCode}
        setEnterpriseVerificationCode={setEnterpriseVerificationCode}
        enterpriseSubscriptionStep={enterpriseSubscriptionStep}
        enterpriseLoading={enterpriseLoading}
        enterpriseSubscribed={enterpriseSubscribed}
        enterpriseError={enterpriseError}
        codeExpiresInMinutes={codeExpiresInMinutes}
        remainingAttempts={remainingAttempts}
        onEnterpriseRequestCode={handleEnterpriseRequestCode}
        onEnterpriseVerifyCode={handleEnterpriseVerifyCode}
        onEnterpriseSignAndSubscribe={handleEnterpriseSignAndSubscribe}
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
    </TutorialContext.Provider>
  );
};

export const useTutorial = (): TutorialContextType => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

export default TutorialProvider;
