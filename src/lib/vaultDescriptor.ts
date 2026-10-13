/**
 * Vault descriptor pinning (security review phase 2, VD — H-12 / H-17 /
 * EVM-5 / AA-4 / ENTX-A-3): wallet side.
 *
 * SSP Enterprise passes the vault's full signer set (`vaultDescriptor`) and
 * its hash (`vaultDescriptorHash`) with every vault request. This device
 * stops trusting the relay for a vault's scripts and addresses:
 *
 *  1. the hash must be sha256(canonicalJson(descriptor)) — the exact byte
 *     rules are mirrored on SSP Key and relay-enterprise;
 *  2. the shape, indices, threshold and signer count must be valid;
 *  3. every member's WK identity must be the P2WSH 2-of-2 of its two pubkeys;
 *  4. every xpub the signing mode uses must carry a valid attestation by that
 *     member's identity key (the same `SSP_VAULT_XPUB:…` message that
 *     relay-enterprise `vaultService.submitXpub` verified);
 *  5. this wallet must be a member, with its own account xpub;
 *  6. the verified descriptor is pinned on first use (TOFU, with explicit user
 *     confirmation) and must match the pin on every later request.
 *
 * Pure module: no storage, no UI, no seed access. Everything fails closed by
 * throwing VaultDescriptorError.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import utxolib from '@runonflux/utxo-lib';
import { Buffer } from 'buffer';
import { blockchains } from '@storage/blockchains';
import { verifyMessageSignature } from './relayAuth';
import {
  isValidChildIndex,
  isValidEnterpriseOrgIndex,
} from './enterpriseIndexGuard';

/** Shown when SSP Enterprise sent no descriptor (an app that predates VD). */
export const VAULT_DESCRIPTOR_MISSING_MESSAGE =
  'Update required: vault descriptor missing';

/** Message magic of the xpub attestations (relay identityAuth default). */
export const VAULT_ATTESTATION_MESSAGE_PREFIX = '\x18Bitcoin Signed Message:\n';

export type VaultDeviceRole = 'wallet' | 'key';

export interface VaultDescriptorMember {
  wkIdentity: string;
  walletPubKey: string;
  keyPubKey: string;
  xpubWallet: string | null;
  xpubKey: string | null;
  walletXpubSignature: string | null;
  keyXpubSignature: string | null;
}

export interface VaultDescriptorV1 {
  v: 1;
  orgId: string;
  vaultId: string;
  orgIndex: number;
  vaultIndex: number;
  chain: string;
  signingMode: string | null;
  requiredSigners: number;
  members: VaultDescriptorMember[];
}

export type VaultDescriptorErrorCode =
  | 'missing'
  | 'malformed'
  | 'hash_mismatch'
  | 'unsupported'
  | 'identity_invalid'
  | 'attestation_invalid'
  | 'not_member'
  | 'xpub_mismatch'
  | 'request_mismatch'
  | 'pin_mismatch'
  | 'not_pinned'
  | 'pin_storage'
  | 'derivation_mismatch';

export class VaultDescriptorError extends Error {
  readonly code: VaultDescriptorErrorCode;

  constructor(code: VaultDescriptorErrorCode, message: string) {
    super(message);
    this.name = 'VaultDescriptorError';
    this.code = code;
  }
}

function fail(code: VaultDescriptorErrorCode, message: string): never {
  throw new VaultDescriptorError(code, message);
}

// ---------------------------------------------------------------------------
// Canonical JSON + hash (mirrored byte-for-byte on SSP Key / relay-enterprise)
// ---------------------------------------------------------------------------

/**
 * Keys in EXACTLY the contract order, members in descriptor order, no
 * whitespace, standard JSON escaping, `null` for a missing value.
 */
