import { backends } from './backends';
import { tokens } from './tokens';

import btcLogo from '../assets/btc.svg';
import fluxLogo from '../assets/flux.svg';
import dogeLogo from '../assets/doge.svg';
import ltcLogo from '../assets/ltc.svg';
import rvnLogo from '../assets/rvn.svg';
import zecLogo from '../assets/zec.svg';
import bchLogo from '../assets/bch.svg';
import btcTestnetLogo from '../assets/btcTestnet.svg';
import btcSignetLogo from '../assets/btcSignet.svg';
import fluxTestnetLogo from '../assets/fluxTestnet.svg';
import sepoliaLogo from '../assets/ethTestnet.svg';
import ethLogo from '../assets/eth.svg';
import polLogo from '../assets/pol.svg';
import amoyLogo from '../assets/polTestnet.svg';
import baseLogo from '../assets/base.svg';
import bscLogo from '../assets/bsc.svg';
import avaxLogo from '../assets/avax.svg';

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
  onramperNetwork: 'flux',
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
  minFeePerByte: 1000, // min fee per byte
  feePerByte: 1050, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
  onramperNetwork: 'ravencoin',
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
  onramperNetwork: 'litecoin',
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
  onramperNetwork: 'bitcoin',
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
  feePerByte: 1100, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: true,
  onramperNetwork: 'dogecoin',
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
  feePerByte: 30, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: false,
  txExpiryHeight: 60, // 1 hour
  onramperNetwork: 'zcash',
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
  feePerByte: 4, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: false,
  cashaddr: 'bitcoincash:',
  hashType: 0x40, // will force SIGHASH_BITCOINCASHBIP143
  onramperNetwork: 'bitcoincash',
};

const sepolia = {
  id: 'sepolia',
  libid: 'sepolia',
  name: 'Testnet Sepolia',
  symbol: 'TEST-ETH',
  logo: sepoliaLogo,
  slip: 1,
  decimals: 18,
  node: backends().sepolia.node,
  api: backends().sepolia.api,
  bip32: {
    // not specified, use default
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  scriptType: 'p2sh', // not specified, use default
  chainType: 'evm',
  chainId: '11155111',
  backend: 'alchemy',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0x3974821943e9cA3549744D910999332eE387Fda4',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 120, // 120 gwei
  priorityFee: 5, // 5 gwei
  gasLimit: 750000, // 750k gas
  tokens: tokens.sepolia(),
};

const eth = {
  id: 'eth',
  libid: 'mainnet',
  name: 'Ethereum',
  symbol: 'ETH',
  logo: ethLogo,
  slip: 60,
  decimals: 18,
  node: backends().eth.node,
  api: backends().eth.api,
  bip32: {
    // not specified, use default
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  scriptType: 'p2sh', // not specified, use default
  chainType: 'evm',
  chainId: '1',
  backend: 'alchemy',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0x3974821943e9cA3549744D910999332eE387Fda4',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 11, // 11 gwei
  priorityFee: 2, // 2 gwei
  gasLimit: 750000, // 750k gas
  tokens: tokens.eth(),
  onramperNetwork: 'ethereum',
};

const amoy = {
  id: 'amoy',
  libid: 'polygonAmoy',
  name: 'Testnet Polygon Amoy',
  symbol: 'TEST-POL',
  logo: amoyLogo,
  slip: 1,
  decimals: 18,
  node: backends().amoy.node,
  api: backends().amoy.api,
  bip32: {
    // not specified, use default
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  scriptType: 'p2sh', // not specified, use default
  chainType: 'evm',
  chainId: '80002',
  backend: 'alchemy',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0x3974821943e9cA3549744D910999332eE387Fda4',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 120, // 120 gwei
  priorityFee: 5, // 5 gwei
  gasLimit: 750000, // 750k gas
  tokens: tokens.amoy(),
};

const polygon = {
  id: 'polygon',
  libid: 'polygon',
  name: 'Polygon',
  symbol: 'POL',
  logo: polLogo,
  slip: 966,
  decimals: 18,
  node: backends().polygon.node,
  api: backends().polygon.api,
  bip32: {
    // not specified, use default
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  scriptType: 'p2sh', // not specified, use default
  chainType: 'evm',
  chainId: '137',
  backend: 'alchemy',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0x3974821943e9cA3549744D910999332eE387Fda4',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 50, // 50 gwei
  priorityFee: 5, // 5 gwei
  gasLimit: 750000, // 750k gas
  tokens: tokens.polygon(),
  onramperNetwork: 'polygon',
};

const base = {
  id: 'base',
  libid: 'base',
  name: 'Base',
  symbol: 'ETH',
  logo: baseLogo,
  slip: 8453,
  decimals: 18,
  node: backends().base.node,
  api: backends().base.api,
  bip32: {
    // not specified, use default
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  scriptType: 'p2sh', // not specified, use default
  chainType: 'evm',
  chainId: '8453',
  backend: 'alchemy',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0x3974821943e9cA3549744D910999332eE387Fda4',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 0.1, // 0.1 gwei
  priorityFee: 0.01, // 0.01 gwei
  gasLimit: 750000, // 750k gas
  tokens: tokens.base(),
  onramperNetwork: 'base',
};

const bsc = {
  id: 'bsc',
  libid: 'bsc',
  name: 'Binance Smart Chain',
  symbol: 'BNB',
  logo: bscLogo,
  slip: 9006,
  decimals: 18,
  node: backends().bsc.node,
  api: backends().bsc.api,
  bip32: {
    // not specified, use default
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  scriptType: 'p2sh', // not specified, use default
  chainType: 'evm',
  chainId: '56',
  backend: 'etherspot',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0x3974821943e9cA3549744D910999332eE387Fda4',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 0, // 50 gwei
  priorityFee: 1, // 5 gwei
  gasLimit: 750000, // 750k gas
  tokens: tokens.bsc(),
  onramperNetwork: 'bsc',
};

const avax = {
  id: 'avax',
  libid: 'avalanche',
  name: 'Avalanche C-Chain',
  symbol: 'AVAX',
  logo: avaxLogo,
  slip: 9005,
  decimals: 18,
  node: backends().avax.node,
  api: backends().avax.api,
  bip32: {
    // not specified, use default
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  scriptType: 'p2sh', // not specified, use default
  chainType: 'evm',
  chainId: '43114',
  backend: 'etherspot',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0x3974821943e9cA3549744D910999332eE387Fda4',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 10, // 50 gwei
  priorityFee: 1, // 5 gwei
  gasLimit: 750000, // 750k gas
  tokens: tokens.avax(),
  onramperNetwork: 'avaxc',
};

export const blockchains = {
  btc,
  flux,
  eth,
  bsc,
  doge,
  avax,
  ltc,
  bch,
  polygon,
  base,
  rvn,
  zec,
  btcTestnet,
  btcSignet,
  fluxTestnet,
  sepolia,
  amoy,
};
