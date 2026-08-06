/**
 * Verifying SSP Key's recovery account xpub.
 *
 * The xpub is fetched from the relay (GET /v1/recoverypub), which is storage
 * only. SSP Key signs the value with its identity key at /10/0; the wallet
 * already derives that key's public half from `xpubKeyIdentity` — it is the
 * same key that forms wkIdentity — so it can check the signature itself and
 * treat the relay as untrusted.
 *
 * Bitcoin signed-message format, matching what ssp-key's `signMessage` (and the
 * relay's own verifier) produce:
 *
 *   digest    = sha256(sha256(prefixBytes || varint(len(msg)) || msgBytes))
 *   signature = base64( [header:1] [r:32] [s:32] )
 *   header    = 27 + recoveryId + 4   (SSP always uses compressed keys)
 *
 * `messagePrefix` in the chain config already carries its own length byte
 * (e.g. '\x18Bitcoin Signed Message:\n'), so it is written out verbatim.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';

/**
 * The exact bytes both sides sign and verify. Kept byte-identical to ssp-key's
 * copy in lib/recoveryPublish.ts.
 */
export function recoveryXpubMessage(
  wkIdentity: string,
  recoveryXpub: string,
): string {
  return `ssp-recovery-xpub\n${wkIdentity}\n${recoveryXpub}`;
}

/**
 * Byte helpers that avoid `Buffer` on the paths feeding @noble/*.
 *
 * @noble/hashes 2.x asserts a real same-realm `Uint8Array`, and a Node `Buffer`
 * fails that check under a jsdom/browser realm. Building the digest input from
 * plain `Uint8Array` keeps this working in every environment the SSP repos run
 * verification in.
 */
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

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/** base64 -> same-realm Uint8Array (never a Buffer, see latin1Bytes). */
function fromBase64(value: string): Uint8Array | null {
  try {
    return latin1Bytes(atob(value));
  } catch {
    return null;
  }
}

/** Bitcoin's CompactSize encoding, which is all a message length ever needs. */
function varint(value: number): Uint8Array {
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

/**
 * secp256k1 pubkey recovery, written against BOTH @noble/curves majors.
 *
 * v1 exposes `Signature.fromCompact` and `Point.toRawBytes`; v2 renamed these to
 * `Signature.fromBytes(bytes, 'compact')` and `Point.toBytes`. The SSP repos
 * currently resolve different majors and all of them have to keep verifying the
 * same signatures, so both shapes are handled rather than pinned to one.
 */
interface RecoverableSignature {
  addRecoveryBit: (recoveryId: number) => {
    recoverPublicKey: (digest: Uint8Array) => {
      toBytes?: (compressed: boolean) => Uint8Array;
      toRawBytes?: (compressed: boolean) => Uint8Array;
    };
  };
}

interface SignatureFactory {
  fromCompact?: (bytes: Uint8Array) => RecoverableSignature;
  fromBytes?: (bytes: Uint8Array, format?: string) => RecoverableSignature;
}

function recoverCompressedPubKeyHex(
  compactSignature: Uint8Array,
  recoveryId: number,
  digest: Uint8Array,
): string | null {
  // Narrow cast rather than `any`: the two majors genuinely differ in shape and
  // only these members are touched.
  const factory = secp256k1.Signature as unknown as SignatureFactory;
  const signature = factory.fromCompact
    ? factory.fromCompact(compactSignature)
    : factory.fromBytes?.(compactSignature, 'compact');
  if (!signature) return null;

  const point = signature.addRecoveryBit(recoveryId).recoverPublicKey(digest);
  const bytes = point.toBytes ? point.toBytes(true) : point.toRawBytes?.(true);
  if (!bytes) return null;
  return toHex(bytes);
}

function magicHash(message: string, messagePrefix: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(message);
  return sha256(
    sha256(
      concatBytes(
        latin1Bytes(messagePrefix),
        varint(messageBytes.length),
        messageBytes,
      ),
    ),
  );
}

/**
 * Recover the signing pubkey from a base64 Bitcoin signed message and compare
 * it to the expected one.
 *
 * @param expectedPubKeyHex hex, 33-byte compressed — ssp-key's /10/0 pubkey as
 *   the wallet derives it, NOT anything the relay supplied.
 * @returns true only when the signature verifies against that exact key.
 */
export function verifyRecoveryXpubSignature(params: {
  wkIdentity: string;
  recoveryXpub: string;
  signature: string;
  expectedPubKeyHex: string;
  identityChain: keyof cryptos;
}): boolean {
  const {
    wkIdentity,
    recoveryXpub,
    signature,
    expectedPubKeyHex,
    identityChain,
  } = params;
  try {
    if (!signature || !expectedPubKeyHex) return false;

    const raw = fromBase64(signature);
    if (!raw || raw.length !== 65) return false;

    const header = raw[0];
    // 27..30 uncompressed, 31..34 compressed. SSP only ever signs compressed,
    // so anything outside that range is not one of ours.
    if (header < 31 || header > 34) return false;
    const recoveryId = header - 31;

    const digest = magicHash(
      recoveryXpubMessage(wkIdentity, recoveryXpub),
      blockchains[identityChain].messagePrefix,
    );

    const recoveredHex = recoverCompressedPubKeyHex(
      raw.subarray(1),
      recoveryId,
      digest,
    );
    if (!recoveredHex) return false;

    return recoveredHex.toLowerCase() === expectedPubKeyHex.toLowerCase();
  } catch (error) {
    console.log('[recovery] xpub signature check failed:', error);
    return false;
  }
}
