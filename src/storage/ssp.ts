import localForage from 'localforage';
import { getFiatSymbol } from '../lib/currency';
import { currency } from '../types';

interface config {
  relay?: string; // user adjustable
  fiatCurrency?: keyof currency; // user adjustable
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
  relay: 'relay.sspwallet.io',
  fiatCurrency: 'USD',
  maxTxFeeUSD: 100, // in USD
};

export function sspConfig(): config {
  return {
    relay: storedLocalForgeSSPConfig?.relay ?? ssp.relay,
    fiatCurrency: storedLocalForgeSSPConfig?.fiatCurrency ?? ssp.fiatCurrency,
    maxTxFeeUSD: storedLocalForgeSSPConfig?.maxTxFeeUSD ?? ssp.maxTxFeeUSD,
    fiatSymbol: getFiatSymbol(
      storedLocalForgeSSPConfig?.fiatCurrency ?? ssp.fiatCurrency ?? 'USD',
    ),
  };
}

export function sspConfigOriginal(): config {
  return ssp;
}
