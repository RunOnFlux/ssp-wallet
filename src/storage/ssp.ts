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

export interface pulsePreferences {
  incomingTx: boolean;
  outgoingTx: boolean;
  largeTransactions: boolean;
  lowBalance: boolean;
  weeklyReport: boolean;
  marketing: boolean;
}

export interface pulseConfig {
  isSubscribed: boolean;
  email: string;
  preferences: pulsePreferences;
}

interface config {
  relay?: string; // user adjustable
  fiatCurrency?: keyof currency; // user adjustable
  maxTxFeeUSD?: number;
  fiatSymbol?: string;
  tutorial: tutorialConfig;
  pulse?: pulseConfig;
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
    pulse: storedLocalForgeSSPConfig?.pulse,
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

// SSP Pulse configuration
const defaultPulsePreferences: pulsePreferences = {
  incomingTx: true,
  outgoingTx: true,
  largeTransactions: true,
  lowBalance: true,
  weeklyReport: true,
  marketing: true,
};

export function getPulseConfig(): pulseConfig | null {
  return storedLocalForgeSSPConfig?.pulse ?? null;
}

export async function updatePulseConfig(pulseConfigData: pulseConfig) {
  const currentConfig = sspConfig();
  const updatedConfig = {
    ...currentConfig,
    pulse: pulseConfigData,
  };

  storedLocalForgeSSPConfig = updatedConfig;
  await localForage.setItem('sspConfig', updatedConfig);
}

export async function subscribeToPulse(
  email: string,
  preferences?: Partial<pulsePreferences>,
) {
  const pulseConfigData: pulseConfig = {
    isSubscribed: true,
    email: email.toLowerCase().trim(),
    preferences: {
      ...defaultPulsePreferences,
      ...preferences,
    },
  };
  await updatePulseConfig(pulseConfigData);
}

export async function unsubscribeFromPulse() {
  const currentConfig = sspConfig();
  const updatedConfig = {
    ...currentConfig,
    pulse: undefined,
  };

  storedLocalForgeSSPConfig = updatedConfig;
  await localForage.setItem('sspConfig', updatedConfig);
}

export function getDefaultPulsePreferences(): pulsePreferences {
  return { ...defaultPulsePreferences };
}

/**
 * Update local pulse config from remote status response
 */
export async function updatePulseFromStatus(status: {
  subscribed: boolean;
  email?: string;
  preferences?: pulsePreferences;
}): Promise<void> {
  if (status.subscribed && status.email) {
    await subscribeToPulse(status.email, status.preferences);
  } else if (!status.subscribed) {
    await unsubscribeFromPulse();
  }
}
