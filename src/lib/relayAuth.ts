/**
 * Relay Authentication Utility for SSP Wallet
 *
 * Provides functions to create authenticated requests for the SSP Relay.
 * All relay endpoints require Bitcoin signature-based authentication.
 */

import { fluxnode } from '@runonflux/flux-sdk';
import { randomBytes, createHash } from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { wifToPrivateKey } from './wallet';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';

/**
 * Compute SHA256 hash of request body for signing.
 * This binds the signature to the actual request data.
 *
 * @param body - The request body to hash
 * @returns Hex-encoded SHA256 hash
 */
export function computeBodyHash(body: Record<string, unknown>): string {
  const jsonString = JSON.stringify(body);
  return createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Signature payload structure for relay authentication.
 */
export interface SignaturePayload {
  timestamp: number;
  action: 'sync' | 'action' | 'token' | 'join' | 'read';
  identity: string;
  nonce: string;
  data?: string;
}

/**
 * Authentication fields to include in relay requests.
 */
export interface AuthFields {
  signature: string;
  message: string;
  publicKey: string;
  witnessScript?: string;
}

/**
 * Generate a random 32-byte nonce as hex string.
 */
export function generateNonce(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create the signature payload for a relay request.
 *
 * @param action - The action type (sync, action, token, join)
 * @param identity - The identity being authenticated
 * @param dataHash - Optional hash of request body
 * @returns The signature payload object
 */
export function createSignaturePayload(
  action: SignaturePayload['action'],
  identity: string,
  dataHash?: string,
): SignaturePayload {
  return {
    timestamp: Date.now(),
    action,
    identity,
    nonce: generateNonce(),
    ...(dataHash && { data: dataHash }),
  };
}

/**
 * Sign a message using the wallet's identity keypair.
 *
 * @param message - The message to sign
 * @param privateKeyWIF - Private key in WIF format
 * @param chain - The blockchain for message prefix
 * @returns Base64-encoded signature
 */
export function signMessage(
  message: string,
  privateKeyWIF: string,
  chain: keyof cryptos = 'btc',
): string {
  const blockchainConfig = blockchains[chain];
  const isCompressed = true; // SSP always uses compressed keys
  const privateKeyHex = wifToPrivateKey(privateKeyWIF, chain);
  const messagePrefix = blockchainConfig.messagePrefix;

  // Sign with extra entropy for non-deterministic signatures
  const signature = fluxnode.signMessage(
    message,
    privateKeyHex,
    isCompressed,
    messagePrefix,
    { extraEntropy: randomBytes(32) },
  );

  return signature;
}

/**
 * Add authentication fields to a request body.
 *
 * @param body - The original request body
 * @param authFields - The authentication fields
 * @returns The request body with auth fields added
 */
export function addAuthToRequest<T extends Record<string, unknown>>(
  body: T,
  authFields: AuthFields,
): T & AuthFields {
  return {
    ...body,
    ...authFields,
  };
}

// ---------------------------------------------------------------------------
// Authenticated GET reads (security fix contract RA-4)
// ---------------------------------------------------------------------------

/** Header names the relay's `requireReadAuth` middleware reads. */
export const READ_AUTH_HEADERS = {
  signature: 'x-ssp-signature',
  message: 'x-ssp-message',
  publicKey: 'x-ssp-publickey',
  witnessScript: 'x-ssp-witnessscript',
} as const;

export type ReadAuthHeaders = Record<string, string>;

/**
 * The request path a read signature binds: the URL path without the query
 * string, exactly as the relay sees it (e.g. `/v1/action/bc1q…`).
 */
export function readAuthPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    const withoutQuery = url.split('?')[0].split('#')[0];
    return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  }
}

/** sha256 hex of the UTF-8 string `GET <path>` — the payload's `data` field. */
export function readAuthDataHash(path: string): string {
  return createHash('sha256').update(`GET ${path}`, 'utf8').digest('hex');
}

/**
 * Build the four read-auth headers for a GET of `url` as `identity`.
 *
 * `identity` is the `:id` path segment (wkIdentity for /v1/action, the wallet's
 * single-sig walletIdentity for /v1/sync). `witnessScript` is required for the
 * multisig wkIdentity and omitted for a single-sig identity. Signed with the
 * Bitcoin message prefix, like every other relay auth payload.
 */
