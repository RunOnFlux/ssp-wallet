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

  interface enterpriseNotificationPreferences {
    incomingTx: boolean;
    outgoingTx: boolean;
    largeTransactions: boolean;
    lowBalance: boolean;
    weeklyReport: boolean;
    marketing: boolean;
  }

  interface enterpriseNotificationConfig {
    isSubscribed: boolean;
    email: string;
    preferences: enterpriseNotificationPreferences;
  }

  interface ssp {
    maxTxFeeUSD: number;
    fiatCurrency: keyof currency;
    fiatSymbol: string;
    relay: string;
    enterpriseNotification?: enterpriseNotificationConfig;
  }

  let sspConfig: () => ssp;
  let sspConfigOriginal: () => ssp;
  let loadSSPConfig: () => void;
  let getEnterpriseNotificationConfig: () => enterpriseNotificationConfig | null;
  let updateEnterpriseNotificationConfig: (
    configData: enterpriseNotificationConfig,
  ) => Promise<void>;
  let subscribeToEnterpriseNotifications: (
    email: string,
    preferences?: Partial<enterpriseNotificationPreferences>,
  ) => Promise<void>;
  let unsubscribeFromEnterpriseNotifications: () => Promise<void>;
  let getDefaultEnterpriseNotificationPreferences: () => enterpriseNotificationPreferences;
  let updateEnterpriseNotificationFromStatus: (status: {
    subscribed: boolean;
    email?: string;
    preferences?: enterpriseNotificationPreferences;
  }) => Promise<void>;
}