export function canonicalVaultDescriptorJson(d: VaultDescriptorV1): string {
  const orNull = <T>(value: T | null | undefined): T | null =>
    value === undefined ? null : value;
  return JSON.stringify({
    v: d.v,
    orgId: d.orgId,
    vaultId: d.vaultId,
    orgIndex: d.orgIndex,
    vaultIndex: d.vaultIndex,
    chain: d.chain,
    signingMode: orNull(d.signingMode),
    requiredSigners: d.requiredSigners,
    members: d.members.map((m) => ({
      wkIdentity: m.wkIdentity,
      walletPubKey: m.walletPubKey,
      keyPubKey: m.keyPubKey,
      xpubWallet: orNull(m.xpubWallet),
      xpubKey: orNull(m.xpubKey),
      walletXpubSignature: orNull(m.walletXpubSignature),
      keyXpubSignature: orNull(m.keyXpubSignature),
    })),
  });
}

/** sha256 hex (lowercase) of the canonical JSON's UTF-8 bytes. */
export function computeVaultDescriptorHash(d: VaultDescriptorV1): string {
  const digest = sha256(
    new TextEncoder().encode(canonicalVaultDescriptorJson(d)),
  );
  return Buffer.from(digest).toString('hex');
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

const DESCRIPTOR_KEYS = [
  'v',
  'orgId',
  'vaultId',
  'orgIndex',
  'vaultIndex',
  'chain',
  'signingMode',
  'requiredSigners',
  'members',
] as const;

const MEMBER_KEYS = [
  'wkIdentity',
  'walletPubKey',
  'keyPubKey',
  'xpubWallet',
  'xpubKey',
  'walletXpubSignature',
  'keyXpubSignature',
] as const;

/**
 * org/vault ids: lowercase 24-hex Mongo ObjectIds (shared vectors rule). Also
 * keeps ':' out of the pin key `${orgId}:${vaultId}`.
 */
const ID_PATTERN = /^[0-9a-f]{24}$/;
const COMPRESSED_PUBKEY_PATTERN = /^0[23][0-9a-fA-F]{64}$/;
/** Generous bound: a Solana member xpub is a JSON array of 20 pubkeys. */
const MAX_XPUB_LENGTH = 2000;
const MAX_SIGNATURE_LENGTH = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail('malformed', `${where}: unexpected field "${key}"`);
    }
  }
}

function nullableString(
  value: unknown,
  maxLength: number,
  where: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0) {
    fail('malformed', `${where} must be a non-empty string or null`);
  }
  if (value.length > maxLength) fail('malformed', `${where} is too long`);
  return value;
}

/** Chain family as relay-enterprise vaultAddressService branches on it. */
export type VaultChainFamily = 'utxo' | 'evm' | 'sol';

export function vaultChainFamily(chain: string): VaultChainFamily | null {
  const config = (blockchains as Record<string, { chainType?: string }>)[chain];
  if (!config) return null;
  if (config.chainType === 'evm') return 'evm';
  if (config.chainType === 'sol') return 'sol';
  if (config.chainType && config.chainType !== 'utxo') return null;
  return 'utxo';
}

/**
 * Validate the transported descriptor and return it typed (missing optional
 * values normalised to null). Unknown fields are refused so that what is
 * hashed is exactly what is used.
 */
