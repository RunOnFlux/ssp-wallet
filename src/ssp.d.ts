declare module '@storage/ssp' {
  interface ssp {
    maxTxFeeUSD: number;
    relay: string;
  }
  let sspConfig: () => ssp;
  let sspConfigOriginal: () => ssp;
  let loadSSPConfig: () => void;
}
