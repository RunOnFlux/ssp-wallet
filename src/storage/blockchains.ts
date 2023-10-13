import { backends } from './backends';

import fluxLogo from '/src/assets/flux.svg';
import rvnLogo from '/src/assets/rvn.svg';
import ltcLogo from '/src/assets/ltc.svg';

const flux = {
  id: 'flux',
  libid: 'flux',
  name: 'Flux',
  symbol: 'FLUX',
  decimals: 8,
  node: backends().flux.node,
  slip: 19167,
  scriptType: 'p2sh',
  messagePrefix: '\u0018Zelcash Signed Message:\n',
  pubKeyHash: '1cb8',
  scriptHash: '1cbd',
  wif: '80',
  logo: fluxLogo,
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  txVersion: 4,
  txGroupID: 0x892f2085,
  backend: 'blockbook',
};

const fluxTestnet = {
  id: 'fluxTestnet',
  libid: 'fluxtestnet',
  name: 'Testnet Flux',
  symbol: 'TEST-FLUX',
  decimals: 8,
  node: backends().fluxTestnet.node,
  slip: 1, // all testnets have 1
  scriptType: 'p2sh',
  messagePrefix: '\u0018Zelcash Signed Message:\n',
  pubKeyHash: '1d25',
  scriptHash: '1cba',
  wif: 'ef',
  logo: fluxLogo,
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  txVersion: 4,
  txGroupID: 0x892f2085,
  backend: 'insight',
};

const rvn = {
  id: 'rvn',
  libid: 'ravencoin',
  name: 'Ravencoin',
  symbol: 'RVN',
  decimals: 8,
  node: backends().rvn.node,
  slip: 175,
  scriptType: 'p2sh',
  messagePrefix: '\u0016Raven Signed Message:\n',
  pubKeyHash: '3c',
  scriptHash: '7a',
  wif: '80',
  logo: rvnLogo,
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  backend: 'blockbook',
};

const ltc = {
  id: 'ltc',
  libid: 'litecoin',
  name: 'Litecoin',
  symbol: 'LTC',
  decimals: 8,
  node: backends().ltc.node,
  slip: 2,
  scriptType: 'p2wsh',
  messagePrefix: '\u0019Litecoin Signed Message:\n',
  pubKeyHash: '30',
  scriptHash: '32',
  wif: 'b0',
  logo: ltcLogo,
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe,
  },
  backend: 'blockbook',
  bech32: 'ltc',
};

export const blockchains = {
  flux,
  fluxTestnet,
  rvn,
  ltc,
};
