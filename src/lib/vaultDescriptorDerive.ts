/**
 * VD-4: vault address derivation from a verified vault descriptor, and the
 * device-side checks built on it.
 *
 * deriveVaultAddressFromDescriptor() replicates relay-enterprise
 * `vaultAddressService` exactly (generateUtxoMultisigAddress /
 * generateEvmMultisigAddress / generateSolanaMultisigAddress): same chain
 * family branching, signing-mode key selection, key ordering and threshold.
 * Signers are the descriptor members, already sorted by wkIdentity — the same
 * order the server sorts them in. `typeIndex` is the server's `vaultIndex`
 * argument (the BIP32 change level: vault addresses live at
 * /{vault.vaultIndex}/{addressIndex}; on Solana it is the vault PDA index).
 */

import utxolib from '@runonflux/utxo-lib';
import * as aaSchnorrMultisig from '@runonflux/aa-schnorr-multisig-sdk';
import { HDKey } from '@scure/bip32';
import { Buffer } from 'buffer';
import { toCashAddress } from 'bchaddrjs';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import {
  deriveMultisigAddress as deriveSolanaMultisigAddress,
  deriveVaultAddress as deriveSolanaVaultAddress,
} from '@runonflux/solana-multisig';
import { blockchains } from '@storage/blockchains';
import {
  VaultDescriptorError,
  isSingleDeviceMode,
  vaultChainFamily,
  type VaultDescriptorV1,
} from './vaultDescriptor';
import { inputAddressIndex, isValidChildIndex } from './enterpriseIndexGuard';

interface ChainConfig {
  chainType?: string;
  scriptType?: string;
  libid: string;
  bip32: { public: number; private: number };
  cashaddr?: string;
  accountSalt?: string;
  factorySalt?: string;
  factoryAddress?: string;
  entrypointAddress?: string;
  programId?: string;
}

function chainConfig(chain: string): ChainConfig {
  const config = (blockchains as unknown as Record<string, ChainConfig>)[chain];
  if (!config) {
    throw new VaultDescriptorError(
      'unsupported',
      `Unsupported chain: ${chain}`,
    );
  }
  return config;
}

export interface DerivedVaultAddress {
  address: string;
  chain: string;
  typeIndex: number;
  addressIndex: number;
  /** UTXO: P2WSH / P2SH-P2WSH witness script (hex). */
  witnessScript?: string;
  /** UTXO: P2SH redeem script, or the P2SH-P2WSH wrapper (hex). */
  redeemScript?: string;
  /** UTXO: the output script paying this address (hex). */
  scriptPubKey?: string;
  /** Solana: multisig PDA (the address is the vault PDA). */
  solanaMultisigPda?: string;
  /** Solana: per-index sorted ed25519 members (base58). */
  solanaMembers?: string[];
  /** Solana: ed25519 threshold. */
  solanaThreshold?: number;
}

/** relay-enterprise assertValidThreshold. */
function assertValidThreshold(requiredSigners: number, signerCount: number) {
  if (
    !Number.isInteger(requiredSigners) ||
    requiredSigners < 1 ||
    requiredSigners > signerCount
  ) {
    throw new VaultDescriptorError(
      'malformed',
      `Invalid requiredSigners ${String(requiredSigners)} for ${signerCount} signers`,
    );
  }
}

function signerXpub(
  xpub: string | null,
  role: 'wallet' | 'key',
  index: number,
): string {
  if (!xpub) {
    throw new VaultDescriptorError(
      'malformed',
      `members[${index}] ${role} xpub is missing`,
    );
  }
  return xpub;
}

// Public xpub -> /typeIndex nodes, so classifying outputs against all 20
// vault addresses does not re-parse and re-derive every xpub 20 times.
const typeNodeCache = new Map<string, HDKey>();
const TYPE_NODE_CACHE_LIMIT = 512;

