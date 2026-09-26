/**
 * Kaspa (chainType 'kas') on @runonflux/kaspa-core.
 *
 * Implements ~/repos/KASPA_SSP_CONTRACT.md. Every derivation, payload shape
 * and signing guard here must stay byte-for-byte in step with SSP Key, the
 * relay and the enterprise backend — never diverge from the contract.
 *
 * Keys (contract §2): the normal BIP-48 account xpub m/48'/111111'/{account}'/0'
 * (standard xpub/xprv version bytes), leaf = xpub/a/b, x-only key =
 * xOnlyFromCompressed(leaf). Consumer 2-of-2: a = typeIndex, b = addressIndex.
 * Enterprise M-of-N: a = vaultIndex, b = addressIndex. The library sorts the
 * keys of a multisig spend — never pre-sort differently.
 *
 * Payloads (contract §3): every field that carries a Bitcoin-family hex
 * transaction carries, for Kaspa, JSON.stringify(createSigningBundle(...)).
 *
 * Signing (contract §4): bundles from another party are opened only with this
 * wallet's own REST UTXO lookup (trustedUtxos), only the vault's own scripts
 * are signed (onlyScripts), and a persistent signed-amount ledger is passed to
 * every signTransaction.
 */
import * as K from '@runonflux/kaspa-core';
import {
  createRestClient,
  pickFeeRate,
  utxosToInputPlans,
} from '@runonflux/kaspa-core/rest';
import type {
  FeeTier,
  KaspaRestClient,
  KaspaUtxo,
  RestTransaction,
} from '@runonflux/kaspa-core/rest';
import { HDKey } from '@scure/bip32';
import localForage from 'localforage';
import { blockchains } from '@storage/blockchains';
import { backends } from '@storage/backends';
import type { transaction } from '../types';

export type KasSpend = K.Spend;
export type KasSigningBundle = K.SigningBundle;
export type KasFeeTier = FeeTier;
export type KasDescribeWarning = K.DescribeWarning;

/** The address prefix of a Kaspa chain ('kaspa'). */
export function kasPrefix(chain: string): K.NetworkPrefix {
  return blockchains[chain].libid as K.NetworkPrefix;
}

export function isKasChain(chain: string): boolean {
  return blockchains[chain]?.chainType === 'kas';
}

// ---------------------------------------------------------------------------
// Keys, scripts and addresses
// ---------------------------------------------------------------------------

/** Compressed (33-byte) public key at xpub/a/b. */
function leafPublicKey(
  xpub: string,
  a: number,
  b: number,
  chain: string,
): Uint8Array {
  const node = HDKey.fromExtendedKey(xpub, blockchains[chain].bip32)
    .deriveChild(a)
    .deriveChild(b);
  if (!node.publicKey) throw new Error('Kaspa key derivation failed');
  return node.publicKey;
}

/** x-only (32-byte) public key at xpub/a/b. */
export function kasLeafXOnlyKey(
  xpub: string,
  a: number,
  b: number,
  chain: string,
): Uint8Array {
  return K.xOnlyFromCompressed(leafPublicKey(xpub, a, b, chain));
}

/**
 * M-of-N vault spend over the x-only keys of `xpubs` at leaf a/b. The library
 * sorts the keys, so the xpub order does not matter. Contract §2: consumer
 * 2-of-2 is (wallet, key) with m = 2; enterprise vaults pass every signer's
 * xpubs (2N in dual mode, m = 2 × requiredSigners).
 */
export function kasMultisigSpend(
  xpubs: readonly string[],
  m: number,
  a: number,
  b: number,
  chain: string,
): KasSpend {
  return K.multisigSpend(
    xpubs.map((x) => kasLeafXOnlyKey(x, a, b, chain)),
    m,
  );
}

/** The consumer 2-of-2 vault spend (wallet + SSP Key) at a leaf. */
export function kasVaultSpend(
  xpubWallet: string,
  xpubKey: string,
  typeIndex: number,
  addressIndex: number,
  chain: string,
): KasSpend {
  return kasMultisigSpend(
    [xpubWallet, xpubKey],
    2,
    typeIndex,
    addressIndex,
    chain,
  );
}

/** The kaspa:p… address a spend locks to. */
export function kasSpendAddress(spend: KasSpend, chain: string): string {
  const address = K.scriptPublicKeyToAddress(
    K.spendScriptPublicKey(spend),
    kasPrefix(chain),
  );
  if (!address) throw new Error('Kaspa address encoding failed');
  return address;
}

