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
  }

  interface ssp {
    maxTxFeeUSD: number;
    fiatCurrency: keyof currency;
    fiatSymbol: string;
    relay: string;
  }

  let sspConfig: () => ssp;
  let sspConfigOriginal: () => ssp;
  let loadSSPConfig: () => void;
}
