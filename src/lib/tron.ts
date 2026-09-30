/**
 * TRON (chainType 'tron') on @runonflux/tron-multisig.
 *
 * Implements ~/repos/TRON_SSP_CONTRACT.md. Every derivation, payload shape and
 * signing guard here must stay byte-for-byte in step with SSP Key, the relay
 * and the enterprise backend: never diverge from the contract, and never
 * re-implement vault math (addresses, configHash, CREATE2, TIP-712, ABI): it
 * all comes from the SDK.
 *
 * Keys (contract §2): the normal BIP-48 account xpub m/48'/195'/{account}'/0'
 * (standard xpub/xprv version bytes), leaf = xpub/a/b (33-byte compressed),
 * signer = TRON address of the leaf key. Consumer 2-of-2: a = typeIndex (0),
 * b = addressIndex; the SDK sorts the two signers. Enterprise M-of-N:
 * a = vaultIndex, b = addressIndex.
 *
 * Network constants (factory, implementation, sponsor, feeCollector) come
 * only from the SDK's pinned NETWORKS table via getNetwork. While they are
 * null the SDK throws NOT_DEPLOYED: isTronLive() is false, the chain is shown
 * as unavailable and sends are disabled.
 *
 * Base58 is case-sensitive: TRON addresses are never lowercased.
 */
import * as T from '@runonflux/tron-multisig';
import { TronHttpClient } from '@runonflux/tron-multisig/rpc';
import type { FetchLike } from '@runonflux/tron-multisig/rpc';
import { HDKey } from '@scure/bip32';
import axios from 'axios';
import localForage from 'localforage';
import { blockchains } from '@storage/blockchains';
import type { Token } from '@storage/blockchains';
import { backends } from '@storage/backends';
import { sspConfig } from '@storage/ssp';
import type { tokenBalanceEVM, transaction } from '../types';
import type { VaultDecodedRecipient, VaultDecodedTx } from './transactions';

export type TronNetworkName = T.NetworkName;
export type TronOp = T.Op;
export type TronCall = T.Call;
export type TronVaultConfig = T.VaultConfig;
export type TronOpJson = T.OpJson;
export type TronCallJson = T.CallJson;
export type TronOpDisplay = T.OpDisplay;

/** `action:'tx'` payload format (contract §3). */
export const TRON_OP_FORMAT = 'ssp-tron-op';
export const TRON_OP_VERSION = 1;

/** Fee token meaning TRX (`address(0)`). */
export const TRON_TRX_FEE_TOKEN: string = T.TRX_FEE_TOKEN;

/** Wallet default Op lifetime for consumer sends (contract §5.5). */
export const TRON_CONSUMER_DEADLINE_SECONDS = 30n * 60n;
/** The key's consumer ceiling on deadline − now (contract §5.5). */
export const TRON_CONSUMER_MAX_DEADLINE_SECONDS = 2n * 60n * 60n;
/**
 * Enterprise ops live until the proposal expires (≤ 30 days). One hour of
 * slack absorbs clock skew between the backend and this device.
 */
export const TRON_ENTERPRISE_MAX_DEADLINE_SECONDS = 30n * 86400n + 3600n;

/** Consumer fee ceilings the key enforces (contract §5.4): 30 TRX / 8 USDT. */
export const TRON_CONSUMER_FEE_CEILING_TRX = 30_000_000n;
export const TRON_CONSUMER_FEE_CEILING_USDT = 8_000_000n;
/**
 * Enterprise fee sanity cap on this signing device. The org policy lives on
 * the backend; this device only refuses the absurd: min($maxTxFeeUSD worth of
 * TRX, 300 TRX) and $maxTxFeeUSD of USDT.
 */
export const TRON_ENTERPRISE_FEE_CAP_TRX = 300_000_000n;

/**
 * Self-submitted (fee-free) consumer ops take their nonce from bitmap word
 * 2^20 upwards, far away from the low bits the relay reserves for sponsored
 * quotes, so a self-pay op never collides with a pending sponsored one.
 */
export const TRON_SELF_PAY_NONCE_WORD = 1n << 20n;

/** At most this many history rows are served per source (TronGrid cap). */
export const TRON_HISTORY_MAX = 200;
/** Incoming TRX below 0.1 TRX is address-poisoning dust (contract §5.8). */
export const TRON_TRX_DUST_SUN = 100_000n;
/** Whitelisted stablecoins: incoming below 0.01 is dust. */
const TRON_STABLE_SYMBOLS = new Set(['USDT', 'USDD', 'TUSD', 'USD1', 'USDC']);

export class TronError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'TronError';
  }
}

// ---------------------------------------------------------------------------
// Chains and networks
// ---------------------------------------------------------------------------

const TRON_CHAIN_NETWORKS: Readonly<Record<string, TronNetworkName>> = {
  tron: 'mainnet',
  tronNile: 'nile',
};

export function isTronChain(chain: string): boolean {
  return blockchains[chain]?.chainType === 'tron';
}

/** SDK network name of a wallet chain id ('tron' → 'mainnet'). */
export function tronNetworkName(chain: string): TronNetworkName {
  const name = TRON_CHAIN_NETWORKS[chain];
  if (!name || !isTronChain(chain)) {
    throw new TronError('UNKNOWN_CHAIN', `${chain} is not a TRON chain`);
  }
  return name;
}

/** The pinned SDK network of a chain (never an app-side override). */
export function tronNetwork(chain: string): T.NetworkConfig {
  return T.getNetwork(tronNetworkName(chain));
}

/**
 * Whether TRON vaults are live on a network (SDK name or wallet chain id):
 * factory, implementation, sponsor and fee collector are all pinned in the
 * SDK. While any is null, TRON is shown as unavailable and sending is off.
 */
export function isTronLive(networkOrChain: string): boolean {
  try {
    const name: TronNetworkName =
      networkOrChain === 'mainnet' || networkOrChain === 'nile'
        ? networkOrChain
        : tronNetworkName(networkOrChain);
    const n = T.getNetwork(name);
    return (
      n.factory !== null &&
      n.implementation !== null &&
      n.sponsor !== null &&
      n.feeCollector !== null
    );
  } catch {
    return false;
  }
}

/** Every non-TRON chain is available; a TRON chain only once it is live. */
export function isChainAvailable(chain: string): boolean {
  return !isTronChain(chain) || isTronLive(chain);
}

/** Symbol/decimals of the whitelisted TRC-20s (plus imports) for display. */
export function tronTokenInfos(
  chain: string,
  importedTokens: Token[] = [],
): T.TokenInfo[] {
  const out: T.TokenInfo[] = [];
  const seen = new Set<string>();
  for (const tk of [...blockchains[chain].tokens, ...importedTokens]) {
    if (!tk.contract || !T.isValidAddress(tk.contract)) continue;
    if (seen.has(tk.contract)) continue;
    seen.add(tk.contract);
    out.push({
      address: tk.contract,
      symbol: tk.symbol,
      decimals: tk.decimals,
    });
  }
  return out;
}

