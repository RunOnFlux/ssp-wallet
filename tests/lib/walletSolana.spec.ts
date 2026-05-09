// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';
import { Buffer } from 'buffer';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { createInitializationMessage } from '@runonflux/solana-multisig';

import {
  getMasterXpriv,
  generateAddressKeypairSOL,
  generateMultisigAddressSOL,
  generateSolanaPubkeyArray,
  signSolanaInitMessage,
} from '../../src/lib/wallet';

const mnemonic =
  'silver trouble mountain crouch angry park film strong escape theory illegal bunker cargo taxi tuna real drift alert state match great escape option explain';

const xprivWallet = getMasterXpriv(mnemonic, 48, 1, 0, 'p2sh', 'solDevnet');
const xprivKey = getMasterXpriv(mnemonic, 48, 1, 1, 'p2sh', 'solDevnet');

describe('Solana wallet lib', () => {
  describe('generateAddressKeypairSOL', () => {
    it('returns 64-byte hex secret key and base58-encoded 32-byte public key', () => {
      const kp = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
      expect(kp.privKey).toMatch(/^[0-9a-f]{128}$/);
      const pub = bs58.decode(kp.pubKey);
      expect(pub.length).toBe(32);
      // pubKey decodes to a valid Ed25519 point
      expect(() => new PublicKey(kp.pubKey)).not.toThrow();
    });

    it('is deterministic for the same xpriv + path', () => {
      const a = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
      const b = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
      expect(a).toEqual(b);
    });

    it('produces distinct keypairs for different address indices', () => {
      const a = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
      const b = generateAddressKeypairSOL(xprivWallet, 0, 1, 'solDevnet');
      expect(a.pubKey).not.toBe(b.pubKey);
      expect(a.privKey).not.toBe(b.privKey);
    });

    it('signs and verifies with nacl using the returned keypair', () => {
      const kp = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
      const secret = new Uint8Array(Buffer.from(kp.privKey, 'hex'));
      const pub = bs58.decode(kp.pubKey);
      const msg = new TextEncoder().encode('hello solana');
      const sig = nacl.sign.detached(msg, secret);
      expect(nacl.sign.detached.verify(msg, sig, pub)).toBe(true);
    });
  });

  describe('generateSolanaPubkeyArray', () => {
    it('produces exactly 20 distinct base58 pubkeys', () => {
      const arr = generateSolanaPubkeyArray(xprivWallet, 'solDevnet');
      expect(arr).toHaveLength(20);
      const set = new Set(arr);
      expect(set.size).toBe(20);
      for (const pk of arr) {
        expect(() => new PublicKey(pk)).not.toThrow();
      }
    });

    it('matches generateAddressKeypairSOL element-by-element', () => {
      const arr = generateSolanaPubkeyArray(xprivWallet, 'solDevnet');
      for (let i = 0; i < arr.length; i += 7) {
        const { pubKey } = generateAddressKeypairSOL(
          xprivWallet,
          0,
          i,
          'solDevnet',
        );
        expect(arr[i]).toBe(pubKey);
      }
    });

    it('is deterministic across calls', () => {
      const a = generateSolanaPubkeyArray(xprivWallet, 'solDevnet');
      const b = generateSolanaPubkeyArray(xprivWallet, 'solDevnet');
      expect(a).toEqual(b);
    });
  });

  describe('generateMultisigAddressSOL', () => {
    it('returns a valid base58 PublicKey for the vault PDA', () => {
      const w = generateAddressKeypairSOL(
        xprivWallet,
        0,
        0,
        'solDevnet',
      ).pubKey;
      const k = generateAddressKeypairSOL(xprivKey, 0, 0, 'solDevnet').pubKey;
      const ms = generateMultisigAddressSOL(w, k, 0, 'solDevnet');
      expect(typeof ms.address).toBe('string');
      expect(() => new PublicKey(ms.address)).not.toThrow();
    });

    it('is order-independent in member pubkeys (program sorts them)', () => {
      const w = generateAddressKeypairSOL(
        xprivWallet,
        0,
        0,
        'solDevnet',
      ).pubKey;
      const k = generateAddressKeypairSOL(xprivKey, 0, 0, 'solDevnet').pubKey;
      const a = generateMultisigAddressSOL(w, k, 0, 'solDevnet');
      const b = generateMultisigAddressSOL(k, w, 0, 'solDevnet');
      expect(a.address).toBe(b.address);
    });

    it('produces distinct vault PDAs for different vaultIndex', () => {
      const w = generateAddressKeypairSOL(
        xprivWallet,
        0,
        0,
        'solDevnet',
      ).pubKey;
      const k = generateAddressKeypairSOL(xprivKey, 0, 0, 'solDevnet').pubKey;
      const a = generateMultisigAddressSOL(w, k, 0, 'solDevnet');
      const b = generateMultisigAddressSOL(w, k, 1, 'solDevnet');
      expect(a.address).not.toBe(b.address);
    });

    it('produces distinct vault PDAs for different addressIndex pubkey pairs', () => {
      const w0 = generateAddressKeypairSOL(
        xprivWallet,
        0,
        0,
        'solDevnet',
      ).pubKey;
      const k0 = generateAddressKeypairSOL(xprivKey, 0, 0, 'solDevnet').pubKey;
      const w1 = generateAddressKeypairSOL(
        xprivWallet,
        0,
        1,
        'solDevnet',
      ).pubKey;
      const k1 = generateAddressKeypairSOL(xprivKey, 0, 1, 'solDevnet').pubKey;
      const v0 = generateMultisigAddressSOL(w0, k0, 0, 'solDevnet');
      const v1 = generateMultisigAddressSOL(w1, k1, 0, 'solDevnet');
      expect(v0.address).not.toBe(v1.address);
    });
  });

  describe('signSolanaInitMessage', () => {
    it('produces a base64 signature that verifies against the SDK init message', () => {
      const wKp = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
      const kKp = generateAddressKeypairSOL(xprivKey, 0, 0, 'solDevnet');

      const sigB64 = signSolanaInitMessage(wKp.privKey, wKp.pubKey, kKp.pubKey);
      const sig = new Uint8Array(Buffer.from(sigB64, 'base64'));
      expect(sig.length).toBe(64);

      const message = createInitializationMessage(
        [new PublicKey(wKp.pubKey), new PublicKey(kKp.pubKey)],
        2,
      );
      const pub = bs58.decode(wKp.pubKey);
      expect(nacl.sign.detached.verify(message, sig, pub)).toBe(true);
    });

    it('is order-independent in member arguments (members are sorted on-chain)', () => {
      const wKp = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
      const kKp = generateAddressKeypairSOL(xprivKey, 0, 0, 'solDevnet');
      const a = signSolanaInitMessage(wKp.privKey, wKp.pubKey, kKp.pubKey);
      const b = signSolanaInitMessage(wKp.privKey, kKp.pubKey, wKp.pubKey);
      expect(a).toBe(b);
    });

    it('produces signatures that fail verification with the wrong public key', () => {
      const wKp = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
      const kKp = generateAddressKeypairSOL(xprivKey, 0, 0, 'solDevnet');
      const sigB64 = signSolanaInitMessage(wKp.privKey, wKp.pubKey, kKp.pubKey);
      const sig = new Uint8Array(Buffer.from(sigB64, 'base64'));
      const message = createInitializationMessage(
        [new PublicKey(wKp.pubKey), new PublicKey(kKp.pubKey)],
        2,
      );
      const wrongPub = bs58.decode(kKp.pubKey);
      expect(nacl.sign.detached.verify(message, sig, wrongPub)).toBe(false);
    });
  });
});
