/**
 * Recovery Envelope Cryptography
 *
 * Primitives for the ssp-key-based randomParams recovery envelope.
 * All operations use Node's `crypto` API (polyfilled in the browser via
 * crypto-browserify and in React Native via react-native-quick-crypto),
 * keeping the import surface consistent across wallet and key repos.
 *
 * Wire format (versioned, byte-layout stable across repos):
 *
 *   ECIES envelope blob (wallet localStorage):
 *     [1 byte version=0x01]
 *     [33 bytes pk_eph (compressed secp256k1 pubkey)]
 *     [12 bytes iv]
 *     [N bytes AES-256-GCM ciphertext]
 *     [16 bytes AES-256-GCM tag]
 *
 *   Transit-wrapped sk_r (ssp-key → wallet in recovery response):
 *     [1 byte version=0x01]
 *     [12 bytes iv]
 *     [32 bytes AES-256-GCM ciphertext of sk_r]
 *     [16 bytes AES-256-GCM tag]
 *
 * NOTE ON UPGRADES: the version bytes exist so future hardening (HKDF-SHA256
 * instead of the current sha256(label || shared), or AES-GCM AAD binding
 * the request context on transit) can ship with a clean on-the-wire bump.
 * Neither upgrade closes an exploitable gap under today's threat model;
 * both are "formal-audit polish" that can be deferred.
 */

import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createHash,
  randomBytes,
} from 'crypto';

export const ENVELOPE_VERSION = 0x01;
export const TRANSIT_VERSION = 0x01;

const KDF_INFO_BLOB = 'SSP-RECOVERY-BLOB-v1';
const KDF_INFO_TRANSIT = 'SSP-RECOVERY-TRANSIT-v1';

const PK_LEN = 33;
const IV_LEN = 12;
const TAG_LEN = 16;
const SK_LEN = 32;

/**
 * Derive a 32-byte symmetric AES key from an ECDH shared secret plus a
 * domain-separation label. Minimal KDF sufficient for our high-entropy
 * input (secp256k1 ECDH x-coord).
 */
function deriveSymmetricKey(sharedSecret: Buffer, info: string): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(info, 'utf8'), sharedSecret]))
    .digest();
}

/**
 * Compute the ECDH x-coordinate between `privKey` and `otherPubKey`.
 * Accepts 32-byte privKey and 33-byte compressed or 65-byte uncompressed pubKey.
 */
function ecdh(privKey: Buffer, otherPubKey: Buffer): Buffer {
  const dh = createECDH('secp256k1');
  dh.setPrivateKey(privKey);
  return dh.computeSecret(otherPubKey);
}

/**
 * Generate a fresh ephemeral secp256k1 keypair.
 * Returns { priv: 32-byte Buffer, pub: 33-byte compressed Buffer }.
 */
export function generateEphemeralKeypair(): { priv: Buffer; pub: Buffer } {
  const dh = createECDH('secp256k1');
  dh.generateKeys();
  return {
    priv: dh.getPrivateKey(),
    pub: dh.getPublicKey(null, 'compressed'),
  };
}

/**
 * 16-byte CSPRNG nonce for a recovery request. Carried in the outer JSON
 * request/response envelope for correlation — authenticity is enforced
 * by the AES-GCM tag over the ciphertext binding to the current session's
 * ephemeral ECDH key, not by the nonce alone.
 */
export function generateRecoveryNonce(): Buffer {
  return randomBytes(16);
}

/**
 * ECIES encrypt: seals `plaintext` so only the holder of the private key
 * matching `recipientPubKey` can decrypt. Used at setup time to wrap the
 * password-encrypted inner blob.
 *
 * @param recipientPubKey compressed (33-byte) or uncompressed secp256k1 pubkey
 * @param plaintext arbitrary bytes
 * @returns hex-encoded envelope bytes (see wire format at top of file)
 */
export function eciesEncrypt(
  recipientPubKey: Buffer,
  plaintext: Buffer,
): string {
  const eph = generateEphemeralKeypair();
  const shared = ecdh(eph.priv, recipientPubKey);
  const aesKey = deriveSymmetricKey(shared, KDF_INFO_BLOB);
  const iv = randomBytes(IV_LEN);

  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  eph.priv.fill(0);
  shared.fill(0);
  aesKey.fill(0);

  return Buffer.concat([
    Buffer.from([ENVELOPE_VERSION]),
    eph.pub,
    iv,
    ciphertext,
    tag,
  ]).toString('hex');
}

