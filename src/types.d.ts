import { Token } from '@storage/blockchains';
// wallet.tx
export interface minHDKey {
  keyPair: {
    toWIF: () => string;
    getPublicKeyBuffer: () => Buffer;
  };
}

export interface xPrivXpub {
  xpriv: string;
  xpub: string;
}

export interface keyPair {
  privKey: string;
  pubKey: string;
}

export interface multisig {
  address: string;
  redeemScript?: string;
  witnessScript?: string;
}

// transactions.ts
export interface utxo {
  txid: string;
  vout: number;
  scriptPubKey: string;
  satoshis: string;
  confirmations: number;
  coinbase: boolean;
}

export interface blockbookUtxo {
  txid: string;
  vout: number;
  value: string;
  confirmations: number;
  coinbase: boolean;
}

export interface broadcastTxResult {
  txid: string;
}

export interface blockbookBroadcastTxResult {
  result: string;
}

export interface balance {
  address: string;
  confirmed: string;
  unconfirmed: string;
  totalTransactions?: number;
}

export interface balanceInsight {
  addrStr: string;
  balanceSat: number;
  unconfirmedBalanceSat: number;
  txApperances: number;
}

export interface balanceBlockbook {
  address: string;
  balance: string;
  unconfirmedBalance: string;
  txs: number;
}

export interface vin {
  txid: string;
  vout: number;
  sequence: number;
  n: number;
  scriptSig: {
    hes: string;
    asm: string;
  };
  addr: string;
  valueSat: number;
  value: number;
}

export interface vinBlockbook {
  txid: string;
  sequence: number;
  n: number;
  vout: number;
  addresses: string[];
  isAddress: boolean;
  isOwn: boolean;
  value: string;
  hex: string;
}

export interface vout {
  value: string;
  n: number;
  scriptPubKey: {
    hex: string;
    asm: string;
    addresses: string[];
    type: string;
  };
}

export interface voutBlockbook {
  value: string;
  n: number;
  hex: string;
  addresses: string[];
  isAddress: boolean;
  isOwn: boolean;
}
export interface transactionInsight {
  txid: string;
  version: number;
  locktime: number;
  blockhash: string;
  blockheight: number;
  confirmations: number;
  size: number;
  vsize: number;
  time: number;
  blocktime: number;
  valueOut: number;
  valueIn: number;
  fees: number;
  vin: vin[];
  vout: vout[];
}

export interface transacitonsInsight {
  totalItems: number;
  from: number;
  to: number;
  items: transactionInsight[];
}

export interface transactionBlockbook {
  txid: string;
  version: number;
  locktime: number;
  blockhash: string;
  blockHeight: number;
  confirmations: number;
  blockTime: number;
  size: number;
  vsize: number;
  blockTime: number;
  value: string;
  valueIn: string;
  fees: string;
  hex: string;
  vin: vinBlockbook[];
  vout: voutBlockbook[];
}

export interface transacitonsBlockbook {
  page: number;
  totalPages: number;
  itemsOnPage: number;
  address: string;
  balance: string;
  unconfirmedBalance: string;
  transactions: transactionBlockbook[];
}

export interface wallet {
  address: string;
  redeemScript: string;
  witnessScript: string;
  balance: string;
  unconfirmedBalance: string;
  transactions: transaction[];
  nodes?: node[];
  tokenBalances?: tokenBalanceEVM[];
  activatedTokens?: string[];
}

export interface node {
  txid: string;
  vout: number;
  amount: string;
  name: string;
  ip: string;
  status: string;
}

export interface contact {
  id: number;
  name: string;
  address: string;
}

export interface txIdentifier {
  txid: string;
  vout: number;
}

export type wallets = Record<string, wallet>;
export type generatedWallets = Record<string, string>;
export interface transaction {
  txid: string;
  fee: string;
  blockheight: number;
  timestamp: number;
  fee: string;
  amount: string; // satoshis
  message: string;
  receiver: string;
  size?: number;
  vsize?: number;
  utxos?: txIdentifier[];
  type?: string; // evm
  isError?: boolean;
  decimals?: number;
  tokenSymbol?: string;
  contractAddress?: string;
}

export interface csvTransaction {
  Timestamp: number;
  Date: string;
  'Koinly Date': string;
  Amount: number;
  Currency: string;
  'Sent Amount': number;
  'Sent Currency': string;
  'Received Amount': number;
  'Received Currency': string;
  'Fee Amount': number;
  'Fee Currency': string;
  TxHash: string;
  Note: string;
}

export interface pendingTransaction {
  amount: string; // satoshis
  createdAt: string;
  expireAt: string;
  payload: string;
  tokenSymbol?: string;
  decimals?: number;
}

export interface getInfoInsight {
  info: {
    version: number;
    blocks: number;
    testnet: boolean;
  };
}

export interface getInfoBlockbook {
  blockbook: {
    bestHeight: number;
  };
}