export function parseVaultDescriptor(raw: unknown): VaultDescriptorV1 {
  if (raw === undefined || raw === null) {
    fail('missing', VAULT_DESCRIPTOR_MISSING_MESSAGE);
  }
  if (!isPlainObject(raw)) fail('malformed', 'descriptor is not an object');
  assertOnlyKeys(raw, DESCRIPTOR_KEYS, 'descriptor');
  if (raw.v !== 1) fail('unsupported', 'unsupported descriptor version');
  if (typeof raw.orgId !== 'string' || !ID_PATTERN.test(raw.orgId)) {
    fail('malformed', 'orgId is invalid');
  }
  if (typeof raw.vaultId !== 'string' || !ID_PATTERN.test(raw.vaultId)) {
    fail('malformed', 'vaultId is invalid');
  }
  if (!isValidEnterpriseOrgIndex(raw.orgIndex)) {
    fail('malformed', 'orgIndex must be an integer in 100-99999');
  }
  if (!isValidChildIndex(raw.vaultIndex)) {
    fail('malformed', 'vaultIndex must be an integer in [0, 2^31)');
  }
  if (typeof raw.chain !== 'string' || !vaultChainFamily(raw.chain)) {
    fail('unsupported', `unsupported chain ${String(raw.chain)}`);
  }
  const signingMode = nullableString(raw.signingMode, 32, 'signingMode');
  if (
    typeof raw.requiredSigners !== 'number' ||
    !Number.isInteger(raw.requiredSigners)
  ) {
    fail('malformed', 'requiredSigners must be an integer');
  }
  if (!Array.isArray(raw.members) || raw.members.length === 0) {
    fail('malformed', 'members must be a non-empty array');
  }
  if (raw.members.length > 64) fail('malformed', 'too many members');
  const members = raw.members.map(
    (entry: unknown, i): VaultDescriptorMember => {
      const where = `members[${i}]`;
      if (!isPlainObject(entry)) fail('malformed', `${where} is not an object`);
      assertOnlyKeys(entry, MEMBER_KEYS, where);
      if (
        typeof entry.wkIdentity !== 'string' ||
        entry.wkIdentity.length < 14 ||
        entry.wkIdentity.length > 100
      ) {
        fail('malformed', `${where}.wkIdentity is invalid`);
      }
      if (
        typeof entry.walletPubKey !== 'string' ||
        typeof entry.keyPubKey !== 'string'
      ) {
        fail('malformed', `${where} pubkeys must be strings`);
      }
      return {
        wkIdentity: entry.wkIdentity,
        walletPubKey: entry.walletPubKey,
        keyPubKey: entry.keyPubKey,
        xpubWallet: nullableString(
          entry.xpubWallet,
          MAX_XPUB_LENGTH,
          `${where}.xpubWallet`,
        ),
        xpubKey: nullableString(
          entry.xpubKey,
          MAX_XPUB_LENGTH,
          `${where}.xpubKey`,
        ),
        walletXpubSignature: nullableString(
          entry.walletXpubSignature,
          MAX_SIGNATURE_LENGTH,
          `${where}.walletXpubSignature`,
        ),
        keyXpubSignature: nullableString(
          entry.keyXpubSignature,
          MAX_SIGNATURE_LENGTH,
          `${where}.keyXpubSignature`,
        ),
      };
    },
  );
  return {
    v: 1,
    orgId: raw.orgId,
    vaultId: raw.vaultId,
    orgIndex: raw.orgIndex,
    vaultIndex: raw.vaultIndex,
    chain: raw.chain,
    signingMode,
    requiredSigners: raw.requiredSigners,
    members,
  };
}

// ---------------------------------------------------------------------------
// Signing modes and signer limits (relay-enterprise vaultService)
// ---------------------------------------------------------------------------

const UTXO_EVM_MODES = new Set(['dual', 'key_only', 'wallet_only']);
const SOL_MODES = new Set(['sol_dual', 'sol_single']);

// vaultService: MAX_SIGNERS_DUAL_UTXO 7, MAX_SIGNERS_DUAL_EVM 4,
// MAX_SIGNERS_SINGLE_EVM 8, MAX_SIGNERS_SINGLE_UTXO 15, MAX_SIGNERS_SOL 15.
const MAX_SIGNERS = {
  utxo: { dual: 7, single: 15 },
  evm: { dual: 4, single: 8 },
  sol: 15,
} as const;

/**
 * Is `mode` valid for the chain family? The descriptor always carries the
 * EFFECTIVE mode: relay-enterprise normalises a dual vault's absent mode to
 * 'dual' (vectors descriptorFieldRules), so null / absent is refused here,
 * exactly as SSP Key refuses it.
 */
export function isValidSigningMode(
  family: VaultChainFamily,
  mode: string | null,
): boolean {
  if (mode === null) return false;
  if (family === 'sol') return SOL_MODES.has(mode);
  return UTXO_EVM_MODES.has(mode);
}

/** Single-device mode: one key per signer, threshold M (not 2M). */
export function isSingleDeviceMode(mode: string | null): boolean {
  return mode === 'key_only' || mode === 'wallet_only' || mode === 'sol_single';
}