/**
 * ECIES decrypt: reverse of eciesEncrypt. Given the recipient's private key
 * and the hex-encoded envelope, return the plaintext.
 *
 * Throws if version is unknown, length is invalid, or AES-GCM tag fails.
 */
export function eciesDecrypt(
  recipientPrivKey: Buffer,
  envelopeHex: string,
): Buffer {
  const buf = Buffer.from(envelopeHex, 'hex');
  if (buf.length < 1 + PK_LEN + IV_LEN + TAG_LEN) {
    throw new Error('recovery envelope too short');
  }
  const version = buf[0];
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`unsupported envelope version ${version}`);
  }
  const pkEph = buf.subarray(1, 1 + PK_LEN);
  const iv = buf.subarray(1 + PK_LEN, 1 + PK_LEN + IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(1 + PK_LEN + IV_LEN, buf.length - TAG_LEN);

  const shared = ecdh(recipientPrivKey, pkEph);
  const aesKey = deriveSymmetricKey(shared, KDF_INFO_BLOB);

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  shared.fill(0);
  aesKey.fill(0);

  return plaintext;
}

/**
 * Transit-wrap sk_r for delivery to the wallet. Called on ssp-key side.
 *
 * Uses the ssp-key identity privkey (at m/48'/.../10/0) plus the wallet's
 * ephemeral pubkey to derive a shared key, then AES-GCM seals sk_r.
 * The envelope is addressed exclusively to whoever holds the matching
 * ephemeral private key — i.e., the wallet session that issued the request.
 */
export function wrapSkRForTransit(
  sspKeyIdentityPriv: Buffer,
  walletEphPub: Buffer,
  skR: Buffer,
): string {
  if (skR.length !== SK_LEN) {
    throw new Error(`sk_r must be ${SK_LEN} bytes, got ${skR.length}`);
  }
  const shared = ecdh(sspKeyIdentityPriv, walletEphPub);
  const aesKey = deriveSymmetricKey(shared, KDF_INFO_TRANSIT);
  const iv = randomBytes(IV_LEN);

  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(skR), cipher.final()]);
  const tag = cipher.getAuthTag();

  shared.fill(0);
  aesKey.fill(0);

  return Buffer.concat([
    Buffer.from([TRANSIT_VERSION]),
    iv,
    ciphertext,
    tag,
  ]).toString('hex');
}

/**
 * Unwrap a transit-wrapped sk_r on the wallet side.
 *
 * Uses the wallet's ephemeral privkey plus the ssp-key identity pubkey
 * (at m/48'/.../10/0) to derive the same shared key. Throws on tag failure
 * — caller should surface a generic recovery error to the user rather
 * than retrying blindly, since tag failure implies relay tampering.
 */
export function unwrapSkRFromTransit(
  walletEphPriv: Buffer,
  sspKeyIdentityPub: Buffer,
  wrappedHex: string,
): Buffer {
  const buf = Buffer.from(wrappedHex, 'hex');
  if (buf.length !== 1 + IV_LEN + SK_LEN + TAG_LEN) {
    throw new Error('recovery transit payload wrong length');
  }
  const version = buf[0];
  if (version !== TRANSIT_VERSION) {
    throw new Error(`unsupported transit version ${version}`);
  }
  const iv = buf.subarray(1, 1 + IV_LEN);
  const ciphertext = buf.subarray(1 + IV_LEN, 1 + IV_LEN + SK_LEN);
  const tag = buf.subarray(1 + IV_LEN + SK_LEN);

  const shared = ecdh(walletEphPriv, sspKeyIdentityPub);
  const aesKey = deriveSymmetricKey(shared, KDF_INFO_TRANSIT);

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  const skR = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  shared.fill(0);
  aesKey.fill(0);

  if (skR.length !== SK_LEN) {
    throw new Error(`decrypted sk_r wrong length: ${skR.length}`);
  }
  return skR;
}