function tokenByContract(
  chain: string,
  contract: string,
  importedTokens: Token[] = [],
): Token | undefined {
  // Case-sensitive on purpose (base58).
  return [...blockchains[chain].tokens, ...importedTokens].find(
    (tk) => tk.contract === contract,
  );
}

// ---------------------------------------------------------------------------
// Keys, signers and vault addresses (contract §2)
// ---------------------------------------------------------------------------

function tronHdNode(xkey: string, chain: string): HDKey {
  return HDKey.fromExtendedKey(xkey, blockchains[chain].bip32);
}

/** Compressed (33-byte) public key at xpub/a/b. */
export function tronLeafPublicKey(
  xpub: string,
  a: number,
  b: number,
  chain: string,
): Uint8Array {
  const node = tronHdNode(xpub, chain).deriveChild(a).deriveChild(b);
  if (!node.publicKey) throw new Error('TRON key derivation failed');
  return node.publicKey;
}

/** The TRON signer address of the leaf at xpub/a/b. */
export function tronLeafAddress(
  xpub: string,
  a: number,
  b: number,
  chain: string,
): string {
  return T.addressFromPublicKey(tronLeafPublicKey(xpub, a, b, chain));
}

/** TRON address of a compressed public key given as hex. */
export function tronAddressFromPublicKeyHex(pubKeyHex: string): string {
  return T.addressFromPublicKey(T.hexToBytes(pubKeyHex));
}

/** Consumer 2-of-2 config (wallet + key leaf at a/b), signers sorted. */
export function tronConsumerConfig(
  xpubWallet: string,
  xpubKey: string,
  a: number,
  b: number,
  chain: string,
): T.VaultConfig {
  return T.buildConsumerConfig(
    tronLeafPublicKey(xpubWallet, a, b, chain),
    tronLeafPublicKey(xpubKey, a, b, chain),
  );
}

/**
 * Consumer vault (config, configHash, address). `network` defaults to the
 * chain's pinned SDK network; tests pass the vector NetworkConfig.
 */
export function tronConsumerVault(
  xpubWallet: string,
  xpubKey: string,
  a: number,
  b: number,
  chain: string,
  network: T.NetworkConfig = tronNetwork(chain),
): T.VaultInfo {
  return T.deriveVault(
    network,
    tronConsumerConfig(xpubWallet, xpubKey, a, b, chain),
  );
}

/**
 * The consumer vault address for generateMultisigAddress. Throws NOT_DEPLOYED
 * while the network's factory/implementation are not pinned.
 */
export function generateMultisigAddressTRON(
  xpubWallet: string,
  xpubKey: string,
  typeIndex: number,
  addressIndex: number,
  chain: string,
): { address: string } {
  return {
    address: tronConsumerVault(
      xpubWallet,
      xpubKey,
      typeIndex,
      addressIndex,
      chain,
    ).address,
  };
}

/**
 * The wallet's own signing key at a leaf: raw 32-byte private key (hex) and
 * compressed public key (hex).
 */
export function generateAddressKeypairTRON(
  xpriv: string,
  a: number,
  b: number,
  chain: string,
): { privKey: string; pubKey: string } {
  const node = tronHdNode(xpriv, chain).deriveChild(a).deriveChild(b);
  if (!node.privateKey || !node.publicKey) {
    throw new Error('TRON private key derivation failed');
  }
  const privKey = T.bytesToHex(node.privateKey);
  const pubKey = T.bytesToHex(node.publicKey);
  node.wipePrivateData();
  return { privKey, pubKey };
}

/** SDK strict base58check validation (25 bytes, 0x41, checksum). */
export function isValidTronAddress(address: string): boolean {
  return T.isValidAddress(address);
}

/**
 * Sign a 32-byte digest with a leaf private key (hex): 65-byte r‖s‖v, v 27/28,
 * low-s, self-verified by the SDK. The signer's key copy is wiped afterwards.
 */
export function signTronDigest(
  privKeyHex: string,
  digest: Uint8Array,
): Uint8Array {
  const priv = T.hexToBytes(privKeyHex);
  const signer = T.localSigner(priv);
  try {
    return signer.signDigest(digest);
  } finally {
    signer.destroy();
    priv.fill(0);
  }
}

// ---------------------------------------------------------------------------
// Node RPC (node-tron.sspwallet.io: /wallet/*, /walletsolidity/*)
// ---------------------------------------------------------------------------

// A wrapper, not the bare global: browser fetch throws "Illegal invocation"
// when called as a method of another object.
const tronFetch: FetchLike = (url, init) => fetch(url, init);

export function tronNodeClient(chain: string): TronHttpClient {
  return new TronHttpClient(`https://${backends()[chain].node}`, tronFetch);
}

function tronApiBase(chain: string): string {
  return `https://${backends()[chain].api}`;
}

/** TRX balance in sun (`{}` from getaccount = not activated = 0). */
export async function fetchTronBalance(
  address: string,
  chain: string,
): Promise<string> {
  const account = await tronNodeClient(chain).getAccount(address);
  return (account?.balance ?? 0n).toString();
}

/**
 * TRC-20 `balanceOf` via triggerconstantcontract for the requested contracts
 * (whitelisted or imported). The token contract itself is the simulated
 * caller: it always exists, unlike a never-activated vault.
 */
export async function fetchTrc20Balances(
  address: string,
  chain: string,
  contracts: string[],
): Promise<tokenBalanceEVM[]> {
  const client = tronNodeClient(chain);
  const unique = [...new Set(contracts.filter((c) => T.isValidAddress(c)))];
  if (!unique.length) return [];
  let failures = 0;
  const results = await Promise.all(
    unique.map(async (token) => {
      try {
        const balance = await client.trc20BalanceOf(token, address, token);
        return { contract: token, balance: balance.toString() };
      } catch (error) {
        failures += 1;
        console.log('[TRON] balanceOf failed', token, error);
        return null;
      }
    }),
  );
  if (failures === unique.length) {
    throw new TronError('NETWORK', 'TRC-20 balances unavailable');
  }
  return results.filter((r): r is tokenBalanceEVM => r !== null);
}

/** Tip for confirmation counts: the latest solidified block (contract §6). */
export async function fetchTronTip(chain: string): Promise<number> {
  const block = await tronNodeClient(chain).getNowBlock({ solidified: true });
  return Number(block.number);
}

/**
 * USDT `isBlackListed(account)` (selector 0xe47d6060). Funds sent to a
 * blacklisted account freeze; a blacklisted vault cannot send USDT.
 */