export interface evm_call {
  jsonrpc: string;
  id: number;
  result: string;
}

export interface flux_storage_call {
  data: string;
}

export interface tokenBalanceEVM {
  contract: string;
  balance: string;
}

export interface tokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

export interface alchemyCallTokenBalances {
  jsonrpc: string;
  id: number;
  result: {
    address: string;
    tokenBalances: tokenBalance[];
  };
}

export interface etherscan_external_tx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  value: string;
  gas: string;
  gasPrice: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  isError: string;
  errCode: string;
  txreceipt_status: string;
  input: string;
  confirmations: string;
  methodId: string;
  functionName: string;
}

export interface etherscan_internal_tx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  input: string;
  type: string;
  gas: string;
  gasUsed: string;
  traceId: string;
  isError: string;
  errCode: string;
}

export interface etherscan_token_tx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  input: string;
  gas: string;
  gasPrice: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
}

export interface eth_evm {
  jsonrpc: string;
  id: number;
  result: string;
}

export interface etherscan_call_external_txs {
  status: string;
  message: string;
  result: etherscan_external_tx[];
}

export interface etherscan_call_internal_txs {
  status: string;
  message: string;
  result: etherscan_internal_tx[];
}

export interface etherscan_call_token_txs {
  status: string;
  message: string;
  result: etherscan_token_tx[];
}

export interface publicNonce {
  kPublic: string;
  kTwoPublic: string;
}

export interface publicPrivateNonce {
  k: string;
  kTwo: string;
  kPublic: string;
  kTwoPublic: string;
}

export interface syncSSPRelay {
  chain: string;
  walletIdentity: string;
  keyXpub: string;
  wkIdentity: string;
  keyToken?: string | null;
  generatedAddress?: string;
  publicNonces?: publicNonce[];
}

export interface actionSSPRelay {
  payload: string;
  action: string;
  createdAt: string;
  expireAt: string;
}

export interface tokenDataSSPRelay {
  decimals: number;
  logo: string | null;
  name: string;
  symbol: string;
}

export interface currency {
  EUR: number;
  AUD: number;
  TRY: number;
  TWD: number;
  RUB: number;
  MMK: number;
  MXN: number;
  MYR: number;
  CNY: number;
  PKR: number;
  PLN: number;
  THB: number;
  PHP: number;
  ARS: number;
  SAR: number;
  DKK: number;
  SGD: number;
  AED: number;
  USD: number;
  CLP: number;
  ILS: number;
  NZD: number;
  HKD: number;
  XDR: number;
  KWD: number;
  BDT: number;
  GBP: number;
  SEK: number;
  IDR: number;
  CHF: number;
  JPY: number;
  XAU: number;
  BMD: number;
  ZAR: number;
  HUF: number;
  BRL: number;
  KRW: number;
  LKR: number;
  NOK: number;
  INR: number;
  VEF: number;
  CAD: number;
  VND: number;
  XAG: number;
  CZK: number;
  BHD: number;
  UAH: number;
  BTC: number;
  ETH: number;
}

export interface cryptos {
  flux: number;
  fluxTestnet: number;
  rvn: number;
  ltc: number;
  btc: number;
  doge: number;
  zec: number;
  bch: number;
  btcTestnet: number;
  btcSignet: number;
  sepolia: number;
  eth: number;
  amoy: number;
  polygon: number;
  base: number;
  bsc: number;
  avax: number;
}

export interface externalIdentity {
  privKey: string;
  pubKey: string;
  address: string;
}

export interface currencySSPRelay {
  fiat: currency;
  crypto: cryptos;
}

export interface networkFee {
  coin: string;
  base: number;
  economy: number;
  normal: number;
  fast: number;
  recommended: number;
}

export type networkFeesSSPRelay = networkFee[];

export type servicesSSPRelay = {
  onramp: boolean;
  offramp: boolean;
  swap: boolean;
};

export type onramperSignatureSSPRelay = {
  signature: string;
};

export interface confirmedNodeInsight {
  collateral: string;
  txhash: string;
  outidx: string;
  ip: string;
  network: string;
  added_height: number;
  confirmed_height: number;
  last_confirmed_height: number;
  last_paid_height: number;
  tier: string;
  payment_address: string;
  pubkey: string;
  activesince: string;
  lastpaid: string;
  amount: string;
  rank: number;
}

export interface confirmedNodesInsight {
  result: confirmedNodeInsight[];
}

export interface dosNodeFlux {
  collateral: string;
  added_height: number;
  payment_address: string;
  eligible_in: number;
  amount: string;
}

export interface dosFlux {
  status: string;
  data: dosNodeFlux[];
}

export interface dosFluxInsight {
  error: string;
  id: number;
  result: dosNodeFlux[];
}

export interface startNodeFlux {
  collateral: string;
  added_height: number;
  payment_address: string;
  expires_in: number;
  amount: string;
}

export interface startFlux {
  status: string;
  data: startNodeFlux[];
}

