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
  // USD thresholds, clamped server-side. Absent = server defaults; they are
  // deliberately NOT part of the shipped defaults object so an unset value is
  // never re-asserted over a choice made elsewhere (e.g. the Enterprise app).
  largeTransactionThresholdUsd?: number; // clamped [100, 10M]
  minTxNotificationUsd?: number; // clamped [0, 10M]; 0 = no minimum
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

/**
 * The raw persisted record — NOT the merged view from sspConfig().
 * Writers must merge into this, so that keys they know nothing about survive.
 */
async function readStoredConfig(): Promise<Partial<config>> {
  const stored: Partial<config> | null = await localForage.getItem('sspConfig');
  return stored ?? {};
}

/**
 * Persist the two user-adjustable preferences from Menu.
 *
 * This exists because Settings used to build a fresh `{ relay, fiatCurrency }`
 * object and `setItem` it over the whole record — silently destroying
 * `tutorial` and `enterpriseNotification` (the SSP Enterprise subscription) —
 * and to `removeItem` the entire record whenever both values happened to match
 * the defaults. Preferences are merged in, and a value equal to its shipped
 * default is stored as an absent key rather than by deleting the record.
 */
export async function updateUserPreferences(prefs: {
  relay?: string;
  fiatCurrency?: keyof currency;
}) {
  const next: Partial<config> = { ...(await readStoredConfig()) };

  if (prefs.relay !== undefined) {
    if (prefs.relay === ssp.relay) {
      delete next.relay;
    } else {
      next.relay = prefs.relay;
    }
  }
  if (prefs.fiatCurrency !== undefined) {
    if (prefs.fiatCurrency === ssp.fiatCurrency) {
      delete next.fiatCurrency;
    } else {
      next.fiatCurrency = prefs.fiatCurrency;
    }
  }

  storedLocalForgeSSPConfig = next;
  if (Object.keys(next).length === 0) {
    // Nothing left worth persisting — safe to drop the record entirely.
    await localForage.removeItem('sspConfig');
  } else {
    await localForage.setItem('sspConfig', next);
  }
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

// SSP Enterprise Notification configuration.
//
// These are the values Settings offers when the user first opens the subscribe
// form — they are the STARTING POINT of an explicit choice, not a silent
// enrolment. `marketing` therefore defaults to OFF: it is not a wallet alert,
// the feature's own description only promises "transactions, balance alerts,
// and weekly reports", and the only way back off it used to be a full
// unsubscribe (which costs a fresh 2-of-2 signature and drops the alerts the
// user actually wanted).
const defaultEnterpriseNotificationPreferences: enterpriseNotificationPreferences =
  {
    incomingTx: true,
    outgoingTx: true,
    largeTransactions: true,
    lowBalance: true,
    weeklyReport: true,
    marketing: false,
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