export async function isTronUsdtBlacklisted(
  account: string,
  chain: string,
): Promise<boolean> {
  const usdt = tronNetwork(chain).usdt;
  if (!usdt) return false;
  const ret = await tronNodeClient(chain).call({
    owner: usdt,
    contract: usdt,
    data: T.encodeUsdtIsBlackListed(account),
  });
  return T.decodeBoolResult(ret);
}

/** Metadata of a TRC-20 for a custom import. Decimals are mandatory. */
export async function fetchTrc20Metadata(
  contract: string,
  chain: string,
): Promise<{ name: string | null; symbol: string | null; decimals: number }> {
  if (!T.isValidAddress(contract)) {
    throw new TronError('INVALID_ADDRESS', 'Invalid TRC-20 contract');
  }
  const client = tronNodeClient(chain);
  const read = (signature: string) =>
    client.call({
      owner: contract,
      contract,
      data: T.selector(signature),
    });
  const decimals = Number(T.decodeUint256Result(await read('decimals()')));
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new TronError('INVALID_TOKEN', 'Invalid TRC-20 decimals');
  }
  const text = async (signature: string): Promise<string | null> => {
    try {
      const value = T.decodeStringResult(await read(signature)).trim();
      return value ? value.slice(0, 64) : null;
    } catch {
      return null;
    }
  };
  return {
    name: await text('name()'),
    symbol: await text('symbol()'),
    decimals,
  };
}

/**
 * The nonce for a self-submitted op: the lowest free bit from word 2^20 up
 * (see TRON_SELF_PAY_NONCE_WORD). An undeployed vault has used no nonce.
 */
export async function pickTronSelfPayNonce(
  vault: string,
  chain: string,
): Promise<bigint> {
  const client = tronNodeClient(chain);
  const deployed = await client.hasCode(vault);
  for (let i = 0n; i < 16n; i++) {
    const word = TRON_SELF_PAY_NONCE_WORD + i;
    const bitmap = deployed ? await client.nonceBitmap(vault, word) : 0n;
    for (let bit = 0n; bit < 256n; bit++) {
      if (((bitmap >> bit) & 1n) === 0n) return (word << 8n) | bit;
    }
  }
  throw new TronError('NO_NONCE', 'No free self-pay nonce');
}

// ---------------------------------------------------------------------------
// Relay sponsor API (contract §4)
// ---------------------------------------------------------------------------

/**
 * Consumer quote request. The public route refuses `nonce` and `markup` and
 * sets the deadline itself (≤ now + 2 h), so they are never sent.
 */
export interface TronQuoteRequest {
  chain: string;
  signers: string[];
  threshold: number;
  calls: TronCallJson[];
  /** Echo a `feeOptions[].token` back to switch the fee token. */
  feeToken?: string;
  /**
   * Send-max: exactly one transfer of this token ('TRX' or the TRC-20
   * contract) carrying the full balance; the reply has `maxSendable`.
   */
  max?: { token: string };
}

export interface TronQuote {
  vault: string;
  deployed: boolean;
  nonce: string;
  deadline: string;
  fee: { token: string; amount: string; recipient: string };
  feeOptions: { token: string; amount: string }[];
  energy: { estimate: string };
  /**
   * False when SSP will not sponsor this Op (e.g. INSUFFICIENT_FEE_BALANCE…);
   * the TRX fee terms are still returned so the UI can explain what's missing.
   */
  sponsorAvailable: boolean;
  unavailableReason?: string;
  maxSendable?: { token: string; amount: string };
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function decString(v: unknown, what: string): string {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) {
    return String(v);
  }
  if (typeof v !== 'string' || !DECIMAL.test(v)) {
    throw new TronError('QUOTE_INVALID', `quote ${what} is not an integer`);
  }
  return v;
}

function addrString(v: unknown, what: string): string {
  if (typeof v !== 'string' || !T.isValidAddress(v)) {
    throw new TronError('QUOTE_INVALID', `quote ${what} is not an address`);
  }
  return v;
}

/** Strict shape check of the relay quote (never trusted beyond its shape). */
export function parseTronQuote(data: unknown): TronQuote {
  if (!isObj(data)) throw new TronError('QUOTE_INVALID', 'quote missing');
  const fee = data.fee;
  if (!isObj(fee)) throw new TronError('QUOTE_INVALID', 'quote fee missing');
  const options = Array.isArray(data.feeOptions) ? data.feeOptions : [];
  const energy = isObj(data.energy) ? data.energy : {};
  const quote: TronQuote = {
    vault: addrString(data.vault, 'vault'),
    deployed: data.deployed === true,
    nonce: decString(data.nonce, 'nonce'),
    deadline: decString(data.deadline, 'deadline'),
    fee: {
      token: addrString(fee.token, 'fee.token'),
      amount: decString(fee.amount, 'fee.amount'),
      recipient: addrString(fee.recipient, 'fee.recipient'),
    },
    feeOptions: options.filter(isObj).map((o) => ({
      token: addrString(o.token, 'feeOptions.token'),
      amount: decString(o.amount, 'feeOptions.amount'),
    })),
    energy: {
      estimate:
        energy.estimate === undefined
          ? '0'
          : decString(energy.estimate, 'energy.estimate'),
    },
    // Strict: only an explicit `true` means SSP sponsors this Op.
    sponsorAvailable: data.sponsorAvailable === true,
  };
  if (typeof data.unavailableReason === 'string' && data.unavailableReason) {
    quote.unavailableReason = data.unavailableReason.slice(0, 300);
  }
  if (isObj(data.maxSendable)) {
    quote.maxSendable = {
      token:
        typeof data.maxSendable.token === 'string'
          ? data.maxSendable.token
          : '',
      amount: decString(data.maxSendable.amount, 'maxSendable.amount'),
    };
  }
  return quote;
}

/** `POST /v1/tron/quote` (standard `{status, data}` envelope). */
export async function requestTronQuote(
  req: TronQuoteRequest,
): Promise<TronQuote> {
  const body: Record<string, unknown> = {
    chain: req.chain,
    signers: req.signers,
    threshold: req.threshold,
    calls: req.calls,
  };
  if (req.feeToken) body.feeToken = req.feeToken;
  if (req.max) body.max = { token: req.max.token };
  const refusal = (d: unknown): TronError =>
    new TronError(
      'QUOTE_FAILED',
      isObj(d) && typeof d.message === 'string'
        ? d.message
        : 'TRON quote refused',
    );
  let res;
  try {
    res = await axios.post<{ status?: string; data?: unknown }>(
      `https://${sspConfig().relay}/v1/tron/quote`,
      body,
    );
  } catch (error) {
    // A refusal may also arrive as an HTTP error carrying the envelope
    // ({status:'error', data:{code, name:'TronSponsorRefusal', message}}).
    const envelope = (error as { response?: { data?: { data?: unknown } } })
      ?.response?.data;
    if (envelope?.data) throw refusal(envelope.data);
    throw error;
  }
  if (res.data?.status !== 'success') {
    throw refusal(res.data?.data);
  }
  return parseTronQuote(res.data.data);
}

