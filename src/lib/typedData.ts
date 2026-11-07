import { ethers } from 'ethers';

/**
 * EIP-712 typed data (eth_signTypedData_v3 / _v4) for the 2-of-2 Schnorr
 * account. The SSP account's ERC-1271 isValidSignature verifies the Schnorr
 * signature over the raw 32-byte digest, so both devices sign
 * TypedDataEncoder.hash(domain, types, message) with signMultiSigHash.
 *
 * SSP Key receives the canonical JSON built by serializeTypedData and
 * recomputes the digest from it with the same rules (ssp-key
 * src/lib/typedData.ts), so the digest is never taken on trust.
 */

export interface TypedDataField {
  name: string;
  type: string;
}

export interface Eip712Payload {
  domain: Record<string, unknown>;
  /** Types reachable from primaryType, without EIP712Domain. */
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export type TypedDataRisk = 'approval' | 'order' | null;

// EIP-712 domain fields in the order the domain separator encodes them.
const DOMAIN_FIELDS = [
  'name',
  'version',
  'chainId',
  'verifyingContract',
  'salt',
] as const;

const MAX_TYPED_DATA_LENGTH = 64 * 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function baseType(type: string): string {
  const bracket = type.indexOf('[');
  return bracket === -1 ? type : type.slice(0, bracket);
}

function parseTypes(raw: unknown): Record<string, TypedDataField[]> {
  if (!isPlainObject(raw)) {
    throw new Error('Typed data has no types');
  }
  const types: Record<string, TypedDataField[]> = {};
  for (const [typeName, fields] of Object.entries(raw)) {
    if (!Array.isArray(fields)) {
      throw new Error(`Typed data type ${typeName} is not a field list`);
    }
    types[typeName] = fields.map((field: unknown) => {
      if (
        !isPlainObject(field) ||
        typeof field.name !== 'string' ||
        typeof field.type !== 'string'
      ) {
        throw new Error(`Typed data type ${typeName} has an invalid field`);
      }
      return { name: field.name, type: field.type };
    });
  }
  return types;
}

/**
 * The struct types primaryType depends on. Unused types are dropped: ethers
 * refuses them, while eth_signTypedData_v4 ignores them, and neither changes
 * the digest.
 */
function reachableTypes(
  types: Record<string, TypedDataField[]>,
  primaryType: string,
): Record<string, TypedDataField[]> {
  const out: Record<string, TypedDataField[]> = {};
  const queue = [primaryType];
  while (queue.length) {
    const name = queue.shift() as string;
    if (out[name]) continue;
    const fields = types[name];
    if (!fields) {
      throw new Error(`Typed data type ${name} is not defined`);
    }
    out[name] = fields;
    for (const field of fields) {
      const base = baseType(field.type);
      if (types[base] && !out[base]) queue.push(base);
    }
  }
  return out;
}

/**
 * The domain as ethers encodes it. When the dApp declares EIP712Domain its
 * fields must be exactly the domain's keys in canonical order: a different
 * field set or order would make the dApp hash another separator than ours.
 */
function parseDomain(
  raw: unknown,
  declared: TypedDataField[] | undefined,
): Record<string, unknown> {
  if (!isPlainObject(raw)) {
    throw new Error('Typed data has no domain');
  }
  const domain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (!(DOMAIN_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`Typed data domain has an unknown field ${key}`);
    }
    domain[key] = value;
  }
  if (declared) {
    const expected = DOMAIN_FIELDS.filter((key) => key in domain);
    const names = declared.map((field) => field.name);
    if (
      names.length !== expected.length ||
      names.some((name, i) => name !== expected[i])
    ) {
      throw new Error('Typed data EIP712Domain does not match its domain');
    }
  }
  return domain;
}

/**
 * Parse an eth_signTypedData_v3 / _v4 payload (a JSON string or an object).
 * Throws when it is malformed or ethers cannot hash it.
 */
export function parseTypedData(raw: unknown): Eip712Payload {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_TYPED_DATA_LENGTH) {
      throw new Error('Typed data is too large');
    }
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('Typed data is not valid JSON');
    }
  }
  if (!isPlainObject(value)) {
    throw new Error('Typed data is not an object');
  }
  if (typeof value.primaryType !== 'string' || !value.primaryType) {
    throw new Error('Typed data has no primaryType');
  }
  if (value.primaryType === 'EIP712Domain') {
    throw new Error('Typed data must not sign the domain itself');
  }
  if (!isPlainObject(value.message)) {
    throw new Error('Typed data has no message');
  }
  const allTypes = parseTypes(value.types);
  const domain = parseDomain(value.domain, allTypes.EIP712Domain);
  const types = reachableTypes(allTypes, value.primaryType);
  if (types.EIP712Domain) {
    throw new Error('Typed data must not reference EIP712Domain');
  }
  const payload: Eip712Payload = {
    domain,
    types,
    primaryType: value.primaryType,
    message: value.message,
  };
  typedDataDigest(payload); // throws on anything ethers cannot encode
  return payload;
}

/** EIP-712 digest: keccak256(0x1901 ‖ domainSeparator ‖ hashStruct). */
export function typedDataDigest(payload: Eip712Payload): string {
  return ethers.TypedDataEncoder.hash(
    payload.domain,
    payload.types,
    payload.message,
  );
}

/** Canonical JSON sent to SSP Key as the signing request's data. */
export function serializeTypedData(payload: Eip712Payload): string {
  return JSON.stringify({
    domain: payload.domain,
    types: payload.types,
    primaryType: payload.primaryType,
    message: payload.message,
  });
}

/** domain.chainId as a decimal string, or null when the domain has none. */
export function typedDataChainId(payload: Eip712Payload): string | null {
  const chainId = payload.domain.chainId;
  if (chainId === undefined) return null;
  try {
    return ethers.toBigInt(chainId as ethers.BigNumberish).toString();
  } catch {
    throw new Error('Typed data domain has an invalid chainId');
  }
}

/**
 * What the signature can authorise, for the warning shown before signing.
 * 'approval': a permit-style allowance (EIP-2612, Permit2, DAI permit) —
 * lets the spender move tokens without another confirmation.
 * 'order': a marketplace / DEX order that can transfer assets when filled.
 */
export function typedDataRisk(payload: Eip712Payload): TypedDataRisk {
  const primary = payload.primaryType.toLowerCase();
  const fields = (payload.types[payload.primaryType] ?? []).map((field) =>
    field.name.toLowerCase(),
  );
  if (
    primary.includes('permit') ||
    fields.includes('spender') ||
    fields.includes('allowed')
  ) {
    return 'approval';
  }
  if (primary.includes('order') || fields.includes('offer')) {
    return 'order';
  }
  return null;
}