/** Address + redeem script (hex) of a multisig spend. */
export function kasSpendToMultisig(
  spend: KasSpend,
  chain: string,
): { address: string; redeemScript: string } {
  if (spend.kind !== 'p2sh-multisig') {
    throw new Error('Kaspa vault spend must be P2SH multisig');
  }
  return {
    address: kasSpendAddress(spend, chain),
    redeemScript: K.bytesToHex(spend.redeem),
  };
}

/**
 * Rebuild a vault spend from its redeem script (hex), refusing anything that
 * is not a canonical Schnorr M-of-N multisig script.
 */
export function kasSpendFromRedeemScript(redeemHex: string): KasSpend {
  if (typeof redeemHex !== 'string' || !/^([0-9a-f]{2})+$/i.test(redeemHex)) {
    throw new Error('Invalid Kaspa redeem script');
  }
  const redeem = K.hexToBytes(redeemHex.toLowerCase());
  const parsed = K.parseMultisigRedeemScript(redeem);
  if (!parsed || parsed.ecdsa) {
    throw new Error('Kaspa redeem script is not a Schnorr multisig script');
  }
  const spend: KasSpend = {
    kind: 'p2sh-multisig',
    redeem,
    pubkeys: parsed.pubkeys,
    m: parsed.m,
  };
  K.validateSpend(spend);
  return spend;
}

/** Vault address (kaspa:p…) and its redeem script (hex). No witness script. */
export function generateMultisigAddressKAS(
  xpubWallet: string,
  xpubKey: string,
  typeIndex: number,
  addressIndex: number,
  chain: string,
): { address: string; redeemScript: string } {
  return kasSpendToMultisig(
    kasVaultSpend(xpubWallet, xpubKey, typeIndex, addressIndex, chain),
    chain,
  );
}

/**
 * The wallet's own signing key at a leaf: raw 32-byte private key (hex) and
 * x-only public key (hex).
 */
export function generateAddressKeypairKAS(
  xpriv: string,
  a: number,
  b: number,
  chain: string,
): { privKey: string; pubKey: string } {
  const node = HDKey.fromExtendedKey(xpriv, blockchains[chain].bip32)
    .deriveChild(a)
    .deriveChild(b);
  if (!node.privateKey) throw new Error('Kaspa private key derivation failed');
  const privKey = K.bytesToHex(node.privateKey);
  const pubKey = K.bytesToHex(K.xOnlyPublicKey(node.privateKey));
  node.wipePrivateData();
  return { privKey, pubKey };
}