// ---------------------------------------------------------------------------
// Operations (contract §3)
// ---------------------------------------------------------------------------

/** One transfer: TRX (token '') or a TRC-20 contract. */
export function tronTransferCall(
  tokenContract: string,
  recipient: string,
  amount: bigint,
): T.Call {
  if (!tokenContract) return T.trxTransferCall(recipient, amount);
  return T.trc20TransferCall(tokenContract, recipient, amount);
}

/** Canonical Call JSON (the SDK's own wire form, via opToJson). */
export function tronCallsToJson(calls: readonly T.Call[]): TronCallJson[] {
  return [
    ...T.opToJson(T.buildOp({ calls, nonce: 0n, deadline: 0n, fee: T.noFee() }))
      .calls,
  ];
}

/** Consumer fee ceilings (contract §5.4) as SDK FeeCeiling entries. */
export function tronConsumerFeeCeilings(chain: string): T.FeeCeiling[] {
  const usdt = tronNetwork(chain).usdt;
  return [
    { token: T.TRX_FEE_TOKEN, max: TRON_CONSUMER_FEE_CEILING_TRX },
    ...(usdt ? [{ token: usdt, max: TRON_CONSUMER_FEE_CEILING_USDT }] : []),
  ];
}

/**
 * Enterprise fee ceilings for this signing device: min($maxTxFeeUSD worth,
 * 300 TRX) in TRX, $maxTxFeeUSD in USDT. An unknown TRX price leaves 300 TRX.
 */
export function tronEnterpriseFeeCeilings(
  chain: string,
  trxUsdPrice: number,
  maxTxFeeUSD: number = sspConfig().maxTxFeeUSD,
): T.FeeCeiling[] {
  let trxMax = TRON_ENTERPRISE_FEE_CAP_TRX;
  if (trxUsdPrice > 0 && Number.isFinite(trxUsdPrice)) {
    const usdLimit = BigInt(Math.floor((maxTxFeeUSD / trxUsdPrice) * 1e6));
    if (usdLimit < trxMax) trxMax = usdLimit;
  }
  const usdt = tronNetwork(chain).usdt;
  const usdtMax = BigInt(Math.floor(Math.max(0, maxTxFeeUSD) * 1e6));
  return [
    { token: T.TRX_FEE_TOKEN, max: trxMax },
    ...(usdt ? [{ token: usdt, max: usdtMax }] : []),
  ];
}

export function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/**
 * Build the sponsored consumer Op from a relay quote, refusing anything the
 * key would refuse (contract §5.3–§5.5): the quote must be for OUR vault, the
 * fee must go to the pinned collector in TRX or the network USDT under the
 * consumer ceiling, and the deadline must be live and at most 2 h ahead. The
 * resulting Op passes the SDK consumer-policy decoder before it is returned.
 */
export function buildSponsoredTronOp(p: {
  chain: string;
  vault: string;
  calls: readonly T.Call[];
  quote: TronQuote;
  now?: bigint;
  network?: T.NetworkConfig;
}): T.Op {
  const network = p.network ?? tronNetwork(p.chain);
  const now = p.now ?? nowSeconds();
  if (p.quote.vault !== p.vault) {
    throw new TronError('VAULT_MISMATCH', 'Quote is for a different vault');
  }
  if (!p.quote.sponsorAvailable) {
    throw new TronError(
      'SPONSOR_UNAVAILABLE',
      p.quote.unavailableReason ?? 'SSP cannot sponsor this operation',
    );
  }
  if (!network.feeCollector) {
    throw new TronError('NOT_LIVE', 'TRON fee collector is not pinned');
  }
  if (p.quote.fee.recipient !== network.feeCollector) {
    throw new TronError('QUOTE_INVALID', 'Quote fee recipient is not pinned');
  }
  const deadline = BigInt(p.quote.deadline);
  if (deadline <= now + 60n) {
    throw new TronError('QUOTE_EXPIRED', 'Quote expired');
  }
  if (deadline > now + TRON_CONSUMER_MAX_DEADLINE_SECONDS) {
    throw new TronError('QUOTE_INVALID', 'Quote deadline too far ahead');
  }
  const amount = BigInt(p.quote.fee.amount);
  const token = p.quote.fee.token;
  let fee: T.Fee;
  if (token === T.TRX_FEE_TOKEN) {
    if (amount > TRON_CONSUMER_FEE_CEILING_TRX) {
      throw new TronError('FEE_TOO_HIGH', 'Fee above the TRX ceiling');
    }
    fee = T.trxFee(amount, network.feeCollector);
  } else if (network.usdt && token === network.usdt) {
    if (amount > TRON_CONSUMER_FEE_CEILING_USDT) {
      throw new TronError('FEE_TOO_HIGH', 'Fee above the USDT ceiling');
    }
    fee = T.trc20Fee(token, amount, network.feeCollector);
  } else {
    throw new TronError('QUOTE_INVALID', 'Quote fee token not allowed');
  }
  const op = T.buildOp({
    calls: p.calls,
    nonce: BigInt(p.quote.nonce),
    deadline,
    fee,
  });
  T.decodeOpForDisplay(op, {
    policy: 'consumer',
    vault: p.vault,
    now,
    feeCollector: network.feeCollector,
    feeCeilings: [
      { token: T.TRX_FEE_TOKEN, max: TRON_CONSUMER_FEE_CEILING_TRX },
      ...(network.usdt
        ? [{ token: network.usdt, max: TRON_CONSUMER_FEE_CEILING_USDT }]
        : []),
    ],
  });
  return op;
}

/** A fee-free (self-submitted) consumer Op (contract §6, self-pay). */
export function buildSelfPayTronOp(p: {
  calls: readonly T.Call[];
  nonce: bigint;
  now?: bigint;
}): T.Op {
  const now = p.now ?? nowSeconds();
  return T.buildOp({
    calls: p.calls,
    nonce: p.nonce,
    deadline: now + TRON_CONSUMER_DEADLINE_SECONDS,
    fee: T.noFee(),
  });
}

/** The consumer `action:'tx'` payload (contract §3). Key order is fixed. */
export interface TronOpPayload {
  format: typeof TRON_OP_FORMAT;
  version: typeof TRON_OP_VERSION;
  network: TronNetworkName;
  vault: string;
  signers: string[];
  threshold: number;
  op: TronOpJson;
  walletSignature: string;
}

/**
 * Sign `opDigest(chainId, vault, op)` with the wallet leaf and wrap it in the
 * `ssp-tron-op` v1 payload. The wallet's own signer must be in the config.
 */
