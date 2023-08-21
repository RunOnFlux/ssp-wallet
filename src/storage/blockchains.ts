import backends from './backends';

const flux = {
  id: 'flux',
  name: 'Flux',
  symbol: 'FLUX',
  decimals: 8,
  node: backends.flux.node,
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
  node: backends.fluxTestnet.node,
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