function typeNode(
  xpub: string,
  typeIndex: number,
  parse: () => HDKey,
  versions: number,
): HDKey {
  const key = `${versions}|${typeIndex}|${xpub}`;
  let node = typeNodeCache.get(key);
  if (!node) {
    node = parse().deriveChild(typeIndex);
    if (typeNodeCache.size >= TYPE_NODE_CACHE_LIMIT) typeNodeCache.clear();
    typeNodeCache.set(key, node);
  }
  return node;
}

/** relay-enterprise deriveChildPubKey (bip32 params, then network params). */
function deriveUtxoChildPubKey(
  xpub: string,
  typeIndex: number,
  addressIndex: number,
  config: ChainConfig,
): Buffer {
  const parse = () => {
    try {
      return HDKey.fromExtendedKey(xpub, config.bip32);
    } catch {
      return HDKey.fromExtendedKey(xpub, utxolib.networks[config.libid]?.bip32);
    }
  };
  const derived = typeNode(
    xpub,
    typeIndex,
    parse,
    config.bip32.public,
  ).deriveChild(addressIndex);
  if (!derived.publicKey) {
    throw new Error('Failed to derive public key from xpub');
  }
  return Buffer.from(derived.publicKey);
}

function toCashAddrIfNeeded(config: ChainConfig, address: string): string {
  if (!config.cashaddr || !address) return address;
  try {
    return toCashAddress(address);
  } catch {
    return address;
  }
}

function deriveUtxo(
  d: VaultDescriptorV1,
  config: ChainConfig,
  typeIndex: number,
  addressIndex: number,
): DerivedVaultAddress {
  const mode = d.signingMode;
  const m = isSingleDeviceMode(mode)
    ? d.requiredSigners
    : d.requiredSigners * 2;
  const pubKeys: Buffer[] = [];
  d.members.forEach((member, i) => {
    if (mode !== 'key_only') {
      pubKeys.push(
        deriveUtxoChildPubKey(
          signerXpub(member.xpubWallet, 'wallet', i),
          typeIndex,
          addressIndex,
          config,
        ),
      );
    }
    if (mode !== 'wallet_only') {
      pubKeys.push(
        deriveUtxoChildPubKey(
          signerXpub(member.xpubKey, 'key', i),
          typeIndex,
          addressIndex,
          config,
        ),
      );
    }
  });
  // BIP67: lexicographic order of the hex keys.
  const sorted = pubKeys
    .map((buf) => buf.toString('hex'))
    .sort()
    .map((hex) => Buffer.from(hex, 'hex'));
  const network = utxolib.networks[config.libid];
  const base = { chain: d.chain, typeIndex, addressIndex };

  if (config.scriptType === 'p2wsh') {
    const witnessScript = utxolib.script.multisig.output.encode(m, sorted);
    const scriptPubKey = utxolib.script.witnessScriptHash.output.encode(
      utxolib.crypto.sha256(witnessScript),
    );
    return {
      ...base,
      address: toCashAddrIfNeeded(
        config,
        utxolib.address.fromOutputScript(scriptPubKey, network),
      ),
      witnessScript: Buffer.from(witnessScript).toString('hex'),
      scriptPubKey: Buffer.from(scriptPubKey).toString('hex'),
    };
  }
  if (config.scriptType === 'p2sh-p2wsh') {
    const witnessScript = utxolib.script.multisig.output.encode(m, sorted);
    const redeemScript = utxolib.script.witnessScriptHash.output.encode(
      utxolib.crypto.sha256(witnessScript),
    );
    const scriptPubKey = utxolib.script.scriptHash.output.encode(
      utxolib.crypto.hash160(redeemScript),
    );
    return {
      ...base,
      address: toCashAddrIfNeeded(
        config,
        utxolib.address.fromOutputScript(scriptPubKey, network),
      ),
      witnessScript: Buffer.from(witnessScript).toString('hex'),
      redeemScript: Buffer.from(redeemScript).toString('hex'),
      scriptPubKey: Buffer.from(scriptPubKey).toString('hex'),
    };
  }
  // P2SH legacy multisig (DOGE, BCH, ZEC, RVN, FLUX).
  const redeemScript = utxolib.script.multisig.output.encode(m, sorted);
  const scriptPubKey = utxolib.script.scriptHash.output.encode(
    utxolib.crypto.hash160(redeemScript),
  );
  return {
    ...base,
    address: toCashAddrIfNeeded(
      config,
      utxolib.address.fromOutputScript(scriptPubKey, network),
    ),
    redeemScript: Buffer.from(redeemScript).toString('hex'),
    scriptPubKey: Buffer.from(scriptPubKey).toString('hex'),
  };
}