export function signConsumerTronOp(p: {
  chain: string;
  config: T.VaultConfig;
  vault: string;
  op: T.Op;
  privKeyHex: string;
  network?: T.NetworkConfig;
}): { payload: string; digest: string; walletSignature: string } {
  const network = p.network ?? tronNetwork(p.chain);
  const digest = T.opDigest(network.chainId, p.vault, p.op);
  const signature = signTronDigest(p.privKeyHex, digest);
  const signer = T.recoverSigner(digest, signature);
  if (!p.config.signers.includes(signer)) {
    throw new TronError('NOT_MEMBER', 'Wallet key is not a vault signer');
  }
  const payload: TronOpPayload = {
    format: TRON_OP_FORMAT,
    version: TRON_OP_VERSION,
    network: tronNetworkName(p.chain),
    vault: p.vault,
    signers: [...p.config.signers],
    threshold: p.config.threshold,
    op: T.opToJson(p.op),
    walletSignature: T.to0x(signature),
  };
  return {
    payload: JSON.stringify(payload),
    digest: T.to0x(digest),
    walletSignature: payload.walletSignature,
  };
}

/** Whether an action payload is the TRON op JSON (never hex). */
export function isTronOpPayload(payload: string): boolean {
  try {
    const parsed: unknown = JSON.parse(payload);
    return isObj(parsed) && parsed.format === TRON_OP_FORMAT;
  } catch {
    return false;
  }
}

/**
 * Strictly parse a consumer `ssp-tron-op` payload: format/version, the network
 * of this chain, a valid config and canonical Op JSON.
 */
export function parseTronOpPayload(
  payload: string,
  chain: string,
): {
  vault: string;
  config: T.VaultConfig;
  op: T.Op;
  walletSignature: string;
} {
  const parsed: unknown = JSON.parse(payload);
  if (!isObj(parsed)) throw new TronError('PAYLOAD', 'Invalid TRON payload');
  if (parsed.format !== TRON_OP_FORMAT || parsed.version !== TRON_OP_VERSION) {
    throw new TronError('PAYLOAD', 'Unsupported TRON payload format');
  }
  if (parsed.network !== tronNetworkName(chain)) {
    throw new TronError('PAYLOAD', 'TRON payload network mismatch');
  }
  if (typeof parsed.vault !== 'string' || !T.isValidAddress(parsed.vault)) {
    throw new TronError('PAYLOAD', 'Invalid TRON vault');
  }
  const signers = parsed.signers;
  if (!Array.isArray(signers) || !signers.every((s) => typeof s === 'string')) {
    throw new TronError('PAYLOAD', 'Invalid TRON signers');
  }
  const config = T.validateConfig({
    signers,
    threshold: Number(parsed.threshold),
  });
  return {
    vault: parsed.vault,
    config,
    op: T.opFromJson(parsed.op),
    walletSignature:
      typeof parsed.walletSignature === 'string' ? parsed.walletSignature : '',
  };
}

export interface TronDescribedCall {
  kind: 'trx' | 'trc20' | 'trc10' | 'other';
  to: string;
  /** base units of the asset */
  amount: string;
  tokenContract?: string;
  symbol: string;
  decimals: number;
}

/**
 * Display-only description of an Op's calls and fee (no policy): TRX, exact
 * TRC-20 `transfer`, TRC-10, anything else as 'other'. Used for this wallet's
 * own pending requests; signing paths use decodeOpForDisplay.
 */
export function describeTronOp(
  op: T.Op,
  chain: string,
  importedTokens: Token[] = [],
): {
  calls: TronDescribedCall[];
  fee: string;
  feeSymbol: string;
  feeDecimals: number;
} {
  const native = blockchains[chain];
  const calls: TronDescribedCall[] = op.calls.map((c) => {
    if (c.tokenValue > 0n) {
      return {
        kind: 'trc10',
        to: c.to,
        amount: c.tokenValue.toString(),
        symbol: `TRC10-${c.tokenId.toString()}`,
        decimals: 0,
      };
    }
    if (c.data.length === 0) {
      return {
        kind: 'trx',
        to: c.to,
        amount: c.value.toString(),
        symbol: native.symbol,
        decimals: native.decimals,
      };
    }
    const transfer = c.value === 0n ? T.decodeTrc20Transfer(c.data) : null;
    if (transfer) {
      const token = tokenByContract(chain, c.to, importedTokens);
      return {
        kind: 'trc20',
        to: transfer.to,
        amount: transfer.amount.toString(),
        tokenContract: c.to,
        symbol: token?.symbol ?? c.to,
        decimals: token?.decimals ?? 0,
      };
    }
    return {
      kind: 'other',
      to: c.to,
      amount: c.value.toString(),
      symbol: native.symbol,
      decimals: native.decimals,
    };
  });
  const feeToken =
    op.fee.token === T.TRX_FEE_TOKEN
      ? null
      : tokenByContract(chain, op.fee.token, importedTokens);
  return {
    calls,
    fee: op.fee.amount.toString(),
    feeSymbol: feeToken ? feeToken.symbol : native.symbol,
    feeDecimals: feeToken ? feeToken.decimals : native.decimals,
  };
}

/** Human units (string) of base units, exact. */
export function tronUnits(base: string | bigint, decimals: number): string {
  const raw = typeof base === 'bigint' ? base : BigInt(base);
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = abs % divisor;
  let out = whole.toString();
  if (frac > 0n) {
    out += '.' + frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  }
  return negative ? `-${out}` : out;
}

/**
 * decodeTransactionForApproval for a pending `ssp-tron-op` action (the
 * wallet's own request): sender = vault, first transfer as the receiver.
 */
export function describeTronPayloadForApproval(
  payload: string,
  chain: string,
  importedTokens: Token[] = [],
): {
  sender: string;
  receiver: string;
  amount: string;
  fee: string;
  token: string;
  tokenSymbol: string;
  decimals: number;
} {
  const parsed = parseTronOpPayload(payload, chain);
  const d = describeTronOp(parsed.op, chain, importedTokens);
  const first = d.calls[0];
  return {
    sender: parsed.vault,
    receiver: first?.to ?? '',
    amount: first ? tronUnits(first.amount, first.decimals) : '0',
    fee: tronUnits(d.fee, d.feeDecimals),
    token: first?.tokenContract ?? '',
    tokenSymbol: first?.symbol ?? blockchains[chain].symbol,
    decimals: first?.decimals ?? blockchains[chain].decimals,
  };
}

// ---------------------------------------------------------------------------
// Enterprise proposals (contract §3, §5)
// ---------------------------------------------------------------------------

export interface TronEnterpriseProposal {
  network: T.NetworkConfig;
  vault: string;
  config: T.VaultConfig;
  op: T.Op;
  digest: Uint8Array;
  digestHex: string;
  display: T.OpDisplay;
  decoded: VaultDecodedTx;
}

