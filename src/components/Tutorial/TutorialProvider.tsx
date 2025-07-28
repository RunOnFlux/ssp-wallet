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
import { RootState } from '../../store';
import { useAppSelector } from '../../hooks';
import TutorialOverlay, { TutorialStep } from './TutorialOverlay';
import { getTutorialSteps } from './tutorialSteps';
import {
  setTutorialState,
  setTutorialStep,
} from '../../store/index';
import { updateTutorialConfig, resetTutorial } from '../../storage/ssp';

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

export const TutorialProvider: React.FC<TutorialProviderProps> = ({
  children,
}) => {
  const dispatch = useDispatch();
  const { t } = useTranslation(['home']);
  const tutorialState = useSelector((state: RootState) => state.tutorial);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const [currentSteps, setCurrentSteps] = useState<TutorialStep[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [expectedChain, setExpectedChain] = useState<string>('');
  const [pendingTutorialType, setPendingTutorialType] = useState<string>('');

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
      activeChain === 'eth'
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