/**
 * Every Schnorr key of an EVM vault at (typeIndex, addressIndex), compressed,
 * in the server's order: signer order (wkIdentity), wallet key then key key,
 * only the roles the signing mode uses — NOT sorted.
 */
function evmVaultPublicKeys(
  d: VaultDescriptorV1,
  config: ChainConfig,
  typeIndex: number,
  addressIndex: number,
): Uint8Array[] {
  const mode = d.signingMode;
  const derive = (xpub: string) => {
    const child = HDKey.fromExtendedKey(xpub, config.bip32)
      .deriveChild(typeIndex)
      .deriveChild(addressIndex);
    if (!child.publicKey) {
      throw new Error('Failed to derive public key from xpub');
    }
    return child.publicKey;
  };
  const keys: Uint8Array[] = [];
  d.members.forEach((member, i) => {
    if (mode !== 'key_only') {
      keys.push(derive(signerXpub(member.xpubWallet, 'wallet', i)));
    }
    if (mode !== 'wallet_only') {
      keys.push(derive(signerXpub(member.xpubKey, 'key', i)));
    }
  });
  return keys;
}

function deriveEvm(
  d: VaultDescriptorV1,
  config: ChainConfig,
  typeIndex: number,
  addressIndex: number,
): DerivedVaultAddress {
  const { accountSalt, factorySalt, factoryAddress, entrypointAddress } =
    config;
  if (!accountSalt || !factorySalt || !factoryAddress || !entrypointAddress) {
    throw new VaultDescriptorError(
      'unsupported',
      `Missing EVM configuration for chain: ${d.chain}`,
    );
  }
  const m = isSingleDeviceMode(d.signingMode)
    ? d.requiredSigners
    : d.requiredSigners * 2;
  const keys = evmVaultPublicKeys(d, config, typeIndex, addressIndex).map(
    (publicKey) => new aaSchnorrMultisig.types.Key(Buffer.from(publicKey)),
  );
  const combined =
    aaSchnorrMultisig.helpers.SchnorrHelpers.getAllCombinedAddrFromKeysStrict(
      keys,
      m,
    );
  const implementation =
    aaSchnorrMultisig.helpers.create2Helpers.predictAccountImplementationAddrOffchain(
      factorySalt,
      factoryAddress,
      entrypointAddress,
    );
  const address =
    aaSchnorrMultisig.helpers.create2Helpers.predictAccountAddrOffchain(
      factoryAddress,
      implementation,
      combined,
      accountSalt,
    );
  return { address, chain: d.chain, typeIndex, addressIndex };
}