export interface startFluxInsight {
  error: string;
  id: number;
  result: startNodeFlux[];
}

export interface fusionPAavailable {
  status: string;
  data: {
    address: string;
    totalClaim: number;
    totalMiningFees: number;
    totalSwapFees: number;
    totalFee: number;
    totalReward: number;
    message: string;
    code: number;
    name: string;
  };
}

export interface errorResponse {
  message: string;
  code: number;
  name: string;
}

export interface fusionMessage {
  status: string;
  data: errorResponse | string;
}

export interface chainState {
  xpubWallet: string;
  xpubKey: string;
  wallets: wallets;
  blockheight: number;
  walletInUse: string;
  importedTokens?: Token[]; // EVM
}

export interface abeAsset {
  idzelcore: string;
  name: string;
  ticker: string;
  chain: number;
  contract?: string;
  idchangenowfloat?: string;
  idchangenowfix?: string;
  idchangenowfloatlimit?: string[] | null;
  idchangenowfixlimit?: string[] | null;
  idchangelloyfloat?: string;
  idchangellyfix?: string;
  idchangellyfloatlimit?: string[] | null;
  idchangellyfixlimit?: string[] | null;
  idsimpleswapfloat?: string;
  idsimpleswapfix?: string;
  idsimpleswapfloatlimit?: string[] | null;
  idsimpleswapfixlimit?: string[] | null;
  idchangeherofloat?: string;
  idchangeherofix?: string;
  idchangeherofloatlimit?: string[] | null;
  idchangeherofixlimit?: string[] | null;
  idxoswapfloat?: string;
  idxoswapfloatlimit?: string[] | null;
  idfusionfix?: string;
  idfusionfixlimit?: string[] | null;
}

export interface abeAssetResponse {
  status: string;
  data: abeAsset[];
}

export interface zelcoreAsset {
  idzelcore: string;
  name: string;
  ticker: string;
  chain: string;
  contract?: string;
  decimals: number | null;
}

export interface zelcoreAssetResponse {
  status: string;
  data: zelcoreAsset[];
}

export interface pairDetailsResponse {
  status: string;
  data: {
    sellAsset: number;
    buyAsset: number;
    exchanges: {
      exchangeId: string;
      sellAsset: string;
      buyAsset: string;
      rate: string;
      precision: string;
      destNetworkFee: string;
      sellAmount: string;
      buyAmount: string;
      rateId: string | null;
      minSellAmount: string;
      maxSellAmount: string;
    }[];
    message?: string;
  };
}

export interface createSwapData {
  exchangeId: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  buyAddress: string;
  refundAddress: string;
  rateId?: string | null;
  refundAddressExtraId?: string | null;
  buyAddressExtraId?: string | null;
}

export interface swapResponseData {
  exchangeId: string;
  swapId: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  buyAmount: string;
  rate: string;
  rateId: string | null;
  kycRequired: boolean;
  depositAddress: string;
  depositExtraId: string | null;
  buyAddressExtraId: string | null;
  refundAddressExtraId: string | null;
  status: string;
  createdAt: number;
  validTill: number;
}
export interface createSwapResponse {
  status: string;
  data: swapResponseData;
}

export interface swapHistoryOrder {
  exchangeId: string;
  swapId: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  buyAmount: string;
  rate: string;
  rateId: string | null;
  kycRequired: boolean;
  buyAddress: string;
  refundAddress: string;
  buyAddressExtraId: string | null;
  refundAddressExtraId: string | null;
  status: string;
  createdAt: number;
  sellTxid: string | null;
  buyTxid: string | null;
  refundTxid: string | null;
  zelid: string | null;
  exchangeSellAssetId: string;
  exchangeBuyAssetId: string;
}

export interface swapHistoryResponse {
  status: string;
  data: swapHistoryOrder[];
}

export interface exchangeProvider {
  exchangeId: exchangeId;
  name: string;
  type: string;
  website: string;
  endpoint: string;
  terms: string;
  privacy: string;
  kyc: string;
  track: string;
  logo: string;
}

export interface exchangeProvidersResponse {
  status: string;
  data: exchangeProvider[];
}

export interface selectedExchangeType {
  exchangeId?: string;
  minSellAmount?: string;
  maxSellAmount?: string;
  rateId?: string | null;
  rate?: string;
  precision?: string;
  sellAmount?: string;
  buyAmount?: string;
}

declare global {
  var refreshIntervalTransactions: string | number | NodeJS.Timeout | undefined;

  var refreshIntervalBalances: string | number | NodeJS.Timeout | undefined;

  var refreshIntervalRates: string | number | NodeJS.Timeout | undefined;

  var refreshIntervalNetworkFee: string | number | NodeJS.Timeout | undefined;

  var refreshIntervalNodes: string | number | NodeJS.Timeout | undefined;

  var refreshIntervalServices: string | number | NodeJS.Timeout | undefined;

  var refreshIntervalABE: string | number | NodeJS.Timeout | undefined;
}
