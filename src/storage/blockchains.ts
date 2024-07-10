import { backends } from './backends';

const fluxLogo = '/src/assets/flux.svg';
const fluxTestnetLogo = '/src/assets/fluxTestnet.svg';
const rvnLogo = '/src/assets/rvn.svg';
const ltcLogo = '/src/assets/ltc.svg';
const btcLogo = '/src/assets/btc.svg';
const btcTestnetLogo = '/src/assets/btcTestnet.svg';
const btcSignetLogo = '/src/assets/btcSignet.svg';
const dogeLogo = '/src/assets/doge.svg';
const zecLogo = '/src/assets/zec.svg';
const bchLogo = '/src/assets/bch.svg';
const ethLogo = '/src/assets/eth.svg';

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
  feePerByte: 3, // fee per byte
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
  feePerByte: 4, // fee per byte
  maxMessage: 80, // 80 bytes in size
  maxTxSize: 100000, // 100,000 vbytes
  rbf: false,
  cashaddr: 'bitcoincash:',
  hashType: 0x40, // will force SIGHASH_BITCOINCASHBIP143
};

const sepolia = {
  id: 'sepolia',
  libid: 'sepolia',
  name: 'Testnet Sepolia',
  symbol: 'tETH',
  logo: ethLogo,
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
  backend: 'alchemy',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0xA76f98D25C9775F67DCf8B9EF9618d454D287467',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 120000000000, // 120 gwei
  priorityFee: 5000000000, // 5 gwei
  gasLimit: 500000, // 500k gas
  tokens: [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Testnet Ethereum Sepolia',
      symbol: 'tETH',
      decimals: 18,
      logo: ethLogo,
    },
    {
      contract: '0x690cc0235aBEA2cF89213E30D0F0Ea0fC054B909',
      name: 'Fake Flux',
      symbol: 'FLUX',
      decimals: 8,
      logo: fluxLogo,
    },
  ]
};

const eth = {
  id: 'eth',
  libid: 'eth',
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
  backend: 'alchemy',
  accountSalt: 'aasalt', // ssp uses this salt for smart accounts
  factorySalt: 'aafactorysalt', // factory uses this salt
  factoryAddress: '0xA76f98D25C9775F67DCf8B9EF9618d454D287467',
  entrypointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  baseFee: 8000000000, // 8 gwei
  priorityFee: 2000000000, // 2 gwei
  gasLimit: 500000, // 500k gas
  tokens: [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      logo: ethLogo,
    },
    {
      contract: '0x720cd16b011b987da3518fbf38c3071d4f0d1495',
      name: 'Flux',
      symbol: 'FLUX',
      decimals: 8,
      logo: fluxLogo,
    },
  ]
};

export const blockchains = {
  btc,
  flux,
  eth,
  doge,
  ltc,
  bch,
  rvn,
  zec,
  btcTestnet,
  btcSignet,
  fluxTestnet,
  sepolia,
};