/** Does the signing mode use this device role's xpub? */
export function modeUsesRole(
  mode: string | null,
  role: VaultDeviceRole,
): boolean {
  if (role === 'wallet') return mode !== 'key_only';
  return mode !== 'wallet_only' && mode !== 'sol_single';
}

export function maxSignersFor(
  family: VaultChainFamily,
  mode: string | null,
): number {
  if (family === 'sol') return MAX_SIGNERS.sol;
  const limits = MAX_SIGNERS[family];
  return isSingleDeviceMode(mode) ? limits.single : limits.dual;
}

/** Human label of the signing mode (display only). */
export function signingModeLabel(mode: string | null): string {
  switch (mode) {
    case null:
    case 'dual':
    case 'sol_dual':
      return 'wallet + key';
    case 'key_only':
      return 'key only';
    case 'wallet_only':
    case 'sol_single':
      return 'wallet only';
    default:
      return mode;
  }
}

// ---------------------------------------------------------------------------
// Identity + attestations
// ---------------------------------------------------------------------------

export function isValidCompressedPubKeyHex(value: unknown): value is string {
  if (typeof value !== 'string' || !COMPRESSED_PUBKEY_PATTERN.test(value)) {
    return false;
  }
  try {
    secp256k1.Point.fromHex(value.toLowerCase());
    return true;
  } catch {
    return false;
  }
}

/** Bitcoin network of a WK identity, by its bech32 prefix (relay rules). */
function wkIdentityNetwork(
  wkIdentity: string,
): typeof utxolib.networks.bitcoin | null {
  if (wkIdentity.startsWith('bc1')) return utxolib.networks.bitcoin;
  if (wkIdentity.startsWith('tb1')) return utxolib.networks.testnet;
  return null;
}

/**
 * The WK identity of a (wallet, key) identity pubkey pair: P2WSH of
 * OP_2 <sorted pk> <sorted pk> OP_2 OP_CHECKMULTISIG — how the wallet builds
 * it (generateMultisigAddress at /10/0, BIP67 order).
 */
export function wkIdentityOfPubKeys(
  walletPubKey: string,
  keyPubKey: string,
  network: typeof utxolib.networks.bitcoin,
): string {
  const sorted = [walletPubKey.toLowerCase(), keyPubKey.toLowerCase()].sort();
  const witnessScript = utxolib.script.multisig.output.encode(
    2,
    sorted.map((hex) => Buffer.from(hex, 'hex')),
  );
  const scriptPubKey = utxolib.script.witnessScriptHash.output.encode(
    utxolib.crypto.sha256(witnessScript),
  );
  return utxolib.address.fromOutputScript(scriptPubKey, network);
}

/** The message relay-enterprise `submitXpub` verifies for each xpub. */
export function vaultXpubAttestationMessage(
  role: VaultDeviceRole,
  xpub: string,
  chain: string,
  orgIndex: number,
): string {
  return `SSP_VAULT_XPUB:${role}:${xpub}:${chain}:${String(orgIndex)}`;
}

function verifyAttestation(
  member: VaultDescriptorMember,
  role: VaultDeviceRole,
  d: VaultDescriptorV1,
  where: string,
): void {
  const xpub = role === 'wallet' ? member.xpubWallet : member.xpubKey;
  const signature =
    role === 'wallet' ? member.walletXpubSignature : member.keyXpubSignature;
  const signer = role === 'wallet' ? member.walletPubKey : member.keyPubKey;
  if (!xpub) fail('malformed', `${where}: ${role} xpub is missing`);
  if (!signature) {
    fail(
      'attestation_invalid',
      `${where}: ${role} xpub attestation is missing`,
    );
  }
  const valid = verifyMessageSignature({
    message: vaultXpubAttestationMessage(role, xpub, d.chain, d.orgIndex),
    signature,
    expectedPubKeyHex: signer.toLowerCase(),
    messagePrefixes: [VAULT_ATTESTATION_MESSAGE_PREFIX],
  });
  if (!valid) {
    fail(
      'attestation_invalid',
      `${where}: ${role} xpub attestation does not verify`,
    );
  }
}

