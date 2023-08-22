import localForage from 'localforage';

interface config {
  relay?: string;
}

let storedLocalForgeSSPConfig: config = {};

export function loadConfig() {
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

loadConfig();

const ssp = {
  relay: 'relay.ssp.runonflux.io',
};

export function sspConfig() {
  return {
    relay: storedLocalForgeSSPConfig?.relay ?? ssp.relay,
  };
}

export function sspConfigOriginal() {
  return ssp;
}
