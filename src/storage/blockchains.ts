import { backends } from './backends';

import fluxLogo from '/src/assets/flux.svg';
import fluxTestnetLogo from '/src/assets/fluxTestnet.svg';
import rvnLogo from '/src/assets/rvn.svg';
import ltcLogo from '/src/assets/ltc.svg';
import btcLogo from '/src/assets/btc.svg';
import btcTestnetLogo from '/src/assets/btcTestnet.svg';
import btcSignetLogo from '/src/assets/btcSignet.svg';
import dogeLogo from '/src/assets/doge.svg';
import zecLogo from '/src/assets/zec.svg';
import bchLogo from '/src/assets/bch.svg';

// https://github.com/dogecoin/dogecoin/blob/master/doc/fee-recommendation.md

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
  dustLimit: 546, // min utxo amount
  minFeePerByte: 1, // min fee per byte
  feePerByte: 1, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 1800000, // 1,800,000 vbytes
  rbf: false,
  txExpiryHeight: 30, // 30 blocks, 1 hour
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
  dustLimit: 546, // min utxo amount
  minFeePerByte: 1, // min fee per byte
  feePerByte: 1, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 1800000, // 1,800,000 vbytes
  rbf: false,
  txExpiryHeight: 30, // 30 blocks, 1 hour
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
  dustLimit: 546, // min utxo amount
  minFeePerByte: 4, // min fee per byte
  feePerByte: 4, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
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
  dustLimit: 546, // min utxo amount
  minFeePerByte: 1, // min fee per byte
  feePerByte: 20, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
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
    public: 0x02aa7ed3,
    private: 0x02aa7a99,
  },
  backend: 'blockbook',
  bech32: 'bc1',
  dustLimit: 546, // min utxo amount
  minFeePerByte: 1, // min fee per byte
  feePerByte: 100, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
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
  dustLimit: 1000000, // min utxo amount
  minFeePerByte: 1000, // min fee per byte
  feePerByte: 20, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
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
    public: 0x02575483,
    private: 0x02575048,
  },
  backend: 'blockbook',
  bech32: 'tb1',
  dustLimit: 546, // min utxo amount
  minFeePerByte: 1, // min fee per byte
  feePerByte: 5, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
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
    public: 0x02575483,
    private: 0x02575048,
  },
  backend: 'blockbook',
  bech32: 'tb1',
  dustLimit: 546, // min utxo amount
  minFeePerByte: 1, // min fee per byte
  feePerByte: 4, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
};

const zec = {
  id: 'zec',
  libid: 'zcash',
  name: 'Zcash',
  symbol: 'ZEC',
  decimals: 8,
  node: backends().zec.node,
  slip: 133,
  scriptType: 'p2sh',
  messagePrefix: '\u0018Zcash Signed Message:\n',
  pubKeyHash: '1cb8',
  scriptHash: '1cbd',
  wif: '80',
  logo: zecLogo,
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  txVersion: 4,
  txGroupID: 0x892f2085,
  backend: 'blockbook',
  dustLimit: 546, // min utxo amount
  minFeePerByte: 1, // min fee per byte
  feePerByte: 2, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: false,
  txExpiryHeight: 60, // 1 hour
};

const bch = {
  id: 'bch',
  libid: 'bitcoincash',
  name: 'Bitcoin Cash',
  symbol: 'BCH',
  decimals: 8,
  node: backends().bch.node,
  slip: 145,
  scriptType: 'p2sh',
  messagePrefix: '\u0018Bitcoin Signed Message:\n',
  pubKeyHash: '00',
  scriptHash: '05',
  wif: '80',
  logo: bchLogo,
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  backend: 'blockbook',
  dustLimit: 546, // min utxo amount
  minFeePerByte: 1, // min fee per byte
  feePerByte: 2, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
  cashaddr: 'bitcoincash:',
  hashType: 0x40, // will force SIGHASH_BITCOINCASHBIP143
};

export const blockchains = {
  btc,
  flux,
  doge,
  ltc,
  bch,
  rvn,
  zec,
  btcTestnet,
  btcSignet,
  fluxTestnet,
};
