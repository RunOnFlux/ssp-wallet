// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';
import { createECDH, randomBytes } from 'crypto';

import {
  eciesEncrypt,
  eciesDecrypt,
  wrapSkRForTransit,
  unwrapSkRFromTransit,
  generateEphemeralKeypair,
  generateRecoveryNonce,
  ENVELOPE_VERSION,
  TRANSIT_VERSION,
} from '../../src/lib/recoveryCrypto';

function genKeypair() {
  const dh = createECDH('secp256k1');
  dh.generateKeys();
  return {
    priv: dh.getPrivateKey(),
    pub: dh.getPublicKey(null, 'compressed'),
  };
}

describe('recoveryCrypto', () => {
  describe('eciesEncrypt / eciesDecrypt', () => {
    it('round-trips a short plaintext', () => {
      const recipient = genKeypair();
      const pt = Buffer.from('hello ssp recovery', 'utf8');
      const env = eciesEncrypt(recipient.pub, pt);
      const decoded = eciesDecrypt(recipient.priv, env);
      expect(decoded.equals(pt)).toBe(true);
    });

    it('round-trips a realistic-size inner blob (passworder-like ~200 bytes)', () => {
      const recipient = genKeypair();
      const pt = randomBytes(210);
      const env = eciesEncrypt(recipient.pub, pt);
      const decoded = eciesDecrypt(recipient.priv, env);
      expect(decoded.equals(pt)).toBe(true);
    });

    it('produces different ciphertexts for same plaintext (random ephemeral)', () => {
      const recipient = genKeypair();
      const pt = Buffer.from('same plaintext');
      const a = eciesEncrypt(recipient.pub, pt);
      const b = eciesEncrypt(recipient.pub, pt);
      expect(a).not.toBe(b);
    });

    it('fails to decrypt with the wrong recipient key', () => {
      const intended = genKeypair();
      const attacker = genKeypair();
      const env = eciesEncrypt(intended.pub, Buffer.from('secret'));
      expect(() => eciesDecrypt(attacker.priv, env)).toThrow();
    });

    it('rejects tampered ciphertext (AES-GCM tag failure)', () => {
      const recipient = genKeypair();
      const env = eciesEncrypt(recipient.pub, Buffer.from('payload'));
      // Flip a byte deep inside the ciphertext region (skip past version+pubkey+iv).
      const buf = Buffer.from(env, 'hex');
      buf[50] ^= 0xff;
      expect(() => eciesDecrypt(recipient.priv, buf.toString('hex'))).toThrow();
    });

    it('rejects unknown version byte', () => {
      const recipient = genKeypair();
      const env = eciesEncrypt(recipient.pub, Buffer.from('x'));
      const buf = Buffer.from(env, 'hex');
      buf[0] = 0xff;
      expect(() => eciesDecrypt(recipient.priv, buf.toString('hex'))).toThrow(
        /unsupported envelope version/,
      );
    });

    it('rejects too-short envelope', () => {
      const recipient = genKeypair();
      expect(() => eciesDecrypt(recipient.priv, '0001')).toThrow(/too short/);
    });

    it('uses version byte 0x01', () => {
      const recipient = genKeypair();
      const env = eciesEncrypt(recipient.pub, Buffer.from('v'));
      expect(Buffer.from(env, 'hex')[0]).toBe(ENVELOPE_VERSION);
      expect(ENVELOPE_VERSION).toBe(0x01);
    });
  });

  describe('wrapSkRForTransit / unwrapSkRFromTransit', () => {
    it('round-trips a 32-byte sk_r between ssp-key and wallet sides', () => {
      const sspKey = genKeypair(); // plays the ssp-key /10/0 identity
      const walletEph = genKeypair(); // plays the wallet ephemeral

      const skR = randomBytes(32);
      const wrapped = wrapSkRForTransit(sspKey.priv, walletEph.pub, skR);
      const unwrapped = unwrapSkRFromTransit(
        walletEph.priv,
        sspKey.pub,
        wrapped,
      );

      expect(unwrapped.equals(skR)).toBe(true);
    });

    it('rejects a wrong-sized sk_r input', () => {
      const sspKey = genKeypair();
      const walletEph = genKeypair();
      expect(() =>
        wrapSkRForTransit(sspKey.priv, walletEph.pub, randomBytes(16)),
      ).toThrow(/sk_r must be 32 bytes/);
    });

    it('fails to unwrap with the wrong ephemeral key', () => {
      const sspKey = genKeypair();
      const wallet = genKeypair();
      const attacker = genKeypair();

      const wrapped = wrapSkRForTransit(
        sspKey.priv,
        wallet.pub,
        randomBytes(32),
      );
      expect(() =>
        unwrapSkRFromTransit(attacker.priv, sspKey.pub, wrapped),
      ).toThrow();
    });

    it('fails to unwrap with the wrong ssp-key identity pubkey', () => {
      const sspKey = genKeypair();
      const impostor = genKeypair();
      const wallet = genKeypair();

      const wrapped = wrapSkRForTransit(
        sspKey.priv,
        wallet.pub,
        randomBytes(32),
      );
      expect(() =>
        unwrapSkRFromTransit(wallet.priv, impostor.pub, wrapped),
      ).toThrow();
    });

    it('rejects tampered transit payload', () => {
      const sspKey = genKeypair();
      const wallet = genKeypair();
      const wrapped = wrapSkRForTransit(
        sspKey.priv,
        wallet.pub,
        randomBytes(32),
      );
      const buf = Buffer.from(wrapped, 'hex');
      buf[20] ^= 0xff; // corrupt ciphertext region
      expect(() =>
        unwrapSkRFromTransit(wallet.priv, sspKey.pub, buf.toString('hex')),
      ).toThrow();
    });

    it('rejects wrong-length transit payload', () => {
      const sspKey = genKeypair();
      const wallet = genKeypair();
      expect(() =>
        unwrapSkRFromTransit(wallet.priv, sspKey.pub, '0001020304'),
      ).toThrow(/wrong length/);
    });

    it('rejects unknown transit version', () => {
      const sspKey = genKeypair();
      const wallet = genKeypair();
      const wrapped = wrapSkRForTransit(
        sspKey.priv,
        wallet.pub,
        randomBytes(32),
      );
      const buf = Buffer.from(wrapped, 'hex');
      buf[0] = 0x09;
      expect(() =>
        unwrapSkRFromTransit(wallet.priv, sspKey.pub, buf.toString('hex')),
      ).toThrow(/unsupported transit version/);
    });

    it('uses version byte 0x01', () => {
      const sspKey = genKeypair();
      const wallet = genKeypair();
      const wrapped = wrapSkRForTransit(
        sspKey.priv,
        wallet.pub,
        randomBytes(32),
      );
      expect(Buffer.from(wrapped, 'hex')[0]).toBe(TRANSIT_VERSION);
      expect(TRANSIT_VERSION).toBe(0x01);
    });
  });

  describe('generateEphemeralKeypair', () => {
    it('returns a 32-byte priv and 33-byte compressed pub', () => {
      const kp = generateEphemeralKeypair();
      expect(kp.priv.length).toBe(32);
      expect(kp.pub.length).toBe(33);
      expect([0x02, 0x03]).toContain(kp.pub[0]);
    });

    it('produces a unique keypair each call', () => {
      const a = generateEphemeralKeypair();
      const b = generateEphemeralKeypair();
      expect(a.priv.equals(b.priv)).toBe(false);
      expect(a.pub.equals(b.pub)).toBe(false);
    });
  });

  describe('generateRecoveryNonce', () => {
    it('returns 16 bytes', () => {
      expect(generateRecoveryNonce().length).toBe(16);
    });
    it('is different each call', () => {
      expect(generateRecoveryNonce().equals(generateRecoveryNonce())).toBe(
        false,
      );
    });
  });
});
