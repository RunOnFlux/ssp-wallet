import { backends } from './backends';
const logos = import.meta.glob("../assets/*.svg", {import: 'default', eager: true});


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
  logo: logos['../assets/flux.svg'],
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
  logo: logos['../assets/fluxTestnet.svg'],
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
  logo: logos['../assets/rvn.svg'],
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
  logo: logos['../assets/ltc.svg'],
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
  logo: logos['../assets/btc.svg'],
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
  logo: logos['../assets/doge.svg'],
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
  logo: logos['../assets/btcTestnet.svg'],
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
  logo: logos['../assets/btcSignet.svg'],
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
  logo: logos['../assets/zec.svg'],
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
  logo: logos['../assets/bch.svg'],
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
  symbol: 'TEST-ETH',
  logo: logos['../assets/teth.svg'],
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
  baseFee: 120, // 120 gwei
  priorityFee: 5, // 5 gwei
  gasLimit: 750000, // 750k gas
  tokens: [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Testnet Ethereum Sepolia',
      symbol: 'TEST-ETH',
      decimals: 18,
      logo: logos['../assets/teth.svg'],
    },
    {
      contract: '0x690cc0235aBEA2cF89213E30D0F0Ea0fC054B909',
      name: 'Fake Flux',
      symbol: 'TEST-FLUX',
      decimals: 8,
      logo: logos['../assets/flux.svg'],
    },
  ],
};