function normalizeDigestHex(hex: string): string {
  const h = hex.trim().toLowerCase();
  return h.startsWith('0x') ? h : `0x${h}`;
}

function selfCallLabel(call: T.DisplayCall): string {
  if (call.kind !== 'selfCall') return '';
  switch (call.action) {
    case 'invalidateNonces':
      return `invalidateNonces(word ${call.word.toString()}, mask 0x${call.mask.toString(16)})`;
    case 'freezeBalanceV2':
    case 'unfreezeBalanceV2':
      return `${call.action}(${tronUnits(call.amount, 6)} TRX, ${call.resource})`;
    case 'delegateResource':
    case 'undelegateResource':
      return `${call.action}(${call.receiver}, ${tronUnits(call.amount, 6)} TRX, ${call.resource})`;
    case 'voteWitnesses':
      return `voteWitnesses(${call.votes.map((v) => `${v.witness}: ${v.count.toString()}`).join(', ')})`;
    default:
      return `${call.action}()`;
  }
}

/**
 * Verify an enterprise TRON proposal on this device before anything is shown
 * as signable (contract §5 rules 1–5):
 *  - `tronOp` is `{network, vault, signers, threshold, op}` for THIS chain;
 *  - `vault == predictVaultAddress(configHash(signers, threshold))`;
 *  - `opDigest(chainId, vault, op)` equals `rawUnsignedTx` (never sign an
 *    opaque hash);
 *  - the Op passes the SDK enterprise display policy (transfers + self-calls;
 *    approve / unknown refused until the org policy reaches the device), the
 *    fee goes to the pinned collector under the device ceiling, the deadline is
 *    live and within the proposal window;
 *  - the proposal's recipients (display metadata) equal the Op's transfers.
 * The caller additionally requires its own leaf to be in `signers` before
 * signing (the leaf needs the seed, so it is checked at sign time).
 */
export function verifyTronEnterpriseProposal(p: {
  chain: string;
  tronOp: string;
  /** The proposal digest. Omitted only by display-only decoders. */
  rawUnsignedTx?: string;
  sourceAddress?: string;
  recipients?: { address: string; amount: string }[];
  feeCeilings: T.FeeCeiling[];
  importedTokens?: Token[];
  now?: bigint;
  network?: T.NetworkConfig;
}): TronEnterpriseProposal {
  const network = p.network ?? tronNetwork(p.chain);
  let parsed: unknown;
  try {
    parsed = JSON.parse(p.tronOp);
  } catch {
    throw new TronError('TRON_OP_INVALID', 'tronOp is not JSON');
  }
  if (!isObj(parsed)) {
    throw new TronError('TRON_OP_INVALID', 'tronOp is not an object');
  }
  if (parsed.network !== tronNetworkName(p.chain)) {
    throw new TronError('NETWORK_MISMATCH', 'tronOp network mismatch');
  }
  if (typeof parsed.vault !== 'string' || !T.isValidAddress(parsed.vault)) {
    throw new TronError('TRON_OP_INVALID', 'tronOp vault is invalid');
  }
  const signers = parsed.signers;
  if (!Array.isArray(signers) || !signers.every((s) => typeof s === 'string')) {
    throw new TronError('TRON_OP_INVALID', 'tronOp signers are invalid');
  }
  if (typeof parsed.threshold !== 'number') {
    throw new TronError('TRON_OP_INVALID', 'tronOp threshold is invalid');
  }
  const config = T.validateConfig({
    signers,
    threshold: parsed.threshold,
  });
  const derived = T.deriveVault(network, config);
  if (derived.address !== parsed.vault) {
    throw new TronError(
      'VAULT_MISMATCH',
      'tronOp vault does not match its signers and threshold',
    );
  }
  const vault = derived.address;
  if (p.sourceAddress && p.sourceAddress !== vault) {
    throw new TronError(
      'VAULT_MISMATCH',
      'Proposal source address does not match the vault',
    );
  }
  const op = T.opFromJson(parsed.op);
  const digest = T.opDigest(network.chainId, vault, op);
  const digestHex = T.to0x(digest);
  if (
    p.rawUnsignedTx !== undefined &&
    normalizeDigestHex(p.rawUnsignedTx) !== digestHex
  ) {
    throw new TronError(
      'DIGEST_MISMATCH',
      'rawUnsignedTx is not the digest of the displayed operation',
    );
  }
  const tokens = tronTokenInfos(p.chain, p.importedTokens);
  const display = T.decodeOpForDisplay(op, {
    policy: 'enterprise',
    vault,
    now: p.now ?? nowSeconds(),
    maxDeadlineSeconds: TRON_ENTERPRISE_MAX_DEADLINE_SECONDS,
    feeCollector: network.feeCollector,
    feeCeilings: p.feeCeilings,
    tokens,
    allowApprove: false,
    allowUnknown: false,
    allowSelfCalls: true,
  });

  const native = blockchains[p.chain];
  const recipients: VaultDecodedRecipient[] = [];
  for (const c of display.calls) {
    if (c.kind === 'trxTransfer') {
      recipients.push({
        address: c.to,
        amount: c.amount.toString(),
        symbol: native.symbol,
        decimals: native.decimals,
      });
    } else if (c.kind === 'trc20Transfer') {
      recipients.push({
        address: c.to,
        amount: c.amount.toString(),
        symbol: c.symbol ?? c.token,
        decimals: c.decimals ?? 0,
        tokenContract: c.token,
      });
    } else if (c.kind === 'trc10Transfer') {
      recipients.push({
        address: c.to,
        amount: c.amount.toString(),
        symbol: `TRC10-${c.tokenId.toString()}`,
        decimals: 0,
      });
    } else if (c.kind === 'selfCall') {
      recipients.push({
        address: vault,
        amount: '0',
        symbol: native.symbol,
        decimals: native.decimals,
        label: selfCallLabel(c),
      });
    }
  }

  // The proposal's recipient list is display metadata; the Op is what gets
  // signed. They must agree exactly (address case-sensitive, base units).
  const transfers = recipients.filter((r) => !r.label);
  if (p.recipients && p.recipients.length > 0) {
    const same =
      p.recipients.length === transfers.length &&
      p.recipients.every((r, i) => {
        const t = transfers[i];
        let amount: bigint | null = null;
        try {
          amount = BigInt(r.amount);
        } catch {
          amount = null;
        }
        return (
          r.address === t.address &&
          amount !== null &&
          amount.toString() === t.amount
        );
      });
    if (!same) {
      throw new TronError(
        'RECIPIENTS_MISMATCH',
        'Proposal recipients do not match the operation',
      );
    }
  } else if (transfers.length > 0) {
    throw new TronError(
      'RECIPIENTS_MISMATCH',
      'Proposal lists no recipients but the operation transfers funds',
    );
  }

  let fee = '0';
  let feeSymbol = native.symbol;
  let feeDecimals = native.decimals;
  if (display.fee.kind === 'trx') {
    fee = display.fee.amount.toString();
  } else if (display.fee.kind === 'trc20') {
    fee = display.fee.amount.toString();
    feeSymbol = display.fee.symbol ?? display.fee.token;
    feeDecimals = display.fee.decimals ?? 0;
  }
  const first = transfers[0];
  const decoded: VaultDecodedTx = {
    sender: vault,
    recipients,
    fee,
    feeSymbol,
    feeDecimals,
    ...(first?.tokenContract
      ? {
          tokenContract: first.tokenContract,
          tokenSymbol: first.symbol,
          tokenDecimals: first.decimals,
        }
      : {}),
  };
  return {
    network,
    vault,
    config,
    op,
    digest,
    digestHex,
    display,
    decoded,
  };
}