export function createReadAuthHeaders(params: {
  identity: string;
  url: string;
  privateKeyWIF: string;
  publicKey: string;
  witnessScript?: string;
}): ReadAuthHeaders {
  const { identity, url, privateKeyWIF, publicKey, witnessScript } = params;
  const payload = createSignaturePayload(
    'read',
    identity,
    readAuthDataHash(readAuthPath(url)),
  );
  const message = JSON.stringify(payload);
  const signature = signMessage(message, privateKeyWIF, 'btc');
  const headers: ReadAuthHeaders = {
    [READ_AUTH_HEADERS.signature]: signature,
    [READ_AUTH_HEADERS.message]: message,
    [READ_AUTH_HEADERS.publicKey]: publicKey,
  };
  if (witnessScript) {
    headers[READ_AUTH_HEADERS.witnessScript] = witnessScript;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Bitcoin signed-message verification (no relay trust)
// ---------------------------------------------------------------------------

function latin1Bytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

function compactSize(value: number): Uint8Array {
  if (value < 0xfd) return Uint8Array.from([value]);
  if (value <= 0xffff) {
    return Uint8Array.from([0xfd, value & 0xff, (value >> 8) & 0xff]);
  }
  return Uint8Array.from([
    0xfe,
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

/** Bitcoin message digest: sha256d(prefix || varint(len) || utf8(message)). */
function messageDigest(message: string, messagePrefix: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(message);
  return sha256(
    sha256(
      concatBytes(
        latin1Bytes(messagePrefix),
        compactSize(messageBytes.length),
        messageBytes,
      ),
    ),
  );
}

interface RecoverableSignatureLike {
  addRecoveryBit: (recoveryId: number) => {
    recoverPublicKey: (digest: Uint8Array) => {
      toBytes?: (compressed: boolean) => Uint8Array;
      toRawBytes?: (compressed: boolean) => Uint8Array;
    };
  };
}

interface SignatureFactoryLike {
  fromCompact?: (bytes: Uint8Array) => RecoverableSignatureLike;
  fromBytes?: (bytes: Uint8Array, format?: string) => RecoverableSignatureLike;
}

/**
 * Verify a base64 Bitcoin signed message against an EXPECTED compressed
 * pubkey (hex). The expected key must come from the wallet's own state, never
 * from the payload being verified. Fails closed on any malformed input.
 *
 * @param messagePrefixes accepted message magics (e.g. the identity chain's
 *   and Bitcoin's). The signature must verify under one of them.
 */
export function verifyMessageSignature(params: {
  message: string;
  signature: string;
  expectedPubKeyHex: string;
  messagePrefixes: string[];
}): boolean {
  const { message, signature, expectedPubKeyHex, messagePrefixes } = params;
  try {
    if (
      typeof message !== 'string' ||
      typeof signature !== 'string' ||
      typeof expectedPubKeyHex !== 'string' ||
      !/^0[23][0-9a-fA-F]{64}$/.test(expectedPubKeyHex)
    ) {
      return false;
    }
    let raw: Uint8Array;
    try {
      raw = latin1Bytes(atob(signature));
    } catch {
      return false;
    }
    if (raw.length !== 65) return false;
    const header = raw[0];
    // SSP signs with compressed keys only: header 31..34.
    if (header < 31 || header > 34) return false;
    const recoveryId = header - 31;
    const factory = secp256k1.Signature as unknown as SignatureFactoryLike;
    const compact = raw.subarray(1);
    const sig = factory.fromCompact
      ? factory.fromCompact(compact)
      : factory.fromBytes?.(compact, 'compact');
    if (!sig) return false;
    const expected = expectedPubKeyHex.toLowerCase();
    for (const prefix of new Set(messagePrefixes)) {
      if (typeof prefix !== 'string' || !prefix) continue;
      try {
        const point = sig
          .addRecoveryBit(recoveryId)
          .recoverPublicKey(messageDigest(message, prefix));
        const bytes = point.toBytes
          ? point.toBytes(true)
          : point.toRawBytes?.(true);
        if (bytes && bytesToHex(bytes) === expected) return true;
      } catch {
        // not this prefix
      }
    }
    return false;
  } catch {
    return false;
  }
}
