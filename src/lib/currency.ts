import axios from 'axios';
import { currencySSPRelay, currency } from '../types';
import { sspConfig } from '@storage/ssp';
import BigNumber from 'bignumber.js';
import getSymbolFromCurrency from 'currency-symbol-map';

export const supportedFiatValues: (keyof currency)[] = [
  'AED',
  'ARS',
  'AUD',
  'BDT',
  'BHD',
  'BMD',
  'BRL',
  'BTC',
  'CAD',
  'CHF',
  'CLP',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'ETH',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'JPY',
  'KRW',
  'KWD',
  'LKR',
  'MMK',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PKR',
  'PLN',
  'RUB',
  'SAR',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'TWD',
  'UAH',
  'USD',
  'VEF',
  'VND',
  'XAG',
  'XAU',
  'XDR',
  'ZAR',
];

export function getFiatSymbol(fiatCurrency: keyof currency): string {
  return getSymbolFromCurrency(fiatCurrency) ?? '';
}

export function decimalPlaces() {
  if (sspConfig().fiatCurrency === 'BTC') {
    return 4;
  }
  return 2;
}

export function formatCrypto(amount: BigNumber, maxDecimals = 8) {
  const formated = amount.toNumber().toLocaleString(navigator.language ?? 'en-US',{ maximumFractionDigits: maxDecimals, minimumFractionDigits: 0 }); // or force 'en-US'?
  return formated;
}

export function formatFiat(amount: BigNumber) {
  const digits = decimalPlaces();
  const formated = amount.toNumber().toLocaleString(navigator.language ?? 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return formated;
}

export function formatFiatWithSymbol(amount: BigNumber) {
  const formated = formatFiat(amount);
  if (sspConfig().fiatSymbol.length > 1) {
    // append only
    return `${formated} ${sspConfig().fiatSymbol}`;
  }
  return `${sspConfig().fiatSymbol}${formated} ${sspConfig().fiatCurrency}`;
}

export async function fetchRate(chain: string): Promise<currency> {
  try {
    const url = `https://${sspConfig().relay}/v1/rates`;
    const response = await axios.get<currencySSPRelay>(url);
    const fiats = response.data.fiat;
    const cryptos = response.data.crypto;
    for (const fiat of Object.keys(fiats)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      fiats[fiat] = (cryptos[chain] ?? 0) * fiats[fiat];
    }
    const currencyObj: currency = fiats;
    return currencyObj;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function fetchAllRates(): Promise<currencySSPRelay> {
  try {
    const url = `https://${sspConfig().relay}/v1/rates`;
    const response = await axios.get<currencySSPRelay>(url);
    if (response.data.crypto && response.data.fiat) {
      return response.data;
    } else {
      throw new Error('Invalid response from SSP for rates');
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
