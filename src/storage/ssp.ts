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
    case 'AED':
      return 'د.إ'; // United Arab Emirates Dirham
    case 'ARS':
      return 'AR$'; // Argentine Peso
    case 'AUD':
      return 'A$'; // Australian Dollar
    case 'BDT':
      return '৳'; // Bangladeshi Taka
    case 'BHD':
      return 'ب.د'; // Bahraini Dinar
    case 'BMD':
      return 'BD$'; // Bermudian Dollar
    case 'BRL':
      return 'R$'; // Brazilian Real
    case 'BTC':
      return '₿'; // Bitcoin
    case 'CAD':
      return 'CA$'; // Canadian Dollar
    case 'CHF':
      return 'CHF'; // Swiss Franc
    case 'CLP':
      return 'CLP$'; // Chilean Peso
    case 'CNY':
      return '¥'; // Chinese Yuan Renminbi
    case 'CZK':
      return 'Kč'; // Czech Koruna
    case 'DKK':
      return 'kr'; // Danish Krone
    case 'EUR':
      return '€'; // Euro
    case 'GBP':
      return '£'; // British Pound Sterling
    case 'HKD':
      return 'HK$'; // Hong Kong Dollar
    case 'HUF':
      return 'Ft'; // Hungarian Forint
    case 'IDR':
      return 'Rp'; // Indonesian Rupiah
    case 'ILS':
      return '₪'; // Israeli New Shekel
    case 'INR':
      return '₹'; // Indian Rupee
    case 'JPY':
      return '¥'; // Japanese Yen
    case 'KRW':
      return '₩'; // South Korean Won
    case 'KWD':
      return 'د.ك'; // Kuwaiti Dinar
    case 'LKR':
      return 'රු'; // Sri Lankan Rupee
    case 'MMK':
      return 'K'; // Myanmar Kyat
    case 'MXN':
      return 'MX$'; // Mexican Peso
    case 'MYR':
      return 'RM'; // Malaysian Ringgit
    case 'NOK':
      return 'kr'; // Norwegian Krone
    case 'NZD':
      return 'NZ$'; // New Zealand Dollar
    case 'PHP':
      return '₱'; // Philippine Peso
    case 'PKR':
      return '₨'; // Pakistani Rupee
    case 'PLN':
      return 'zł'; // Polish Zloty
    case 'RUB':
      return '₽'; // Russian Ruble
    case 'SAR':
      return '﷼'; // Saudi Riyal
    case 'SEK':
      return 'kr'; // Swedish Krona
    case 'SGD':
      return 'S$'; // Singapore Dollar
    case 'THB':
      return '฿'; // Thai Baht
    case 'TRY':
      return '₺'; // Turkish Lira
    case 'TWD':
      return 'NT$'; // New Taiwan Dollar
    case 'UAH':
      return '₴'; // Ukrainian Hryvnia
    case 'USD':
      return '$'; // US Dollar
    case 'VEF':
      return 'Bs'; // Venezuelan Bolívar
    case 'VND':
      return '₫'; // Vietnamese Dong
    case 'XAG':
      return 'XAG'; // Silver (troy ounce)
    case 'XAU':
      return 'XAU'; // Gold (troy ounce)
    case 'XDR':
      return 'SDR'; // Special Drawing Rights
    case 'ZAR':
      return 'R'; // South African Rand
  }
}

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
