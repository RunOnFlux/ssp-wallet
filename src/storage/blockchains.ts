const flux = {
  id: 'flux',
  name: 'Flux',
  symbol: 'FLUX',
  decimals: 8,
  explorer: 'explorer.runonflux.io',
  slip: 19167,
  messagePrefix: '\u0018Zelcash Signed Message:\n',
  pubKeyHash: '1cb8',
  scriptHash: '1cbd',
  wif: '80',
  logo: '/src/assets/flux.svg',
};

const fluxTestnet = {
  id: 'fluxTestnet',
  name: 'TESTNET Flux',
  symbol: 'TESTNET FLUX',
  decimals: 8,
  explorer: 'testnet.runonflux.io',
  slip: 1, // all testnets have 1
  messagePrefix: '\u0018Zelcash Signed Message:\n',
  pubKeyHash: '1d25',
  scriptHash: '1cba',
  wif: 'ef',
  logo: '/src/assets/flux.svg',
};

export const blockchains = {
  flux,
  fluxTestnet,
};
