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
  const formated = amount
    .toNumber()
    .toLocaleString(navigator.language ?? 'en-US', {
      maximumFractionDigits: maxDecimals,
      minimumFractionDigits: 0,
    }); // or force 'en-US'?
  return formated;
}

export function formatFiat(amount: BigNumber) {
  const digits = decimalPlaces();
  const formated = amount
    .toNumber()
    .toLocaleString(navigator.language ?? 'en-US', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
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

/**
 * Fetches exchange rate for a specific blockchain chain and converts fiat rates.
 * @param chain - The blockchain chain identifier (e.g., 'btc', 'eth', 'flux')
 * @returns A currency object with converted fiat values based on the chain's crypto rate
 */
export async function fetchRate(chain: string): Promise<currency> {
  try {
    const url = `https://${sspConfig().relay}/v1/rates`;
    const response = await axios.get<currencySSPRelay>(url);
    const fiats = response.data.fiat;
    const cryptos = response.data.crypto;
    const cryptoRate =
      (cryptos as unknown as Record<string, number>)[chain] ?? 0;

    // Convert each fiat rate by multiplying with the crypto rate
    const fiatKeys = Object.keys(fiats) as (keyof currency)[];
    for (const fiat of fiatKeys) {
      (fiats as Record<keyof currency, number>)[fiat] =
        cryptoRate * fiats[fiat];
    }

    return fiats;
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