const eth = {
  id: 'eth',
  libid: 'mainnet',
  name: 'Ethereum',
  symbol: 'ETH',
  logo: logos['../assets/eth.svg'],
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
  baseFee: 11, // 11 gwei
  priorityFee: 2, // 2 gwei
  gasLimit: 750000, // 750k gas
  tokens: [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      logo: logos['../assets/eth.svg'],
    },
    {
      contract: '0x720cd16b011b987da3518fbf38c3071d4f0d1495',
      name: 'Flux',
      symbol: 'FLUX',
      decimals: 8,
      logo: logos['../assets/flux.svg'],
    },
    {
      contract: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      name: 'Tether',
      symbol: 'USDT',
      decimals: 6,
      logo: logos['../assets/usdt.svg'],
    },
    {
      contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logo: logos['../assets/usdc.svg'],
    },
    {
      contract: '0x582d872a1b094fc48f5de31d3b73f2d9be47def1',
      name: 'Wrapped Toncoin',
      symbol: 'TONCOIN',
      decimals: 9,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x50327c6c5a14dcade707abad2e27eb517df87ab5',
      name: 'TRON',
      symbol: 'TRX',
      decimals: 6,
      logo: logos['../assets/trx.svg'],
    },
    {
      contract: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
      name: 'SHIBA INU',
      symbol: 'SHIB',
      decimals: 18,
      logo: logos['../assets/shib.svg'],
    },
    {
      contract: '0x514910771af9ca656af840dff83e8264ecf986ca',
      name: 'ChainLink',
      symbol: 'LINK',
      decimals: 18,
      logo: logos['../assets/link.svg'],
    },
    {
      contract: '0x2af5d2ad76741191d15dfe7bf6ac92d4bd912ca3',
      name: 'UNUS SED LEO',
      symbol: 'LEO',
      decimals: 18,
      logo: logos['../assets/leo.svg'],
    },
    {
      contract: '0x6b175474e89094c44da98b954eedeac495271d0f',
      name: 'Dai',
      symbol: 'DAI',
      decimals: 18,
      logo: logos['../assets/dai.svg'],
    },
    {
      contract: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      name: 'Uniswap',
      symbol: 'UNI',
      decimals: 18,
      logo: logos['../assets/uni.svg'],
    },
    {
      contract: '0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85',
      name: 'Artificial Superintelligence Alliance',
      symbol: 'FET',
      decimals: 18,
      logo: logos['../assets/fet.svg'],
    },
    {
      contract: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
      name: 'Pepe',
      symbol: 'PEPE',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409',
      name: 'First Digital USD',
      symbol: 'FDUSD',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x455e53cbb86018ac2b8092fdcd39d8444affc3f6',
      name: 'POL',
      symbol: 'POL',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24',
      name: 'Render',
      symbol: 'RNDR',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x75231f58b43240c9718dd58b4967c5114342a86c',
      name: 'OKB',
      symbol: 'OKB',
      decimals: 18,
      logo: logos['../assets/okb.svg'],
    },
    {
      contract: '0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b',
      name: 'Cronos',
      symbol: 'CRO',
      decimals: 8,
      logo: logos['../assets/cro.svg'],
    },
    {
      contract: '0xf57e7e7c23978c3caec3c3548e3d615c346e79ff',
      name: 'Immutable',
      symbol: 'IMX',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
      name: 'Aave',
      symbol: 'AAVE',
      decimals: 18,
      logo: logos['../assets/aave.svg'],
    },
    {
      contract: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
      name: 'Arbitrum',
      symbol: 'ARB',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x3c3a81e81dc49a522a592e7622a7e711c06bf354',
      name: 'Mantle',
      symbol: 'MNT',
      decimals: 18,
      logo: logos['../assets/mnt.svg'],
    },
    {
      contract: '0xe28b3b32b6c345a34ff64674606124dd5aceca30',
      name: 'Injective',
      symbol: 'INJ',
      decimals: 18,
      logo: logos['../assets/inj.svg'],
    },
    {
      contract: '0x8D983cb9388EaC77af0474fA441C4815500Cb7BB',
      name: 'Cosmos',
      symbol: 'ATOM',
      decimals: 6,
      logo: logos['../assets/atom.svg'],
    },
    {
      contract: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
      name: 'Maker',
      symbol: 'MKR',
      decimals: 18,
      logo: logos['../assets/mkr.svg'],
    },
    {
      contract: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
      name: 'The Graph',
      symbol: 'GRT',
      decimals: 18,
      logo: logos['../assets/grt.svg'],
    },
    {
      contract: '0x54D2252757e1672EEaD234D27B1270728fF90581',
      name: 'Bitget Token',
      symbol: 'BGB',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e',
      name: 'FLOKI',
      symbol: 'FLOKI',
      decimals: 9,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x1151CB3d861920e07a38e03eEAd12C32178567F6',
      name: 'Bonk',
      symbol: 'BONK',
      decimals: 5,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x7420B4b9a0110cdC71fB720908340C03F9Bc03EC',
      name: 'JasmyCoin',
      symbol: 'JASMY',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xf34960d9d60be18cc1d5afc1a6f012a723a28811',
      name: 'Kucoin Token',
      symbol: 'KCS',
      decimals: 6,
      logo: logos['../assets/kcs.svg'],
    },
    {
      contract: '0x3593d125a4f7849a1b059e64f4517a86dd60c95d',
      name: 'MANTRA',
      symbol: 'OM',
      decimals: 18,
      logo: logos['../assets/om.svg'],
    },
    {
      contract: '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
      name: 'Lido DAO',
      symbol: 'LDO',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x4a220e6096b25eadb88358cb44068a3248254675',
      name: 'Quant',
      symbol: 'QNT',
      decimals: 18,
      logo: logos['../assets/qnt.svg'],
    },
    {
      contract: '0xc669928185dbce49d2230cc9b0979be6dc797957',
      name: 'BitTorrent',
      symbol: 'BTT',
      decimals: 18,
      logo: logos['../assets/btt.svg'],
    },
    {
      contract: '0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3',
      name: 'Ondo',
      symbol: 'ONDO',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x5c147e74D63B1D31AA3Fd78Eb229B65161983B2b',
      name: 'Wrapped Flow',
      symbol: 'WFLOW',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xe66747a101bff2dba3697199dcce5b743b454759',
      name: 'GateToken',
      symbol: 'GT',
      decimals: 18,
      logo: logos['../assets/gt.svg'],
    },
    {
      contract: '0x0c10bf8fcb7bf5412187a595ab97a3609160b5c6',
      name: 'USDD',
      symbol: 'USDD',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x62D0A8458eD7719FDAF978fe5929C6D342B0bFcE',
      name: 'Beam',
      symbol: 'BEAM',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b',
      name: 'Axie Infinity',
      symbol: 'AXS',
      decimals: 18,
      logo: logos['../assets/axs.svg'],
    },
    {
      contract: '0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766',
      name: 'Starknet',
      symbol: 'STRK',
      decimals: 18,
      logo: logos['../assets/strk.svg'],
    },
    {
      contract: '0x163f8c2467924be0ae7b5347228cabf260318753',
      name: 'Worldcoin',
      symbol: 'WLD',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
      name: 'Tether Gold',
      symbol: 'XAUt',
      decimals: 6,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xd1d2Eb1B1e90B638588728b4130137D262C87cae',
      name: 'Gala',
      symbol: 'GALA',
      decimals: 8,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x3845badAde8e6dFF049820680d1F14bD3903a5d0',
      name: 'The Sandbox',
      symbol: 'SAND',
      decimals: 18,
      logo: logos['../assets/sand.svg'],
    },
    {
      contract: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
      name: 'Ethereum Name Service',
      symbol: 'ENS',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xb62132e35a6c13ee1ee0f84dc5d40bad8d815206',
      name: 'Nexo',
      symbol: 'NEXO',
      decimals: 18,
      logo: logos['../assets/nexo.svg'],
    },
    {
      contract: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
      name: 'Decentraland',
      symbol: 'MANA',
      decimals: 18,
      logo: logos['../assets/mana.svg'],
    },
    {
      contract: '0xB0fFa8000886e57F86dd5264b9582b2Ad87b2b91',
      name: 'Wormhole',
      symbol: 'W',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x808507121b80c02388fad14726482e061b8da827',
      name: 'Pendle',
      symbol: 'PENDLE',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x0000000000085d4780B73119b644AE5ecd22b376',
      name: 'TrueUSD',
      symbol: 'TUSD',
      decimals: 18,
      logo: logos['../assets/tusd.svg'],
    },
    {
      contract: '0x45804880de22913dafe09f4980848ece6ecbaf78',
      name: 'PAX Gold',
      symbol: 'PAXG',
      decimals: 18,
      logo: logos['../assets/paxg.svg'],
    },
    {
      contract: '0x3506424f91fd33084466f402d5d97f05f8e3b4af',
      name: 'Chiliz',
      symbol: 'CHZ',
      decimals: 18,
      logo: logos['../assets/chz.svg'],
    },
    {
      contract: '0xbd31ea8212119f94a611fa969881cba3ea06fa3d',
      name: 'Terra Classic',
      symbol: 'LUNC',
      decimals: 6,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898',
      name: 'PancakeSwap',
      symbol: 'CAKE',
      decimals: 18,
      logo: logos['../assets/cake.svg'],
    },
    {
      contract: '0x4d224452801aced8b2f0aebe155379bb5d594381',
      name: 'ApeCoin',
      symbol: 'APE',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      name: 'Synthetix',
      symbol: 'SNX',
      decimals: 18,
      logo: logos['../assets/snx.svg'],
    },
    {
      contract: '0xde4EE8057785A7e8e800Db58F9784845A5C2Cbd6',
      name: 'DeXe',
      symbol: 'DEXE',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x57e114B691Db790C35207b2e685D4A43181e6061',
      name: 'Ethena',
      symbol: 'ENA',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x6985884C4392D348587B19cb9eAAf157F13271cd',
      name: 'LayerZero',
      symbol: 'ZRO',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x26B80FBfC01b71495f477d5237071242e0d959d7',
      name: 'Wrapped ROSE',
      symbol: 'wROSE',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x626E8036dEB333b408Be468F951bdB42433cBF18',
      name: 'AIOZ Network',
      symbol: 'AIOZ',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x58b6a8a3302369daec383334672404ee733ab239',
      name: 'Livepeer',
      symbol: 'LPT',
      decimals: 18,
      logo: logos['../assets/lpt.svg'],
    },
    {
      contract: '0x198d14f2ad9ce69e76ea330b374de4957c3f850a',
      name: 'APENFT',
      symbol: 'NFT',
      decimals: 6,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x467719aD09025FcC6cF6F8311755809d45a5E5f3',
      name: 'Axelar',
      symbol: 'AXL',
      decimals: 6,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xe53ec727dbdeb9e2d5456c3be40cff031ab40a55',
      name: 'SuperVerse',
      symbol: 'SUPER',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x6810e776880c02933d47db1b9fc05908e5386b96',
      name: 'Gnosis',
      symbol: 'GNO',
      decimals: 18,
      logo: logos['../assets/gno.svg'],
    },
    {
      contract: '0x11eef04c884e24d9b7b4760e7476d06ddf797f36',
      name: 'MX Token',
      symbol: 'MX',
      decimals: 18,
      logo: logos['../assets/mx.svg'],
    },
    {
      contract: '0xc00e94cb662c3520282e6f5717214004a7f26888',
      name: 'Compound',
      symbol: 'COMP',
      decimals: 18,
      logo: logos['../assets/comp.svg'],
    },
    {
      contract: '0x12e2b8033420270db2f3b328e32370cb5b2ca134',
      name: 'SafePal',
      symbol: 'SFP',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x0C356B7fD36a5357E5A017EF11887ba100C9AB76',
      name: 'Kava',
      symbol: 'KAVA',
      decimals: 6,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xac57de9c1a09fec648e93eb98875b212db0d460b',
      name: 'Baby Doge Coin',
      symbol: 'BabyDoge',
      decimals: 9,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x5283d291dbcf85356a21ba090e6db59121208b44',
      name: 'Blur',
      symbol: 'BLUR',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a',
      name: 'Mog Coin',
      symbol: 'MOG',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x5afe3855358e112b5647b952709e6165e1c1eeee',
      name: 'Safe',
      symbol: 'SAFE',
      decimals: 18,
      logo: logos['../assets/safe.svg'],
    },
    {
      contract: '0x93A62Ccfcf1EfCB5f60317981F71ed6Fb39F4BA2',
      name: 'Osmosis',
      symbol: 'OSMO',
      decimals: 6,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x320623b8e4ff03373931769a31fc52a4e78b5d70',
      name: 'Reserve Rights',
      symbol: 'RSR',
      decimals: 18,
      logo: logos['../assets/rsr.svg'],
    },
    {
      contract: '0x6fb3e0a217407efff7ca062d46c26e5d60a14d69',
      name: 'IoTeX',
      symbol: 'IOTX',
      decimals: 18,
      logo: logos['../assets/iotx.svg'],
    },
    {
      contract: '0xB528edBef013aff855ac3c50b381f253aF13b997',
      name: 'Aevo',
      symbol: 'AEVO',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xD533a949740bb3306d119CC777fa900bA034cd52',
      name: 'Curve DAO Token',
      symbol: 'CRV',
      decimals: 18,
      logo: logos['../assets/crv.svg'],
    },
    {
      contract: '0x111111111117dc0aa78b770fa6a738034120c302',
      name: '1inch Network',
      symbol: '1INCH',
      decimals: 18,
      logo: logos['../assets/1Inch.svg'],
    },
    {
      contract: '0xe3c408bd53c31c085a1746af401a4042954ff740',
      name: 'GMT',
      symbol: 'GMT',
      decimals: 8,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x4691937a7508860f876c9c0a2a617e7d9e945d4b',
      name: 'WOO',
      symbol: 'WOO',
      decimals: 18,
      logo: logos['../assets/woo.svg'],
    },
    {
      contract: '0xff20817765cb7f73d4bde2e66e067e58d11095c2',
      name: 'Amp',
      symbol: 'AMP',
      decimals: 18,
      logo: logos['../assets/amp.svg'],
    },
    {
      contract: '0x7a58c0be72be218b41c608b7fe7c5bb630736c71',
      name: 'ConstitutionDAO',
      symbol: 'PEOPLE',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xb23d80f5fefcddaa212212f028021b41ded428cf',
      name: 'Echelon Prime',
      symbol: 'PRIME',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x6c6ee5e31d828de241282b9606c8e98ea48526e2',
      name: 'Holo',
      symbol: 'HOT',
      decimals: 18,
      logo: logos['../assets/hot.svg'],
    },
    {
      contract: '0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429',
      name: 'Golem',
      symbol: 'GLM',
      decimals: 18,
      logo: logos['../assets/glm.svg'],
    },
    {
      contract: '0xb131f4a55907b10d1f0a50d8ab8fa09ec342cd74',
      name: 'Memecoin',
      symbol: 'MEME',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x9C7BEBa8F6eF6643aBd725e45a4E8387eF260649',
      name: 'Gravity',
      symbol: 'G',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xbf2179859fc6D5BEE9Bf9158632Dc51678a4100e',
      name: 'aelf',
      symbol: 'ELF',
      decimals: 18,
      logo: logos['../assets/elf.svg'],
    },
    {
      contract: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
      name: 'Basic Attention Token',
      symbol: 'BAT',
      decimals: 18,
      logo: logos['../assets/bat.svg'],
    },
    {
      contract: '0x8290333cef9e6d528dd5618fb97a76f268f3edd4',
      name: 'Ankr',
      symbol: 'ANKR',
      decimals: 18,
      logo: logos['../assets/ankr.svg'],
    },
    {
      contract: '0xa117000000f279d81a1d3cc75430faa017fa5a2e',
      name: 'Aragon',
      symbol: 'ANT',
      decimals: 18,
      logo: logos['../assets/ant.svg'],
    },
    {
      contract: '0xe41d2489571d322189246dafa5ebde1f4699f498',
      name: '0x Protocol',
      symbol: 'ZRX',
      decimals: 18,
      logo: logos['../assets/zrx.svg'],
    },
    {
      contract: '0xFe0c30065B384F05761f15d0CC899D4F9F9Cc0eB',
      name: 'ether.fi',
      symbol: 'ETHFI',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xf091867ec603a6628ed83d274e835539d82e9cc8',
      name: 'ZetaChain',
      symbol: 'ZETA',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54',
      name: 'ssv.network',
      symbol: 'SSV',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x6e2a43be0b1d33b726f0ca3b8de60b3482b8b050',
      name: 'Arkham',
      symbol: 'ARKM',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x2dfF88A56767223A5529eA5960Da7A3F5f766406',
      name: 'SPACE ID',
      symbol: 'ID',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x69af81e73a73b40adf4f3d4223cd9b1ece623074',
      name: 'Mask Network',
      symbol: 'MASK',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5',
      name: 'Threshold',
      symbol: 'T',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xaa7a9ca87d3694b5755f213b5d04094b8d0f0a6f',
      name: 'OriginTrail',
      symbol: 'TRAC',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xd33526068d116ce69f19a9ee46f0bd304f21a51f',
      name: 'Rocket Pool',
      symbol: 'RPL',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b',
      name: 'Convex Finance',
      symbol: 'CVX',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
    {
      contract: '0xf8173a39c56a554837c4c7f104153a005d284d11',
      name: 'Open Campus',
      symbol: 'EDU',
      decimals: 18,
      logo: logos['../assets/etht.svg'],
    },
  ],
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
