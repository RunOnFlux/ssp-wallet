import localForage from 'localforage';
import { getFiatSymbol } from '../lib/currency';
import { currency } from '../types';

interface tutorialConfig {
  completed: boolean;
  cancelled?: boolean;
  currentStep: number;
  tutorialType: string;
  lastShown?: number; // timestamp
}

export interface enterpriseNotificationPreferences {
  incomingTx: boolean;
  outgoingTx: boolean;
  largeTransactions: boolean;
  lowBalance: boolean;
  weeklyReport: boolean;
  marketing: boolean;
}

export interface enterpriseNotificationConfig {
  isSubscribed: boolean;
  email: string;
  preferences: enterpriseNotificationPreferences;
}

interface config {
  relay?: string; // user adjustable
  fiatCurrency?: keyof currency; // user adjustable
  maxTxFeeUSD?: number;
  fiatSymbol?: string;
  tutorial: tutorialConfig;
  enterpriseNotification?: enterpriseNotificationConfig;
}

let storedLocalForgeSSPConfig: Partial<config> = {};

export function loadSSPConfig() {
  (async () => {
    const localForgeSSPConfig: Partial<config> =
      (await localForage.getItem('sspConfig')) ?? {};
    if (localForgeSSPConfig) {
      storedLocalForgeSSPConfig = localForgeSSPConfig;
    }
  })().catch((error) => {
    console.error(error);
  });
}

loadSSPConfig();

const ssp: config = {
  relay: 'relay.sspwallet.io',
  fiatCurrency: 'USD',
  maxTxFeeUSD: 100, // in USD
  tutorial: {
    completed: false,
    cancelled: false,
    currentStep: 0,
    tutorialType: 'onboarding',
  },
};

export function sspConfig(): config {
  return {
    relay: storedLocalForgeSSPConfig?.relay ?? ssp.relay,
    fiatCurrency: storedLocalForgeSSPConfig?.fiatCurrency ?? ssp.fiatCurrency,
    maxTxFeeUSD: storedLocalForgeSSPConfig?.maxTxFeeUSD ?? ssp.maxTxFeeUSD,
    tutorial: storedLocalForgeSSPConfig?.tutorial ?? ssp.tutorial,
    fiatSymbol: getFiatSymbol(
      storedLocalForgeSSPConfig?.fiatCurrency ?? ssp.fiatCurrency ?? 'USD',
    ),
    enterpriseNotification: storedLocalForgeSSPConfig?.enterpriseNotification,
  };
}

export function sspConfigOriginal(): config {
  return ssp;
}

export async function updateTutorialConfig(tutorialConfig: tutorialConfig) {
  const currentConfig = sspConfig();
  const updatedConfig = {
    ...currentConfig,
    tutorial: tutorialConfig,
  };

  storedLocalForgeSSPConfig = updatedConfig;
  await localForage.setItem('sspConfig', updatedConfig);
}

export async function resetTutorial() {
  const tutorialConfig: tutorialConfig = {
    completed: false,
    cancelled: false,
    currentStep: 0,
    tutorialType: 'onboarding',
  };
  await updateTutorialConfig(tutorialConfig);
}

// SSP Enterprise Notification configuration
const defaultEnterpriseNotificationPreferences: enterpriseNotificationPreferences =
  {
    incomingTx: true,
    outgoingTx: true,
    largeTransactions: true,
    lowBalance: true,
    weeklyReport: true,
    marketing: true,
  };

export function getEnterpriseNotificationConfig(): enterpriseNotificationConfig | null {
  return storedLocalForgeSSPConfig?.enterpriseNotification ?? null;
}

export async function updateEnterpriseNotificationConfig(
  configData: enterpriseNotificationConfig,
) {
  const currentConfig = sspConfig();
  const updatedConfig = {
    ...currentConfig,
    enterpriseNotification: configData,
  };

  storedLocalForgeSSPConfig = updatedConfig;
  await localForage.setItem('sspConfig', updatedConfig);
}

export async function subscribeToEnterpriseNotifications(
  email: string,
  preferences?: Partial<enterpriseNotificationPreferences>,
) {
  const configData: enterpriseNotificationConfig = {
    isSubscribed: true,
    email: email.toLowerCase().trim(),
    preferences: {
      ...defaultEnterpriseNotificationPreferences,
      ...preferences,
    },
  };
  await updateEnterpriseNotificationConfig(configData);
}

export async function unsubscribeFromEnterpriseNotifications() {
  const currentConfig = sspConfig();
  const updatedConfig = {
    ...currentConfig,
    enterpriseNotification: undefined,
  };

  storedLocalForgeSSPConfig = updatedConfig;
  await localForage.setItem('sspConfig', updatedConfig);
}

export function getDefaultEnterpriseNotificationPreferences(): enterpriseNotificationPreferences {
  return { ...defaultEnterpriseNotificationPreferences };
}

/**
 * Update local enterprise notification config from remote status response.
 */
export async function updateEnterpriseNotificationFromStatus(status: {
  subscribed: boolean;
  email?: string;
  preferences?: Partial<enterpriseNotificationPreferences>;
}): Promise<void> {
  if (status.email) {
    await subscribeToEnterpriseNotifications(status.email, status.preferences);
  } else {
    const currentConfig = getEnterpriseNotificationConfig();
    if (currentConfig?.isSubscribed) {
      await unsubscribeFromEnterpriseNotifications();
    }
  }
}