/** kaspa-core validation (checksum, prefix, version) — never a hand regex. */
export function isValidKasAddress(address: string, chain: string): boolean {
  try {
    K.addressToScriptPublicKey(address, kasPrefix(chain));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Network (kaspa-rest-server)
// ---------------------------------------------------------------------------

export function kasRestClient(chain: string): KaspaRestClient {
  return createRestClient({
    baseUrl: `https://${backends()[chain].node}`,
    prefix: kasPrefix(chain),
    // Pass a wrapper, not the bare global: the client stores the function and
    // calls it as a method (this.fetchFn(...)), and browser fetch throws
    // "Illegal invocation" unless invoked with the global as `this`. (The
    // production LavaMoat runtime does not remove fetch from globalThis.)
    fetch: (url, init) => fetch(url, init),
  });
}

export async function fetchKasBalance(
  address: string,
  chain: string,
): Promise<string> {
  const balance = await kasRestClient(chain).getBalance(address);
  return balance.toString();
}

/** Tip for confirmation counts: the virtual chain blue score. */
export async function fetchKasTip(chain: string): Promise<number> {
  return Number(await kasRestClient(chain).getVirtualChainBlueScore());
}

export async function fetchKasUtxos(
  address: string,
  chain: string,
): Promise<KaspaUtxo[]> {
  return kasRestClient(chain).getUtxos([address]);
}

/** Σ of the UTXO amounts (sompi) — the spendable balance for a send. */
export function sumKasUtxos(utxos: readonly KaspaUtxo[]): bigint {
  return utxos.reduce((a, u) => a + u.entry.amount, 0n);
}

function toSompi(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)
    return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return 0n;
}

/** Every input's previous outpoint carries its address and amount. */
function kasInputsResolved(t: RestTransaction): boolean {
  return (t.inputs ?? []).every(
    (i) =>
      typeof i.previous_outpoint_address === 'string' &&
      i.previous_outpoint_address !== '' &&
      i.previous_outpoint_amount !== null &&
      i.previous_outpoint_amount !== undefined,
  );
}

/**
 * Map a kaspa-rest-server transaction (with resolved previous outpoints) to
 * the wallet's row shape, from the point of view of `address`. Same sign
 * convention as the blockbook parser: received = positive amount landed here;
 * sent = negative amount that left, excluding the fee. `blockheight` is the
 * accepting block's blue score (0 until accepted); the tip is the virtual
 * chain blue score (fetchKasTip).
 *
 * A row whose previous outpoints the indexer did not resolve cannot be
 * classified (an unresolved input may be ours, making it a send): it is
 * returned with amount and fee '0' — never counted as received income.
 */
export function parseKasTransaction(
  t: RestTransaction,
  address: string,
): transaction {
  // kaspa-rest-server reports block_time in milliseconds.
  const time = Number(t.block_time);
  const base = {
    txid: t.transaction_id,
    blockheight: t.is_accepted ? (t.accepting_block_blue_score ?? 0) : 0,
    timestamp: Number.isFinite(time) && time > 0 ? time : Date.now(),
    message: '',
    type: 'kas',
  };
  if (!kasInputsResolved(t)) {
    return { ...base, fee: '0', amount: '0', receiver: address };
  }
  let ownIn = 0n;
  let totalIn = 0n;
  for (const i of t.inputs ?? []) {
    const amount = toSompi(i.previous_outpoint_amount);
    totalIn += amount;
    if (i.previous_outpoint_address === address) ownIn += amount;
  }
  let ownOut = 0n;
  let totalOut = 0n;
  let receiver = '';
  for (const o of t.outputs ?? []) {
    const amount = toSompi(o.amount);
    totalOut += amount;
    if (o.script_public_key_address === address) ownOut += amount;
    else if (!receiver) receiver = o.script_public_key_address ?? '';
  }
  const sending = ownIn > 0n;
  const fee = totalIn >= totalOut ? totalIn - totalOut : 0n;
  const amount = sending ? ownOut - ownIn + fee : ownOut;
  return {
    ...base,
    fee: fee.toString(),
    amount: amount.toString(),
    receiver: sending ? receiver || address : address,
  };
}

/** At most this many unresolved rows per page are re-fetched individually. */
const KAS_RESOLVE_RETRY_LIMIT = 10;

/**
 * History rows [from, to) for an address, newest first. Every page — the
 * live first page and every later full-history / CSV page — comes from the
 * same offset endpoint, so consecutive pages neither overlap nor skip rows
 * the way a cursor first page followed by offset pages could. A row whose
 * previous outpoints came back unresolved is re-fetched once on its own;
 * if it is still unresolved, parseKasTransaction marks it unclassified.
 */
export async function fetchKasTransactions(
  address: string,
  chain: string,
  from = 0,
  to = 50,
): Promise<transaction[]> {
  const limit = Math.max(1, Math.min(500, to - from));
  const rest = kasRestClient(chain);
  const page = await rest.getHistoryByOffset(address, {
    limit,
    offset: Math.max(0, from),
    resolvePreviousOutpoints: 'light',
  });
  let retries = 0;
  const rows = await Promise.all(
    page.map(async (t) => {
      if (kasInputsResolved(t) || retries >= KAS_RESOLVE_RETRY_LIMIT) return t;
      retries += 1;
      try {
        const full = await rest.getTransaction(t.transaction_id, {
          resolvePreviousOutpoints: 'light',
        });
        return full?.transaction_id === t.transaction_id ? full : t;
      } catch {
        return t;
      }
    }),
  );
  return rows.map((t) => parseKasTransaction(t, address));
}

/** Fee rate (sompi/gram) for a preset, from the node's estimate (clamped). */
export async function fetchKasFeeRate(
  chain: string,
  tier: FeeTier,
): Promise<bigint> {
  return pickFeeRate(await kasRestClient(chain).getFeeEstimate(), tier);
}

/** All three presets from one estimate request. */
export async function fetchKasFeeRates(
  chain: string,
): Promise<Record<FeeTier, bigint>> {
  const estimate = await kasRestClient(chain).getFeeEstimate();
  return {
    economy: pickFeeRate(estimate, 'economy'),
    normal: pickFeeRate(estimate, 'normal'),
    fast: pickFeeRate(estimate, 'fast'),
  };
}

/**
 * Whether a transaction is known to the indexer (i.e. it was broadcast and
 * included in a block). The ID is known before signing, so the send flow polls
 * this instead of matching amounts.
 */
export async function isKasTransactionKnown(
  txid: string,
  chain: string,
): Promise<boolean> {
  try {
    const t = await kasRestClient(chain).getTransaction(txid, {
      resolvePreviousOutpoints: 'no',
    });
    return t?.transaction_id?.toLowerCase() === txid.toLowerCase();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Persistent signed-amount ledger (contract §4.3)
// ---------------------------------------------------------------------------

const LEDGER_STORAGE_KEY = 'kas-signed-amounts';
const LEDGER_MAX_ENTRIES = 20000;
let ledgerQueue: Promise<unknown> = Promise.resolve();

/**
 * Outpoint → amount this wallet has signed with, persisted in localForage.
 * kaspa-core refuses to re-sign an outpoint under a different amount, which
 * closes the cross-session fee-inflation attack (kaspa-core AUDIT R2-1).
 * Writes are serialised; the oldest entries are dropped past the cap.
 */
export function kasSignedAmountLedger(): K.SignedAmountLedger {
  const load = async (): Promise<Record<string, string>> => {
    const stored =
      await localForage.getItem<Record<string, string>>(LEDGER_STORAGE_KEY);
    return stored && typeof stored === 'object' ? stored : {};
  };
  return {
    get: async (outpoint) => {
      await ledgerQueue;
      const v = (await load())[outpoint];
      return typeof v === 'string' && /^\d+$/.test(v) ? BigInt(v) : undefined;
    },
    set: (outpoint, amount) => {
      const next = ledgerQueue.then(async () => {
        const all = await load();
        delete all[outpoint];
        all[outpoint] = amount.toString();
        const keys = Object.keys(all);
        for (const k of keys.slice(
          0,
          Math.max(0, keys.length - LEDGER_MAX_ENTRIES),
        ))
          delete all[k];
        await localForage.setItem(LEDGER_STORAGE_KEY, all);
      });
      ledgerQueue = next.catch(() => undefined);
      return next;
    },
  };
}

// ---------------------------------------------------------------------------
// Consumer send: planning and signing (contract §5)
// ---------------------------------------------------------------------------

export interface KasPlanParams {
  chain: string;
  xpubWallet: string;
  xpubKey: string;
  typeIndex: number;
  addressIndex: number;
  receiver: string;
  amountSompi: bigint;
  feeRate: bigint;
  maxFeeSompi: bigint;
  sendAll?: boolean;
  /** Pre-fetched vault UTXOs; fetched from REST when omitted. */
  utxos?: KaspaUtxo[];
  /** Current virtual DAA score (coinbase maturity); fetched when omitted. */
  virtualDaaScore?: bigint;
}

export interface KasPlanned {
  plan: K.Plan;
  spend: KasSpend;
  sender: string;
}

/**
 * Plan a send from the 2-of-2 vault at typeIndex/addressIndex: exact
 * mass-based fee, change back to the same vault address, one transaction only
 * (allowChain: false — a wallet that needs a compounding chain must
 * consolidate first). Throws kaspa-core errors (InsufficientFundsError,
 * NeedsConsolidationError, FeeTooHighError, …).
 */
export async function planKasSend(p: KasPlanParams): Promise<KasPlanned> {
  const spend = kasVaultSpend(
    p.xpubWallet,
    p.xpubKey,
    p.typeIndex,
    p.addressIndex,
    p.chain,
  );
  const sender = kasSpendAddress(spend, p.chain);
  const [utxos, virtualDaaScore] = await Promise.all([
    p.utxos ?? fetchKasUtxos(sender, p.chain),
    p.virtualDaaScore ??
      kasRestClient(p.chain)
        .getVirtualDaaScore()
        .catch(() => undefined),
  ]);
  const plan = K.planTransaction(
    utxosToInputPlans(utxos, spend),
    [
      {
        scriptPublicKey: K.addressToScriptPublicKey(
          p.receiver,
          kasPrefix(p.chain),
        ),
        amount: p.sendAll ? 0n : p.amountSompi,
      },
    ],
    {
      feeRate: p.feeRate,
      changeSpend: spend,
      maxFee: p.maxFeeSompi,
      sendAll: p.sendAll ?? false,
      allowChain: false,
      ...(virtualDaaScore !== undefined ? { virtualDaaScore } : {}),
    },
  );
  return { plan, spend, sender };
}

/**
 * Sign the wallet's half of a planned send and serialise the bundle for SSP
 * Key. Returns the relay payload and the transaction ID (known before
 * signing — Kaspa IDs exclude signature scripts).
 */
export async function signKasSend(
  planned: KasPlanned,
  walletPrivKeyHex: string,
  signedAmounts?: K.SignedAmountLedger,
): Promise<{ payload: string; txid: string }> {
  const key = K.hexToBytes(walletPrivKeyHex);
  const signer = K.localSigner(key);
  key.fill(0);
  try {
    const f = planned.plan.final;
    const partials = await K.signTransaction(f.tx, f.inputs, [signer], {
      onlyScripts: [K.spendScriptPublicKey(planned.spend)],
      ...(signedAmounts ? { signedAmounts } : {}),
    });
    if (partials.length !== f.inputs.length)
      throw new Error('Wallet key does not belong to this Kaspa vault');
    const bundle = K.createSigningBundle(f.tx, f.inputs, partials);
    return { payload: JSON.stringify(bundle), txid: K.bytesToHex(f.id) };
  } finally {
    signer.destroy();
  }
}

// Two fixed, valid x-only keys: only the SHAPE of a 2-of-2 vault spend
// (script and signature sizes, sigop count) matters for a fee estimate.
function dummyVaultSpend(): KasSpend {
  const k1 = new Uint8Array(32);
  k1[31] = 1;
  const k2 = new Uint8Array(32);
  k2[31] = 2;
  return K.multisigSpend([K.xOnlyPublicKey(k1), K.xOnlyPublicKey(k2)], 2);
}

/**
 * Fee (sompi) to sweep every UTXO of a consumer 2-of-2 vault address at the
 * normal rate — for screens (swap) that need the max without the xpubs. Mass
 * depends only on the spend's shape, so a stand-in 2-of-2 gives the exact fee.
 */
export async function estimateKasSendAllFee(
  address: string,
  chain: string,
): Promise<{ fee: bigint; balance: bigint }> {
  const spend = dummyVaultSpend();
  const script = K.spendScriptPublicKey(spend);
  const [utxos, feeRate, virtualDaaScore] = await Promise.all([
    fetchKasUtxos(address, chain),
    fetchKasFeeRate(chain, 'normal'),
    kasRestClient(chain)
      .getVirtualDaaScore()
      .catch(() => undefined),
  ]);
  const balance = sumKasUtxos(utxos);
  if (utxos.length === 0) return { fee: 0n, balance };
  const plan = K.planTransaction(
    utxos.map((u) => ({
      outpoint: u.outpoint,
      entry: { ...u.entry, scriptPublicKey: script },
      spend,
    })),
    [{ scriptPublicKey: script, amount: 0n }],
    {
      feeRate,
      changeSpend: spend,
      sendAll: true,
      allowChain: false,
      ...(virtualDaaScore !== undefined ? { virtualDaaScore } : {}),
    },
  );
  return { fee: plan.final.fee, balance };
}

/**
 * The swap screen's network fee (coin units, decimal string) for sweeping the
 * consumer vault at `senderAddress`: the exact kaspa-core sweep fee over this
 * wallet's REST UTXOs — never the utxolib/insight estimate. '0' without an
 * address.
 */
export async function estimateKasSwapFeeUnits(
  senderAddress: string,
  chain: string,
): Promise<string> {
  if (!senderAddress) return '0';
  const { fee } = await estimateKasSendAllFee(senderAddress, chain);
  const decimals = blockchains[chain].decimals;
  const base = 10n ** BigInt(decimals);
  const whole = fee / base;
  const frac = (fee % base)
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

// ---------------------------------------------------------------------------
// Bundle description
// ---------------------------------------------------------------------------

function parseBundle(payload: string): KasSigningBundle {
  const bundle = JSON.parse(payload) as KasSigningBundle;
  if (
    !bundle ||
    typeof bundle !== 'object' ||
    bundle.format !== 'kaspa-core-signing-bundle'
  ) {
    throw new Error('Not a Kaspa signing bundle');
  }
  return bundle;
}

/**
 * DISPLAY ONLY — summarise a bundle payload for the pending-transaction list
 * (the wallet's own posted `tx` action): sender, receiver, amount sent and fee,
 * in sompi. Input amounts come from the bundle itself, so the fee here is
 * informational; nothing on a signing path may use this.
 */
export function describeKasBundle(
  payload: string,
  chain: string,
): { sender: string; receiver: string; amount: string; fee: string } {
  const opened = K.openSigningBundle(parseBundle(payload), {
    trustBundleEntries: true,
  });
  const spk = opened.inputs[0]?.entry.scriptPublicKey;
  const d = K.describeTransaction(opened.tx, opened.inputs, {
    prefix: kasPrefix(chain),
    ownScripts: spk ? [spk] : [],
  });
  const external = d.outputs.find((o) => !o.isOwn);
  return {
    sender: d.inputs[0]?.address ?? '',
    receiver: external?.address ?? d.outputs[0]?.address ?? '',
    // `sent` = Σ outputs not paying back to the vault (fee excluded).
    amount: d.sent.toString(),
    fee: d.fee.toString(),
  };
}

export interface KasVaultDecoded {
  /** The vault address being spent ('' on error). */
  sender: string;
  /** Every distinct input address (one for a valid proposal, contract §4.7). */
  senders: string[];
  recipients: { address: string; amount: string }[];
  fee: string;
  warnings?: K.DescribeWarning[];
  error?: string;
  /** The error was a network failure: retrying may succeed. */
  transient?: boolean;
}

function summarise(
  opened: { tx: K.Transaction; inputs: K.InputPlan[] },
  ownScripts: K.ScriptPublicKey[],
  chain: string,
): KasVaultDecoded {
  const d = K.describeTransaction(opened.tx, opened.inputs, {
    prefix: kasPrefix(chain),
    ownScripts,
  });
  const senders = [...new Set(d.inputs.map((i) => i.address ?? ''))];
  return {
    sender: senders.length === 1 ? senders[0] : '',
    senders,
    recipients: d.outputs
      .filter((o) => !o.isOwn)
      .map((o) => ({ address: o.address ?? '', amount: o.value.toString() })),
    fee: d.fee.toString(),
    warnings: d.warnings,
  };
}

// ---------------------------------------------------------------------------
// Enterprise vault co-signing (contract §3–§5, §4.7)
// ---------------------------------------------------------------------------

export interface KasInputDetail {
  addressIndex?: number;
  redeemScript?: string;
}

/** The one vault address an enterprise proposal spends (contract §4.7). */
export interface KasProposalVault {
  spend: KasSpend;
  script: K.ScriptPublicKey;
  address: string;
  addressIndex: number;
  redeemScript: string;
}

/**
 * Contract §4.7: one vault script per enterprise proposal. Every inputDetails
 * entry must carry the SAME addressIndex and the SAME redeem script, or the
 * proposal is refused. A signer cannot independently know a vault's full key
 * set, so a payload allowed to name several scripts could mix in a script the
 * attacker built from the public xpubs (e.g. 1-of-2 {this wallet's leaf,
 * attacker key}): the wallet would sign its input too and treat the drain to
 * it as "own" change.
 */
export function resolveKasProposalVault(
  inputDetails: readonly unknown[],
  chain: string,
): KasProposalVault {
  if (!Array.isArray(inputDetails) || inputDetails.length === 0) {
    throw new Error('Kaspa proposal carries no inputDetails');
  }
  let addressIndex: number | undefined;
  let redeemScript: string | undefined;
  for (const raw of inputDetails) {
    const d = raw as KasInputDetail | null;
    if (!d || typeof d !== 'object' || typeof d.redeemScript !== 'string') {
      throw new Error('Kaspa input is missing its vault redeem script');
    }
    if (
      typeof d.addressIndex !== 'number' ||
      !Number.isSafeInteger(d.addressIndex) ||
      d.addressIndex < 0
    ) {
      throw new Error('Invalid Kaspa input addressIndex');
    }
    const redeem = d.redeemScript.toLowerCase();
    if (addressIndex === undefined) {
      addressIndex = d.addressIndex;
      redeemScript = redeem;
    } else if (d.addressIndex !== addressIndex || redeem !== redeemScript) {
      throw new Error(
        'Kaspa proposal must spend exactly one vault address; inputDetails name several',
      );
    }
  }
  if (addressIndex === undefined || redeemScript === undefined) {
    throw new Error('Kaspa proposal carries no inputDetails');
  }
  const spend = kasSpendFromRedeemScript(redeemScript);
  return {
    spend,
    script: K.spendScriptPublicKey(spend),
    address: kasSpendAddress(spend, chain),
    addressIndex,
    redeemScript,
  };
}

function sameScript(a: K.ScriptPublicKey, b: K.ScriptPublicKey): boolean {
  return a.version === b.version && K.equalBytes(a.script, b.script);
}

/** What the proposal record says is being paid (base units), when known. */
export interface KasExpectedRecipient {
  address?: unknown;
  amount?: unknown;
}

export interface KasVaultCheckOptions {
  /**
   * The proposal's source vault address, when the payload carries it. The
   * decoded sender must equal it or the proposal is refused.
   */
  expectedSourceAddress?: string;
  /**
   * The proposal's recipients, when the payload carries them: the external
   * outputs must match them exactly (address and amount, as a multiset).
   */
  expectedRecipients?: readonly KasExpectedRecipient[];
  /** Fee ceiling (sompi): min($100-equivalent, 5 KAS). Library default 5 KAS. */
  maxFee?: bigint;
}

function recipientKey(address: unknown, amount: unknown): string | null {
  if (typeof address !== 'string' || !address.trim()) return null;
  let value: bigint;
  try {
    if (typeof amount === 'bigint') value = amount;
    else if (typeof amount === 'string' && /^\d+$/.test(amount.trim()))
      value = BigInt(amount.trim());
    else if (typeof amount === 'number' && Number.isSafeInteger(amount))
      value = BigInt(amount);
    else return null;
  } catch {
    return null;
  }
  return `${address.trim().toLowerCase()}|${value.toString()}`;
}

/** Throw unless the external outputs equal the expected recipients exactly. */
function assertRecipientsMatch(
  decoded: readonly { address: string; amount: string }[],
  expected: readonly KasExpectedRecipient[],
): void {
  const want = expected.map((r) => recipientKey(r?.address, r?.amount));
  if (want.some((k) => k === null)) {
    throw new Error('Kaspa proposal recipients are malformed');
  }
  const have = decoded.map((r) => recipientKey(r.address, r.amount));
  const a = [...(want as string[])].sort();
  const b = have.map((k) => k ?? '?').sort();
  if (a.length !== b.length || a.some((k, i) => k !== b[i])) {
    throw new Error(
      'Kaspa transaction outputs do not match the proposal recipients',
    );
  }
}

/**
 * Open a proposal bundle for the ONE vault address its inputDetails name
 * (contract §4.7), with THIS wallet's own REST lookup of that address (never
 * the payload's amounts, contract §4.1). Every input must spend that script.
 */
async function openVaultBundle(
  bundleJson: string,
  chain: string,
  inputDetails: readonly unknown[],
  rest: KaspaRestClient,
  opts: KasVaultCheckOptions,
) {
  const bundle = parseBundle(bundleJson);
  const vault = resolveKasProposalVault(inputDetails, chain);
  if (
    opts.expectedSourceAddress !== undefined &&
    opts.expectedSourceAddress !== '' &&
    opts.expectedSourceAddress.trim().toLowerCase() !== vault.address
  ) {
    throw new Error(
      'Kaspa proposal source address does not match the vault script being spent',
    );
  }
  // Only this one address is looked up: an input from any other script is
  // absent from the trusted set, so opening fails (EntryMismatchError).
  const trustedUtxos = await rest.getUtxos([vault.address]);
  const opened = K.openSigningBundle(bundle, {
    trustedUtxos,
    ...(opts.maxFee !== undefined ? { policy: { maxFee: opts.maxFee } } : {}),
  });
  if (opened.inputs.length !== inputDetails.length) {
    throw new Error('Kaspa inputDetails do not match the transaction inputs');
  }
  opened.inputs.forEach((input, i) => {
    if (
      input.spend.kind !== 'p2sh-multisig' ||
      K.bytesToHex(input.spend.redeem) !== vault.redeemScript ||
      !sameScript(input.entry.scriptPublicKey, vault.script)
    ) {
      throw new Error(`Kaspa input ${i} does not spend the proposal vault`);
    }
  });
  // Every partial collected so far must be valid for its input.
  for (const p of opened.partials) {
    if (!K.verifyPartialSignature(opened.tx, opened.inputs, p)) {
      throw new Error('Kaspa bundle carries an invalid partial signature');
    }
  }
  const summary = summarise(opened, [vault.script], chain);
  if (summary.senders.length !== 1 || summary.senders[0] !== vault.address) {
    throw new Error('Kaspa transaction spends from an unexpected address');
  }
  if (opts.expectedRecipients !== undefined) {
    // A recipient that IS the vault (a consolidation) pays the vault's own
    // script, so describeTransaction reports it as own, not external. Such
    // entries must each match a distinct own output; the rest must equal the
    // external outputs exactly.
    const isSelf = (r: KasExpectedRecipient) =>
      typeof r?.address === 'string' &&
      r.address.trim().toLowerCase() === vault.address;
    const self = opts.expectedRecipients.filter(isSelf);
    assertRecipientsMatch(
      summary.recipients,
      opts.expectedRecipients.filter((r) => !isSelf(r)),
    );
    if (self.length > 0) {
      const own = K.describeTransaction(opened.tx, opened.inputs, {
        prefix: kasPrefix(chain),
        ownScripts: [vault.script],
      }).outputs.filter((o) => o.isOwn);
      const pool = own.map((o) => recipientKey(vault.address, o.value));
      for (const r of self) {
        const i = pool.indexOf(recipientKey(r.address, r.amount));
        if (i < 0) {
          throw new Error(
            'Kaspa consolidation output does not match the proposal recipients',
          );
        }
        pool.splice(i, 1);
      }
      // A pure consolidation has no external output: show the vault itself.
      if (summary.recipients.length === 0) {
        summary.recipients = own.map((o) => ({
          address: vault.address,
          amount: o.value.toString(),
        }));
      }
    }
  }
  return { opened, vault, summary };
}

/**
 * Trustless decode for the enterprise sign screen: sender(s), recipients, fee
 * and describeTransaction warnings computed from this wallet's own UTXO
 * lookup of the single proposal vault address. Never throws — failures
 * (including a REST error, which the screen may retry) come back as `error`.
 */
export async function decodeKasVaultProposal(
  bundleJson: string,
  chain: string,
  inputDetails: readonly unknown[],
  opts: KasVaultCheckOptions & { rest?: KaspaRestClient } = {},
): Promise<KasVaultDecoded> {
  try {
    const { summary } = await openVaultBundle(
      bundleJson,
      chain,
      inputDetails,
      opts.rest ?? kasRestClient(chain),
      opts,
    );
    return summary;
  } catch (error) {
    return {
      sender: '',
      senders: [],
      recipients: [],
      fee: '0',
      error:
        error instanceof Error
          ? error.message
          : 'Failed to decode Kaspa transaction',
      ...(isKasTransientError(error) ? { transient: true } : {}),
    };
  }
}

/** A network failure (worth retrying), not a refusal of the proposal. */
export function isKasTransientError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === 'REST' || code === 'SUBMIT_OUTCOME_UNKNOWN') return true;
  return error instanceof TypeError && /fetch|network/i.test(error.message);
}

export interface KasVaultSignParams extends KasVaultCheckOptions {
  /** rawUnsignedTx or currentSignedHex: bundle JSON with every partial so far. */
  bundleJson: string;
  chain: string;
  inputDetails: readonly unknown[];
  /** The wallet's org-account xpriv m/48'/111111'/{orgIndex}'/0'. */
  vaultXpriv: string;
  vaultIndex: number;
  signedAmounts?: K.SignedAmountLedger;
  /** Injected in tests; defaults to the configured REST backend. */
  rest?: KaspaRestClient;
}

/**
 * Add the wallet's partial signatures to an enterprise proposal bundle and
 * return the merged bundle JSON (what `signedHex` / `walletSignedHex` carry).
 * Contract §4.7: the proposal must spend ONE vault script; the wallet's leaf
 * at org'/vaultIndex/addressIndex must be one of its keys; that script alone
 * is `onlyScripts`, and every input must be signed.
 */
export async function signKasVaultBundle(
  p: KasVaultSignParams,
): Promise<string> {
  const { opened, vault } = await openVaultBundle(
    p.bundleJson,
    p.chain,
    p.inputDetails,
    p.rest ?? kasRestClient(p.chain),
    p,
  );
  const { privKey } = generateAddressKeypairKAS(
    p.vaultXpriv,
    p.vaultIndex,
    vault.addressIndex,
    p.chain,
  );
  const bytes = K.hexToBytes(privKey);
  const signer = K.localSigner(bytes);
  bytes.fill(0);
  try {
    const own = signer.xOnlyPublicKey;
    if (!K.spendSigningKeys(vault.spend).some((k) => K.equalBytes(k, own))) {
      throw new Error('This wallet is not a signer of the proposal vault');
    }
    const partials = await K.signTransaction(
      opened.tx,
      opened.inputs,
      [signer],
      {
        onlyScripts: [vault.script],
        ...(p.maxFee !== undefined ? { maxFee: p.maxFee } : {}),
        ...(p.signedAmounts ? { signedAmounts: p.signedAmounts } : {}),
      },
    );
    if (partials.length !== opened.inputs.length) {
      throw new Error('Wallet key did not sign every input of the proposal');
    }
    // Local first: a remote duplicate can never displace our own signature.
    const merged = K.mergePartialSignatures(partials, opened.partials);
    return JSON.stringify(
      K.createSigningBundle(opened.tx, opened.inputs, merged),
    );
  } finally {
    signer.destroy();
  }
}

/** Is this string a Kaspa signing bundle (the relay/enterprise payload shape)? */
export function isKasSigningBundleJson(payload: string): boolean {
  try {
    parseBundle(payload);
    return true;
  } catch {
    return false;
  }
}

export { K as kaspaCore };
