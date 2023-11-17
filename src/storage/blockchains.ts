import { backends } from './backends';

import fluxLogo from '/src/assets/flux.svg';
import fluxTestnetLogo from '/src/assets/fluxTestnet.svg';
import rvnLogo from '/src/assets/rvn.svg';
import ltcLogo from '/src/assets/ltc.svg';
import btcLogo from '/src/assets/btc.svg';
import btcTestnetLogo from '/src/assets/btcTestnet.svg';
import btcSignetLogo from '/src/assets/btcSignet.svg';
import dogeLogo from '/src/assets/doge.svg';

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
  backend: 'insight',
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
  logo: fluxTestnetLogo,
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

const btc = {
  id: 'btc',
  libid: 'bitcoin',
  name: 'Bitcoin',
  symbol: 'BTC',
  decimals: 8,
  node: backends().btc.node,
  slip: 0,
  scriptType: 'p2wsh',
  messagePrefix: '\u0018Bitcoin Signed Message:\n',
  pubKeyHash: '00',
  scriptHash: '05',
  wif: '80',
  logo: btcLogo,
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  backend: 'blockbook',
  bech32: 'bc1',
};

const doge = {
  id: 'doge',
  libid: 'dogecoin',
  name: 'Dogecoin',
  symbol: 'DOGE',
  decimals: 8,
  node: backends().doge.node,
  slip: 3,
  scriptType: 'p2sh',
  messagePrefix: '\u0019Dogecoin Signed Message:\n',
  pubKeyHash: '1e',
  scriptHash: '16',
  wif: '9e',
  logo: dogeLogo,
  bip32: {
    public: 0x02facafd,
    private: 0x02fac398,
  },
  backend: 'blockbook',
};

const btcTestnet = {
  id: 'btcTestnet',
  libid: 'testnet',
  name: 'Testnet Bitcoin',
  symbol: 'TEST-BTC',
  decimals: 8,
  node: backends().btcTestnet.node,
  slip: 1,
  scriptType: 'p2wsh',
  messagePrefix: '\u0018Bitcoin Signed Message:\n',
  pubKeyHash: '6f',
  scriptHash: 'c4',
  wif: 'ef',
  logo: btcTestnetLogo,
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  backend: 'blockbook',
  bech32: 'tb1',
};

const btcSignet = {
  id: 'btcSignet',
  libid: 'testnet',
  name: 'Signet Bitcoin',
  symbol: 'TEST-BTC',
  decimals: 8,
  node: backends().btcSignet.node,
  slip: 1,
  scriptType: 'p2wsh',
  messagePrefix: '\u0018Bitcoin Signed Message:\n',
  pubKeyHash: '6f',
  scriptHash: 'c4',
  wif: 'ef',
  logo: btcSignetLogo,
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  backend: 'blockbook',
  bech32: 'tb1',
};

export const blockchains = {
  flux,
  btc,
  doge,
  ltc,
  rvn,
  btcTestnet,
  btcSignet,
  fluxTestnet,
};
