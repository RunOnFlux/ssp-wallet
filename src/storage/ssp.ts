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

interface config {
  relay?: string; // user adjustable
  fiatCurrency?: keyof currency; // user adjustable
  maxTxFeeUSD?: number;
  fiatSymbol?: string;
  tutorial: tutorialConfig;
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
