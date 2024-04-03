import localForage from 'localforage';
import { currency } from '../types';

interface config {
  relay?: string;
  fiatCurrency?: keyof currency;
  maxTxFeeUSD?: number;
  fiatSymbol?: string;
}

let storedLocalForgeSSPConfig: config = {};

export function loadSSPConfig() {
  (async () => {
    const localForgeSSPConfig: config =
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
  relay: 'relay.ssp.runonflux.io',
  fiatCurrency: 'USD',
  maxTxFeeUSD: 100, // in USD
};

function getFiatSymbol(fiatCurrency: keyof currency): string {
  switch (fiatCurrency) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'JPY':
      return '¥';
    default:
      return '';
  }
}

export function sspConfig(): config {
  return {
    relay: storedLocalForgeSSPConfig?.relay ?? ssp.relay,
    fiatCurrency: storedLocalForgeSSPConfig?.fiatCurrency ?? ssp.fiatCurrency,
    maxTxFeeUSD: storedLocalForgeSSPConfig?.maxTxFeeUSD ?? ssp.maxTxFeeUSD,
    fiatSymbol: getFiatSymbol(storedLocalForgeSSPConfig?.fiatCurrency ?? ssp.fiatCurrency ?? 'USD'),
  };
}

export function sspConfigOriginal(): config {
  return ssp;
}