/**
 * The leaves of a Solana member "xpub" (a JSON array of base58 pubkeys), for
 * the reuse check. Their format (20 canonical keys) is checked at derivation.
 */
function solanaLeaves(xpub: string, where: string): string[] {
  let leaves: unknown;
  try {
    leaves = JSON.parse(xpub);
  } catch {
    fail('malformed', `${where} is not a Solana pubkey array`);
  }
  if (
    !Array.isArray(leaves) ||
    leaves.length === 0 ||
    !leaves.every((leaf) => typeof leaf === 'string' && leaf.length > 0)
  ) {
    fail('malformed', `${where} is not a Solana pubkey array`);
  }
  return leaves as string[];
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerifiedVaultDescriptor {
  descriptor: VaultDescriptorV1;
  hash: string;
  family: VaultChainFamily;
  /** M (as stored). */
  requiredSigners: number;
  /** N. */
  totalSigners: number;
  ownMemberIndex: number;
}

/**
 * VD-3 checks 1-5. Throws VaultDescriptorError on the first failure. The pin
 * (check 6) is applied by the caller with vaultPins.
 *
 * @param ownAccountXpub this device's own account xpub at
 *   m/48'/coin'/orgIndex'/scriptType' (Solana: the JSON pubkey array at the
 *   vault's HD slot), computed on this device — never taken from a request.
 */
export function verifyVaultDescriptor(
  rawDescriptor: unknown,
  hash: unknown,
  ownWkIdentity: string,
  ownRole: VaultDeviceRole,
  ownAccountXpub: string,
): VerifiedVaultDescriptor {
  if (
    rawDescriptor === undefined ||
    rawDescriptor === null ||
    hash === undefined ||
    hash === null ||
    hash === ''
  ) {
    fail('missing', VAULT_DESCRIPTOR_MISSING_MESSAGE);
  }
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    fail(
      'malformed',
      'vaultDescriptorHash must be 64 lowercase hex characters',
    );
  }
  const d = parseVaultDescriptor(rawDescriptor);

  // 1. Hash.
  if (computeVaultDescriptorHash(d) !== hash) {
    fail('hash_mismatch', 'vault descriptor hash does not match its content');
  }

  // 2. Shape.
  const family = vaultChainFamily(d.chain);
  if (!family) fail('unsupported', `unsupported chain ${d.chain}`);
  if (!isValidSigningMode(family, d.signingMode)) {
    fail(
      'unsupported',
      `signing mode ${String(d.signingMode)} is not valid on ${d.chain}`,
    );
  }
  const n = d.members.length;
  if (n > maxSignersFor(family, d.signingMode)) {
    fail('malformed', `${n} signers exceed the limit for this vault type`);
  }
  if (d.requiredSigners < 1 || d.requiredSigners > n) {
    fail('malformed', `requiredSigners ${d.requiredSigners} is not in 1..${n}`);
  }
  if (family === 'sol') {
    // validateSolanaCaps: N in [2,15], M in [2,N]; the vault PDA seed is a u8.
    if (n < 2 || d.requiredSigners < 2) {
      fail(
        'malformed',
        'Solana vaults need at least 2 signers and threshold 2',
      );
    }
    if (d.vaultIndex > 255) {
      fail('malformed', 'Solana vaultIndex must be at most 255');
    }
  }
  for (let i = 1; i < n; i++) {
    if (!(d.members[i - 1].wkIdentity < d.members[i].wkIdentity)) {
      fail('malformed', 'members are not sorted and unique by wkIdentity');
    }
  }

  // 3. Each member's identity.
  d.members.forEach((m, i) => {
    const where = `members[${i}]`;
    if (
      !isValidCompressedPubKeyHex(m.walletPubKey) ||
      !isValidCompressedPubKeyHex(m.keyPubKey)
    ) {
      fail(
        'identity_invalid',
        `${where}: identity pubkeys are not valid compressed keys`,
      );
    }
    if (m.walletPubKey.toLowerCase() === m.keyPubKey.toLowerCase()) {
      fail(
        'identity_invalid',
        `${where}: wallet and key pubkeys are identical`,
      );
    }
    const network = wkIdentityNetwork(m.wkIdentity);
    if (!network) {
      fail('identity_invalid', `${where}: unsupported WK identity network`);
    }
    let derived: string;
    try {
      derived = wkIdentityOfPubKeys(m.walletPubKey, m.keyPubKey, network);
    } catch {
      fail('identity_invalid', `${where}: WK identity could not be derived`);
    }
    if (derived !== m.wkIdentity) {
      fail(
        'identity_invalid',
        `${where}: WK identity does not match its pubkeys`,
      );
    }
  });

  // 4. Every xpub the mode uses is present and attested by its member, and
  //    no vault key is used twice (a member attesting another member's xpub,
  //    or a Solana leaf reused): refused exactly as SSP Key refuses it.
  const usedXpubs = new Set<string>();
  const usedSolanaLeaves = new Set<string>();
  d.members.forEach((m, i) => {
    const where = `members[${i}]`;
    for (const role of ['wallet', 'key'] as const) {
      if (!modeUsesRole(d.signingMode, role)) continue;
      verifyAttestation(m, role, d, where);
      const xpub = (role === 'wallet' ? m.xpubWallet : m.xpubKey) as string;
      if (usedXpubs.has(xpub)) {
        fail('malformed', `${where}: ${role} xpub reuses another vault key`);
      }
      usedXpubs.add(xpub);
      if (family === 'sol') {
        for (const leaf of solanaLeaves(xpub, `${where}.${role} xpub`)) {
          if (usedSolanaLeaves.has(leaf)) {
            fail('malformed', `${where}: ${role} xpub reuses a Solana key`);
          }
          usedSolanaLeaves.add(leaf);
        }
      }
    }
  });

  // 5. Own entry.
  const ownMemberIndex = d.members.findIndex(
    (m) => m.wkIdentity === ownWkIdentity,
  );
  if (!ownWkIdentity || ownMemberIndex === -1) {
    fail('not_member', 'this wallet is not a signer of the vault');
  }
  const own = d.members[ownMemberIndex];
  const ownXpub = ownRole === 'wallet' ? own.xpubWallet : own.xpubKey;
  if (modeUsesRole(d.signingMode, ownRole) || ownXpub !== null) {
    if (!ownAccountXpub || ownXpub !== ownAccountXpub) {
      fail(
        'xpub_mismatch',
        `the vault's ${ownRole} xpub for this signer is not this device's own xpub`,
      );
    }
  }

  return {
    descriptor: d,
    hash,
    family,
    requiredSigners: d.requiredSigners,
    totalSigners: n,
    ownMemberIndex,
  };
}

