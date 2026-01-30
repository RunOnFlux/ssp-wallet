declare module '@storage/ssp' {
  interface currency {
    EUR: number;
    AUD: number;
    TRY: number;
    TWD: number;
    RUB: number;
    MMK: number;
    MXN: number;
    MYR: number;
    CNY: number;
    PKR: number;
    PLN: number;
    THB: number;
    PHP: number;
    ARS: number;
    SAR: number;
    DKK: number;
    SGD: number;
    AED: number;
    USD: number;
    CLP: number;
    ILS: number;
    NZD: number;
    HKD: number;
    XDR: number;
    KWD: number;
    BDT: number;
    GBP: number;
    SEK: number;
    IDR: number;
    CHF: number;
    JPY: number;
    XAU: number;
    BMD: number;
    ZAR: number;
    HUF: number;
    BRL: number;
    KRW: number;
    LKR: number;
    NOK: number;
    INR: number;
    VEF: number;
    CAD: number;
    VND: number;
    XAG: number;
    CZK: number;
    BHD: number;
    UAH: number;
    BTC: number;
    ETH: number;
  }

  interface pulsePreferences {
    incomingTx: boolean;
    outgoingTx: boolean;
    largeTransactions: boolean;
    lowBalance: boolean;
    weeklyReport: boolean;
    marketing: boolean;
  }

  interface pulseConfig {
    isSubscribed: boolean;
    email: string;
    preferences: pulsePreferences;
  }

  interface ssp {
    maxTxFeeUSD: number;
    fiatCurrency: keyof currency;
    fiatSymbol: string;
    relay: string;
    pulse?: pulseConfig;
  }

  let sspConfig: () => ssp;
  let sspConfigOriginal: () => ssp;
  let loadSSPConfig: () => void;
  let getPulseConfig: () => pulseConfig | null;
  let updatePulseConfig: (pulseConfigData: pulseConfig) => Promise<void>;
  let subscribeToPulse: (
    email: string,
    preferences?: Partial<pulsePreferences>,
  ) => Promise<void>;
  let unsubscribeFromPulse: () => Promise<void>;
  let getDefaultPulsePreferences: () => pulsePreferences;
  let updatePulseFromStatus: (status: {
    subscribed: boolean;
    email?: string;
    preferences?: pulsePreferences;
  }) => Promise<void>;
}
