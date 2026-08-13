import localForage from 'localforage';

interface Backend {
  node?: string;
  api?: string;
  explorer?: string;
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

// *** BACKENDS ***
const assetBackends: backends = {
  flux: {
    node: 'flux-explorer.sspwallet.io',
  },
  fluxTestnet: {
    node: 'flux-testnet.sspwallet.io',
  },
  rvn: {
    node: 'blockbook-rvn.sspwallet.io',
  },
  ltc: {
    node: 'blockbook-ltc.sspwallet.io',
  },
  btc: {
    node: 'blockbook-btc.sspwallet.io',
  },
  doge: {
    node: 'blockbook-doge.sspwallet.io',
  },
  zec: {
    node: 'blockbook-zec.sspwallet.io',
  },
  bch: {
    node: 'blockbook-bch.sspwallet.io',
  },
  btcTestnet: {
    node: 'blockbook-btc-testnet.sspwallet.io',
  },
  btcSignet: {
    node: 'blockbook-btc-signet.sspwallet.io',
  },
  sepolia: {
    node: 'node-sepolia.sspwallet.io',
    api: 'api-sepolia.sspwallet.io/api',
    explorer: 'sepolia.etherscan.io',
  },
  eth: {
    node: 'node-eth.sspwallet.io',
    api: 'api-eth.sspwallet.io/api',
    explorer: 'etherscan.io',
  },
  amoy: {
    node: 'node-amoy.sspwallet.io',
    api: 'api-amoy.sspwallet.io/api',
    explorer: 'amoy.polygonscan.com',
  },
  polygon: {
    node: 'node-polygon.sspwallet.io',
    api: 'api-polygon.sspwallet.io/api',
    explorer: 'polygonscan.com',
  },
  base: {
    node: 'node-base.sspwallet.io',
    api: 'api-base.sspwallet.io/api',
    explorer: 'basescan.org',
  },
  avax: {
    node: 'node-avax.sspwallet.io',
    api: 'api-avax.sspwallet.io/api',
    explorer: 'snowtrace.io',
  },
  bsc: {
    node: 'node-bsc.sspwallet.io',
    api: 'api-bsc.sspwallet.io/api',
    explorer: 'bscscan.com',
  },
  solDevnet: {
    node: 'api.devnet.solana.com',
    api: 'api.devnet.solana.com',
    explorer: 'explorer.solana.com',
  },
  solMainnet: {
    // SSP-branded endpoint. The ssp-backends-proxy Worker holds the provider
    // credential, so no token ships in this bundle; it also rate-limits per
    // client IP, which is why nothing here needs a key. Deliberately NOT
    // api.mainnet-beta.solana.com — that endpoint silently drops transactions
    // under load. Users can still override via localForgeBackends.
    node: 'node-solana.sspwallet.io',
    api: 'node-solana.sspwallet.io',
    explorer: 'explorer.solana.com',
  },
};

export function backends() {
  const backendKeys = Object.keys(assetBackends);
  const currentBackends: backends = backendKeys.reduce((acc, key) => {
    const localBackend = localForgeBackends[key];
    acc[key] = {
      node: localBackend?.node ?? assetBackends[key].node,
      api: localBackend?.api ?? assetBackends[key].api,
      explorer: localBackend?.explorer ?? assetBackends[key].explorer,
    };
    return acc;
  }, {} as backends);
  return currentBackends;
}

export function backendsOriginal() {
  return assetBackends;
}