/** relay-enterprise parsePubkeyArray: JSON, 20 distinct base58 ed25519 keys. */
function parseSolanaPubkeyArray(json: string, where: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new VaultDescriptorError('malformed', `${where}: not a JSON array`);
  }
  if (!Array.isArray(parsed) || parsed.length !== 20) {
    throw new VaultDescriptorError(
      'malformed',
      `${where}: expected 20 ed25519 pubkeys`,
    );
  }
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (typeof entry !== 'string') {
      throw new VaultDescriptorError('malformed', `${where}: non-string entry`);
    }
    try {
      new PublicKey(entry);
    } catch {
      throw new VaultDescriptorError('malformed', `${where}: invalid pubkey`);
    }
    if (seen.has(entry)) {
      throw new VaultDescriptorError('malformed', `${where}: duplicate pubkey`);
    }
    seen.add(entry);
  }
  return parsed as string[];
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function deriveSolana(
  d: VaultDescriptorV1,
  config: ChainConfig,
  typeIndex: number,
  addressIndex: number,
): DerivedVaultAddress {
  if (!config.programId) {
    throw new VaultDescriptorError(
      'unsupported',
      `Solana program id not configured for chain: ${d.chain}`,
    );
  }
  if (addressIndex >= 20) {
    throw new VaultDescriptorError(
      'malformed',
      `Solana address index ${addressIndex} out of range`,
    );
  }
  const programId = new PublicKey(config.programId);
  const dual = d.signingMode === 'sol_dual';
  const atIndex: string[] = [];
  d.members.forEach((member, i) => {
    atIndex.push(
      parseSolanaPubkeyArray(
        signerXpub(member.xpubWallet, 'wallet', i),
        `members[${i}].xpubWallet`,
      )[addressIndex],
    );
    if (dual) {
      atIndex.push(
        parseSolanaPubkeyArray(
          signerXpub(member.xpubKey, 'key', i),
          `members[${i}].xpubKey`,
        )[addressIndex],
      );
    }
  });
  const threshold = dual ? d.requiredSigners * 2 : d.requiredSigners;
  // Program sort_members: lexicographic by raw 32 bytes.
  const sorted = [...atIndex].sort((a, b) =>
    compareBytes(bs58.decode(a), bs58.decode(b)),
  );
  const [multisigPda] = deriveSolanaMultisigAddress(
    sorted.map((p) => new PublicKey(p)),
    threshold,
    programId,
  );
  const [vaultPda] = deriveSolanaVaultAddress(
    multisigPda,
    typeIndex,
    programId,
  );
  return {
    address: vaultPda.toBase58(),
    chain: d.chain,
    typeIndex,
    addressIndex,
    solanaMultisigPda: multisigPda.toBase58(),
    solanaMembers: sorted,
    solanaThreshold: threshold,
  };
}

/**
 * Derive the vault address at (typeIndex, addressIndex) from the descriptor.
 * Throws VaultDescriptorError on malformed descriptors or indices.
 */
export function deriveVaultAddressFromDescriptor(
  d: VaultDescriptorV1,
  typeIndex: number,
  addressIndex: number,
): DerivedVaultAddress {
  if (!isValidChildIndex(typeIndex) || !isValidChildIndex(addressIndex)) {
    throw new VaultDescriptorError('malformed', 'Invalid derivation index');
  }
  const family = vaultChainFamily(d.chain);
  const config = chainConfig(d.chain);
  assertValidThreshold(d.requiredSigners, d.members.length);
  if (family === 'sol') {
    if (d.signingMode !== 'sol_dual' && d.signingMode !== 'sol_single') {
      throw new VaultDescriptorError(
        'unsupported',
        'Solana vault is missing a signing mode',
      );
    }
    return deriveSolana(d, config, typeIndex, addressIndex);
  }
  if (family === 'evm') return deriveEvm(d, config, typeIndex, addressIndex);
  if (family === 'utxo') return deriveUtxo(d, config, typeIndex, addressIndex);
  throw new VaultDescriptorError(
    'unsupported',
    `Unsupported chain: ${d.chain}`,
  );
}

/** Address equality as relay-enterprise verifyVaultAddress compares it. */
export function vaultAddressesEqual(
  chain: string,
  a: string,
  b: string,
): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  return vaultChainFamily(chain) === 'sol'
    ? a === b
    : a.toLowerCase() === b.toLowerCase();
}

// ---------------------------------------------------------------------------
// VD-4 checks
// ---------------------------------------------------------------------------

function mismatch(message: string): never {
  throw new VaultDescriptorError('derivation_mismatch', message);
}

function optionalHex(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^[0-9a-fA-F]+$/.test(value)) {
    mismatch(`${where} is not hex`);
  }
  return value.toLowerCase();
}

export interface VaultUtxoOutput {
  address: string;
  amount: string;
  /** Index of the vault address this output pays, or null (a recipient). */
  vaultAddressIndex: number | null;
}