/** Enterprise response check: a co-signer's 65-byte signature over digest. */
export function tronSignatureSigner(
  digest: Uint8Array,
  signatureHex: string,
): string | null {
  try {
    return T.recoverSigner(digest, T.hexToBytes(signatureHex));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// History (contract §6 table, §5.8 poisoning defences)
// ---------------------------------------------------------------------------

export interface TronGridEvent {
  transaction_id?: string;
  block_number?: number | string;
  block_timestamp?: number | string;
  event_name?: string;
  result?: Record<string, unknown>;
}

export interface TronGridTrc20 {
  transaction_id?: string;
  token_info?: {
    symbol?: string;
    address?: string;
    decimals?: number | string;
    name?: string;
  };
  block_timestamp?: number | string;
  from?: string;
  to?: string;
  type?: string;
  value?: string | number;
}

export interface TronGridInternal {
  tx_id?: string;
  transaction_id?: string;
  hash?: string;
  internal_tx_id?: string;
  block_timestamp?: number | string;
  from_address?: string;
  to_address?: string;
  data?: {
    rejected?: boolean;
    call_value?: Record<string, number | string>;
  };
  rejected?: boolean;
  call_value?: Record<string, number | string> | number | string;
}

export interface TronGridTransaction {
  txID?: string;
  blockNumber?: number | string;
  block_timestamp?: number | string;
  raw_data?: {
    contract?: {
      type?: string;
      parameter?: {
        value?: {
          amount?: number | string;
          owner_address?: string;
          to_address?: string;
        };
      };
    }[];
  };
  ret?: { contractRet?: string }[];
}

function toAddress(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  try {
    return T.parseAddress(v);
  } catch {
    return null;
  }
}

function toBig(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isSafeInteger(v)) return BigInt(v);
  if (typeof v === 'string' && /^-?[0-9]+$/.test(v)) return BigInt(v);
  return null;
}

function toNum(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function internalValue(row: TronGridInternal): bigint {
  const cv = row.data?.call_value ?? row.call_value;
  if (cv && typeof cv === 'object') {
    return toBig((cv as Record<string, unknown>)._) ?? 0n;
  }
  return toBig(cv) ?? 0n;
}

function internalTxid(row: TronGridInternal): string {
  return row.tx_id ?? row.transaction_id ?? row.hash ?? '';
}

interface FeePaid {
  token: string;
  recipient: string;
  amount: bigint;
  consumed: boolean;
}

/**
 * Merge the four TronGrid sources into history rows for `vault`, newest
 * first. Pure (no I/O) so the poisoning rules are unit-tested:
 *  - outgoing rows exist only for transactions carrying the vault's own
 *    `Executed` event; any "from = vault" TRC-20 or TRX move without one is
 *    spoofed and hidden (the zero-value transferFrom poisoning trick);
 *  - the transfer matching the vault's `FeePaid` event becomes the row fee;
 *  - zero-value rows are dropped; incoming TRX below 0.1 TRX and whitelisted
 *    stablecoins below 0.01 are dust and dropped;
 *  - incoming TRC-20 rows are shown only for whitelisted or imported tokens.
 * Every source is queried with only_confirmed, so every row is solidified
 * (blockheight is 1 when the source carries no block number).
 */
export function buildTronHistory(p: {
  vault: string;
  chain: string;
  events: TronGridEvent[];
  trc20: TronGridTrc20[];
  internal: TronGridInternal[];
  transfers: TronGridTransaction[];
  importedTokens?: Token[];
}): transaction[] {
  const { vault, chain } = p;
  const native = blockchains[chain];
  const executed = new Map<string, { block: number; timestamp: number }>();
  const feePaid = new Map<string, FeePaid>();
  for (const ev of p.events) {
    const txid = ev.transaction_id;
    if (!txid) continue;
    if (ev.event_name === 'Executed') {
      executed.set(txid, {
        block: toNum(ev.block_number),
        timestamp: toNum(ev.block_timestamp),
      });
    } else if (ev.event_name === 'FeePaid') {
      const token = toAddress(ev.result?.token);
      const recipient = toAddress(ev.result?.recipient);
      const amount = toBig(ev.result?.amount);
      if (token && recipient && amount !== null && amount > 0n) {
        feePaid.set(txid, { token, recipient, amount, consumed: false });
      }
    }
  }

  const rows: transaction[] = [];
  const fees = new Map<
    string,
    { amount: bigint; symbol: string; decimals: number }
  >();
  const takeFee = (
    txid: string,
    token: string,
    recipient: string,
    amount: bigint,
  ): boolean => {
    const f = feePaid.get(txid);
    if (
      !f ||
      f.consumed ||
      f.token !== token ||
      f.recipient !== recipient ||
      f.amount !== amount
    ) {
      return false;
    }
    f.consumed = true;
    if (token === T.TRX_FEE_TOKEN) {
      fees.set(txid, {
        amount,
        symbol: native.symbol,
        decimals: native.decimals,
      });
    } else {
      const tk = tokenByContract(chain, token, p.importedTokens);
      fees.set(txid, {
        amount,
        symbol: tk?.symbol ?? token,
        decimals: tk?.decimals ?? 0,
      });
    }
    return true;
  };

  // TRC-20 transfers (both directions).
  for (const r of p.trc20) {
    const txid = r.transaction_id;
    const from = toAddress(r.from);
    const to = toAddress(r.to);
    const token = toAddress(r.token_info?.address);
    const value = toBig(r.value);
    if (!txid || !from || !to || !token || value === null || value <= 0n) {
      continue; // zero-value (poisoning) or malformed
    }
    const known = tokenByContract(chain, token, p.importedTokens);
    const decimals = known?.decimals ?? toNum(r.token_info?.decimals);
    const symbol = known?.symbol ?? r.token_info?.symbol ?? token;
    const timestamp = toNum(r.block_timestamp);
    if (from === vault) {
      const ex = executed.get(txid);
      if (!ex) continue; // spoofed: no Executed event of this vault
      if (takeFee(txid, token, to, value)) continue;
      rows.push({
        txid,
        blockheight: ex.block || 1,
        timestamp: timestamp || ex.timestamp,
        fee: '0',
        amount: (-value).toString(),
        message: '',
        receiver: to,
        type: 'token',
        decimals,
        tokenSymbol: symbol,
        contractAddress: token,
      });
    } else if (to === vault) {
      if (!known) continue; // not whitelisted and not imported
      if (
        TRON_STABLE_SYMBOLS.has(known.symbol) &&
        value < 10n ** BigInt(Math.max(0, known.decimals - 2))
      ) {
        continue; // stablecoin dust
      }
      rows.push({
        txid,
        blockheight: 1,
        timestamp,
        fee: '0',
        amount: value.toString(),
        message: '',
        receiver: vault,
        type: 'token',
        decimals: known.decimals,
        tokenSymbol: known.symbol,
        contractAddress: token,
      });
    }
  }

  // Internal TRX (contract-originated) in both directions.
  for (const r of p.internal) {
    const txid = internalTxid(r);
    const from = toAddress(r.from_address);
    const to = toAddress(r.to_address);
    const rejected = r.data?.rejected === true || r.rejected === true;
    const value = internalValue(r);
    if (!txid || !from || !to || rejected || value <= 0n) continue;
    const timestamp = toNum(r.block_timestamp);
    if (from === vault) {
      const ex = executed.get(txid);
      if (!ex) continue;
      if (takeFee(txid, T.TRX_FEE_TOKEN, to, value)) continue;
      rows.push({
        txid,
        blockheight: ex.block || 1,
        timestamp: timestamp || ex.timestamp,
        fee: '0',
        amount: (-value).toString(),
        message: '',
        receiver: to,
        type: 'tron',
        decimals: native.decimals,
      });
    } else if (to === vault) {
      if (value < TRON_TRX_DUST_SUN) continue;
      rows.push({
        txid,
        blockheight: 1,
        timestamp,
        fee: '0',
        amount: value.toString(),
        message: '',
        receiver: vault,
        type: 'tron',
        decimals: native.decimals,
      });
    }
  }

  // Direct TransferContract (TRX sent by an account to the vault).
  for (const r of p.transfers) {
    const c = r.raw_data?.contract?.[0];
    if (!r.txID || c?.type !== 'TransferContract') continue;
    if (r.ret?.[0]?.contractRet && r.ret[0].contractRet !== 'SUCCESS') continue;
    const to = toAddress(c.parameter?.value?.to_address);
    const value = toBig(c.parameter?.value?.amount);
    if (to !== vault || value === null || value < TRON_TRX_DUST_SUN) continue;
    rows.push({
      txid: r.txID,
      blockheight: toNum(r.blockNumber) || 1,
      timestamp: toNum(r.block_timestamp),
      fee: '0',
      amount: value.toString(),
      message: '',
      receiver: vault,
      type: 'tron',
      decimals: native.decimals,
    });
  }

  // Executed ops that moved nothing we display (cancellations, self-calls)
  // still cost their fee: show them as a zero-amount send with that fee.
  for (const [txid, f] of feePaid) {
    if (!f.consumed && executed.has(txid)) {
      // FeePaid whose transfer row TronGrid has not indexed: take it anyway.
      takeFee(txid, f.token, f.recipient, f.amount);
    }
  }
  for (const [txid, ex] of executed) {
    if (!fees.has(txid)) continue;
    if (rows.some((r) => r.txid === txid)) continue;
    rows.push({
      txid,
      blockheight: ex.block || 1,
      timestamp: ex.timestamp,
      fee: '0',
      amount: '0',
      message: '',
      receiver: vault,
      type: 'tron',
      decimals: native.decimals,
    });
  }

  // Fee once per Op: on its first row.
  const feeAttached = new Set<string>();
  for (const row of rows) {
    const f = fees.get(row.txid);
    if (!f || feeAttached.has(row.txid)) continue;
    feeAttached.add(row.txid);
    row.fee = f.amount.toString();
    if (f.symbol !== native.symbol) {
      row.feeSymbol = f.symbol;
      row.feeDecimals = f.decimals;
    }
  }

  return rows.sort((a, b) => b.timestamp - a.timestamp);
}

async function tronGridList<R>(
  chain: string,
  path: string,
  params: Record<string, string | number | boolean>,
): Promise<R[]> {
  try {
    const res = await axios.get<{ data?: unknown }>(
      `${tronApiBase(chain)}${path}`,
      { params },
    );
    return Array.isArray(res.data?.data) ? (res.data.data as R[]) : [];
  } catch (error) {
    // A never-used vault address can 404 on some TronGrid routes.
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    if (status === 404) return [];
    throw error;
  }
}

/**
 * History rows [from, to) for a vault, newest first, from TronGrid v1 (via
 * api-tron.sspwallet.io). TronGrid pages by cursor, so each source serves at
 * most TRON_HISTORY_MAX rows and the merged list is sliced.
 */
export async function fetchTronTransactions(
  address: string,
  chain: string,
  from = 0,
  to = 50,
): Promise<transaction[]> {
  if (from >= TRON_HISTORY_MAX) return [];
  const limit = Math.max(1, Math.min(TRON_HISTORY_MAX, to));
  const confirmed = { only_confirmed: true, limit };
  const [events, trc20, internal, transfers, imported] = await Promise.all([
    tronGridList<TronGridEvent>(chain, `/v1/contracts/${address}/events`, {
      ...confirmed,
      order_by: 'block_timestamp,desc',
    }),
    tronGridList<TronGridTrc20>(
      chain,
      `/v1/accounts/${address}/transactions/trc20`,
      confirmed,
    ),
    tronGridList<TronGridInternal>(
      chain,
      `/v1/accounts/${address}/internal-transactions`,
      confirmed,
    ),
    tronGridList<TronGridTransaction>(
      chain,
      `/v1/accounts/${address}/transactions`,
      { ...confirmed, only_to: true, search_internal: false },
    ),
    localForage
      .getItem<Token[]>(`imported-tokens-${chain}`)
      .then((v) => v ?? [])
      .catch(() => [] as Token[]),
  ]);
  const rows = buildTronHistory({
    vault: address,
    chain,
    events,
    trc20,
    internal,
    transfers,
    importedTokens: imported,
  });
  return rows.slice(from, to);
}

/** The account (leaf) the key self-submits from, with its TRX balance. */
export async function fetchTronKeyAccount(
  xpubKey: string,
  typeIndex: number,
  addressIndex: number,
  chain: string,
): Promise<{ address: string; balance: string }> {
  const address = tronLeafAddress(xpubKey, typeIndex, addressIndex, chain);
  return { address, balance: await fetchTronBalance(address, chain) };
}

export { T as tronMultisig };
