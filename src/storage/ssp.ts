import localForage from 'localforage';

interface config {
  relay?: string;
  maxTxFeeUSD?: number;
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

const ssp = {
  relay: 'relay.ssp.runonflux.io',
  maxTxFeeUSD: 100, // in USD
};

export function sspConfig() {
  return {
    relay: storedLocalForgeSSPConfig?.relay ?? ssp.relay,
    maxTxFeeUSD: storedLocalForgeSSPConfig?.maxTxFeeUSD ?? ssp.maxTxFeeUSD,
  };
}

export function sspConfigOriginal() {
  return ssp;
}