export interface VaultUtxoCheck {
  /** Address index of every input, in input order. */
  inputAddressIndexes: number[];
  /** The source (spending) vault address. */
  sourceAddress: string;
  /** Every value-carrying output, classified. */
  outputs: VaultUtxoOutput[];
}

/** MAX_ADDRESSES_PER_VAULT (relay-enterprise vaultService). */
export const VAULT_ADDRESS_COUNT = 20;

/**
 * UTXO sign: every input's scripts (inputDetails and, when the transaction is
 * already partly signed, the scripts embedded in it) must equal the scripts
 * derived at that input's (vaultIndex, addressIndex). Outputs paying a
 * derived vault address are change (shown as such); every other output is a
 * recipient.
 */
export function checkUtxoTransactionAgainstDescriptor(
  d: VaultDescriptorV1,
  rawTxHex: string,
  inputDetails: unknown[],
): VaultUtxoCheck {
  const config = chainConfig(d.chain);
  if (vaultChainFamily(d.chain) !== 'utxo') {
    mismatch('not a UTXO vault');
  }
  const network = utxolib.networks[config.libid];
  let txb: {
    tx: { ins: unknown[]; outs: Array<{ value: number; script: Buffer }> };
    inputs: Array<{ witnessScript?: Buffer; redeemScript?: Buffer }>;
  };
  try {
    txb = utxolib.TransactionBuilder.fromTransaction(
      utxolib.Transaction.fromHex(rawTxHex, network),
      network,
    );
  } catch {
    mismatch('transaction could not be parsed');
  }
  if (inputDetails.length === 0 || txb.tx.ins.length !== inputDetails.length) {
    mismatch('input details do not match the transaction inputs');
  }

  const derivedByIndex = new Map<number, DerivedVaultAddress>();
  const derivedAt = (addressIndex: number) => {
    let derived = derivedByIndex.get(addressIndex);
    if (!derived) {
      derived = deriveVaultAddressFromDescriptor(d, d.vaultIndex, addressIndex);
      derivedByIndex.set(addressIndex, derived);
    }
    return derived;
  };

  const inputAddressIndexes = inputDetails.map((input, i) => {
    let addressIndex: number;
    try {
      addressIndex = inputAddressIndex(input);
    } catch {
      mismatch(`input ${i} has an invalid address index`);
    }
    const derived = derivedAt(addressIndex);
    const detail =
      input && typeof input === 'object'
        ? (input as { witnessScript?: unknown; redeemScript?: unknown })
        : {};
    const claimed = {
      witnessScript: optionalHex(
        detail.witnessScript,
        `input ${i} witnessScript`,
      ),
      redeemScript: optionalHex(detail.redeemScript, `input ${i} redeemScript`),
    };
    const embedded = txb.inputs[i] ?? {};
    const inTx = {
      witnessScript: embedded.witnessScript
        ? Buffer.from(embedded.witnessScript).toString('hex')
        : undefined,
      redeemScript: embedded.redeemScript
        ? Buffer.from(embedded.redeemScript).toString('hex')
        : undefined,
    };
    for (const field of ['witnessScript', 'redeemScript'] as const) {
      const expected = derived[field];
      if (claimed[field] !== expected) {
        mismatch(
          expected
            ? `input ${i}: ${field} is not the vault's script at address #${addressIndex}`
            : `input ${i}: unexpected ${field} for this vault`,
        );
      }
      if (inTx[field] !== undefined && inTx[field] !== expected) {
        mismatch(
          `input ${i}: the transaction's ${field} is not the vault's script at address #${addressIndex}`,
        );
      }
    }
    return addressIndex;
  });

  // The builder sends change back to the source address (falling back to the
  // vault's first address): an output is change iff it pays a vault address
  // at (vaultIndex, i) for some i in 0..19 (shared vectors rule).
  const changeScripts = new Map<string, number>();
  for (let index = 0; index < VAULT_ADDRESS_COUNT; index++) {
    const derived = derivedAt(index);
    if (derived.scriptPubKey) changeScripts.set(derived.scriptPubKey, index);
  }

  const outputs: VaultUtxoOutput[] = [];
  txb.tx.outs.forEach((out) => {
    if (!out.value) return; // OP_RETURN memo
    const scriptHex = Buffer.from(out.script).toString('hex');
    let address: string;
    try {
      address = toCashAddrIfNeeded(
        config,
        utxolib.address.fromOutputScript(out.script, network),
      );
    } catch {
      mismatch('an output pays a script this device cannot display');
    }
    const vaultAddressIndex = changeScripts.get(scriptHex);
    outputs.push({
      address,
      amount: String(out.value),
      vaultAddressIndex: vaultAddressIndex ?? null,
    });
  });

  return {
    inputAddressIndexes,
    sourceAddress: derivedAt(inputAddressIndexes[0]).address,
    outputs,
  };
}

