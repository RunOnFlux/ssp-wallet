import axios from 'axios';
import { currencySSPRelay, currency } from '../types';
import { sspConfig } from '@storage/ssp';

export const supportedFiatValues = [
  'EUR',
  'AUD',
  'TRY',
  'TWD',
  'RUB',
  'MMK',
  'MXN',
  'MYR',
  'CNY',
  'PKR',
  'PLN',
  'THB',
  'PHP',
  'ARS',
  'SAR',
  'DKK',
  'SGD',
  'AED',
  'USD',
  'CLP',
  'ILS',
  'NZD',
  'HKD',
  'XDR',
  'KWD',
  'BDT',
  'GBP',
  'SEK',
  'IDR',
  'CHF',
  'JPY',
  'XAU',
  'BMD',
  'ZAR',
  'HUF',
  'BRL',
  'KRW',
  'LKR',
  'NOK',
  'INR',
  'VEF',
  'CAD',
  'VND',
  'XAG',
  'CZK',
  'BHD',
  'UAH',
];

export async function fetchRate(chain: string): Promise<currency> {
  try {
    const url = `https://${sspConfig().relay}/v1/rates`;
    const response = await axios.get<currencySSPRelay>(url);
    const fiats = response.data.fiat;
    const cryptos = response.data.crypto;
    for (const fiat of Object.keys(fiats)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      fiats[fiat] = (cryptos[chain] || 0) * fiats[fiat];
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