/**
 * VD-4: a request may only act on the account of the pinned vault. A request
 * that names a signing mode must name the vault's (SSP Key applies the same
 * rule); one that names none takes the descriptor's.
 */
export function assertRequestMatchesDescriptor(
  d: VaultDescriptorV1,
  request: {
    chain: string;
    orgIndex: number;
    vaultIndex: number;
    signingMode?: string | null;
  },
): void {
  if (
    request.chain !== d.chain ||
    request.orgIndex !== d.orgIndex ||
    request.vaultIndex !== d.vaultIndex
  ) {
    fail(
      'request_mismatch',
      `request (${request.chain}, org ${String(request.orgIndex)}, vault ${String(
        request.vaultIndex,
      )}) does not belong to the verified vault (${d.chain}, org ${String(
        d.orgIndex,
      )}, vault ${String(d.vaultIndex)})`,
    );
  }
  const mode = request.signingMode;
  if (mode !== undefined && mode !== null && mode !== '') {
    if (mode !== d.signingMode) {
      fail(
        'request_mismatch',
        `request signing mode ${mode} is not the vault's (${String(d.signingMode)})`,
      );
    }
  }
}

/** Shortened identity for display: first 10 … last 8. */
export function shortWkIdentity(wkIdentity: string): string {
  return wkIdentity.length > 22
    ? `${wkIdentity.slice(0, 10)}…${wkIdentity.slice(-8)}`
    : wkIdentity;
}