/** EVM sign: the user operation's sender is the vault account. */
export function checkEvmSenderAgainstDescriptor(
  d: VaultDescriptorV1,
  sender: unknown,
  addressIndex: number,
): DerivedVaultAddress {
  const derived = deriveVaultAddressFromDescriptor(
    d,
    d.vaultIndex,
    addressIndex,
  );
  if (
    typeof sender !== 'string' ||
    !vaultAddressesEqual(d.chain, sender, derived.address)
  ) {
    mismatch(
      `the operation's sender is not the vault account at address #${addressIndex} (${derived.address})`,
    );
  }
  return derived;
}

/**
 * EVM: every Schnorr key of the vault at (vaultIndex, addressIndex), as
 * lowercase compressed hex, derived from the descriptor alone.
 */
export function deriveEvmVaultSignerKeys(
  d: VaultDescriptorV1,
  addressIndex: number,
): string[] {
  if (vaultChainFamily(d.chain) !== 'evm') mismatch('not an EVM vault');
  if (!isValidChildIndex(addressIndex)) {
    throw new VaultDescriptorError('malformed', 'Invalid derivation index');
  }
  return evmVaultPublicKeys(
    d,
    chainConfig(d.chain),
    d.vaultIndex,
    addressIndex,
  ).map((key) => Buffer.from(key).toString('hex'));
}

/**
 * EVM sign (VD-4, parity with SSP Key): the Schnorr signer set the request
 * supplies (allSignerKeys, or the M=1 pair built from the request's key xpub)
 * contains only keys derived from the pinned descriptor at this address
 * index, each at most once, and — when this wallet signs — this wallet's own
 * key. A relay-chosen key outside the vault would otherwise make this device
 * co-sign for a key set it never verified. Returns the keys unchanged.
 */
export function checkEvmSignerKeysAgainstDescriptor(
  d: VaultDescriptorV1,
  addressIndex: number,
  signerKeys: unknown,
  ownPubKey: string | null,
): string[] {
  if (
    !Array.isArray(signerKeys) ||
    signerKeys.length === 0 ||
    !signerKeys.every((key) => typeof key === 'string' && key.length > 0)
  ) {
    mismatch('the request carries a malformed signer key list');
  }
  const keys = signerKeys as string[];
  const vaultKeys = new Set(deriveEvmVaultSignerKeys(d, addressIndex));
  const seen = new Set<string>();
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (!vaultKeys.has(lower) || seen.has(lower)) {
      mismatch(
        `a signer key is not a key of this vault at address #${addressIndex}`,
      );
    }
    seen.add(lower);
  }
  if (ownPubKey !== null && !seen.has(ownPubKey.toLowerCase())) {
    mismatch("this wallet's own key is not one of the request's signer keys");
  }
  return keys;
}

/**
 * Solana sign: the multisig PDA in the signed bytes (and, when decoded, the
 * vault PDA the proposal spends from) are the ones derived from the
 * descriptor's members and threshold.
 */
