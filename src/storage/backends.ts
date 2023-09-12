import localForage from 'localforage';

interface Backend {
  node: string;
}
type backends = Record<string, Backend>;

let localForgeBackends: backends = {};

export function loadBackendsConfig() {
  (async () => {
    const localForgeBackendsStorage: backends =
      (await localForage.getItem('backends')) ?? {};
    if (localForgeBackendsStorage) {
      localForgeBackends = localForgeBackendsStorage;
    }
  })().catch((error) => {
    console.error(error);
  });
}

loadBackendsConfig();

const flux = {
  node: 'explorer.runonflux.io',
};
const fluxTestnet = {
  node: 'testnet.runonflux.io',
};

export function backends() {
  return {
    flux: localForgeBackends?.flux || flux,
    fluxTestnet: localForgeBackends?.fluxTestnet || fluxTestnet,
  };
}

export function backendsOriginal() {
  return {
    flux,
    fluxTestnet,
  };
}