export function checkSolanaPdaAgainstDescriptor(
  d: VaultDescriptorV1,
  multisigPda: string | undefined,
  vaultPda: string | undefined,
  addressIndex: number,
): DerivedVaultAddress {
  const derived = deriveVaultAddressFromDescriptor(
    d,
    d.vaultIndex,
    addressIndex,
  );
  if (!multisigPda || multisigPda !== derived.solanaMultisigPda) {
    mismatch(
      `the transaction's multisig is not the vault's multisig at address #${addressIndex}`,
    );
  }
  if (
    vaultPda !== undefined &&
    vaultPda !== '' &&
    vaultPda !== derived.address
  ) {
    mismatch(
      `the transaction spends from ${vaultPda}, not the vault address #${addressIndex}`,
    );
  }
  return derived;
}

/**
 * Flux node start: the collateral's redeem script (and address, when given)
 * are the vault's at (vaultIndex, addressIndex).
 */
export function checkFluxCollateralAgainstDescriptor(
  d: VaultDescriptorV1,
  addressIndex: number,
  redeemScript: string,
  collateralAddress?: string,
): DerivedVaultAddress {
  const derived = deriveVaultAddressFromDescriptor(
    d,
    d.vaultIndex,
    addressIndex,
  );
  if (
    !derived.redeemScript ||
    typeof redeemScript !== 'string' ||
    redeemScript.toLowerCase() !== derived.redeemScript
  ) {
    mismatch(
      `the collateral redeem script is not the vault's script at address #${addressIndex}`,
    );
  }
  if (
    collateralAddress &&
    !vaultAddressesEqual(d.chain, collateralAddress, derived.address)
  ) {
    mismatch(
      `the collateral address is not the vault address #${addressIndex} (${derived.address})`,
    );
  }
  return derived;
}

export interface VaultSignCheckInput {
  /** EVM personal_sign digest instead of a transaction. */
  isMessageSign: boolean;
  rawUnsignedTx: string;
  inputDetails: unknown[];
  /** EVM: sender of the normalised user operation that is displayed/hashed. */
  evmSender?: string;
  /** Solana: multisig PDA of the decoded signing bytes. */
  solMultisigPda?: string;
  /** Solana: vault PDA the decoded proposal spends from. */
  solVaultPda?: string;
}

export interface VaultSignCheck {
  /** The vault address the request spends from / signs as. */
  sourceAddress: string;
  addressIndex: number;
  /** UTXO only: inputs verified, outputs classified. */
  utxo?: VaultUtxoCheck;
}

/**
 * VD-4 for enterprise_vault_sign_tx / enterprise_vault_sign_message: run the
 * chain family's check against the verified descriptor. Throws
 * VaultDescriptorError('derivation_mismatch') on any disagreement.
 */
export function checkVaultSignRequest(
  d: VaultDescriptorV1,
  input: VaultSignCheckInput,
): VaultSignCheck {
  const family = vaultChainFamily(d.chain);
  if (input.inputDetails.length === 0) mismatch('the request has no inputs');
  let addressIndex: number;
  try {
    addressIndex = inputAddressIndex(input.inputDetails[0]);
  } catch {
    mismatch('the request carries an invalid address index');
  }
  if (input.isMessageSign) {
    if (family !== 'evm') mismatch('vault message signing is EVM-only');
    const derived = deriveVaultAddressFromDescriptor(
      d,
      d.vaultIndex,
      addressIndex,
    );
    return { sourceAddress: derived.address, addressIndex };
  }
  if (family === 'evm') {
    const derived = checkEvmSenderAgainstDescriptor(
      d,
      input.evmSender,
      addressIndex,
    );
    return { sourceAddress: derived.address, addressIndex };
  }
  if (family === 'sol') {
    const derived = checkSolanaPdaAgainstDescriptor(
      d,
      input.solMultisigPda,
      input.solVaultPda,
      addressIndex,
    );
    return { sourceAddress: derived.address, addressIndex };
  }
  const utxo = checkUtxoTransactionAgainstDescriptor(
    d,
    input.rawUnsignedTx,
    input.inputDetails,
  );
  return {
    sourceAddress: utxo.sourceAddress,
    addressIndex: utxo.inputAddressIndexes[0],
    utxo,
  };
}
