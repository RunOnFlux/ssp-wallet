// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';
import { Buffer } from 'buffer';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';

import {
  getMasterXpriv,
  generateAddressKeypairSOL,
  generateMultisigAddressSOL,
  generateSolanaPubkeyArray,
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
      const arr = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 0);
      expect(arr).toHaveLength(20);
      const set = new Set(arr);
      expect(set.size).toBe(20);
      for (const pk of arr) {
        expect(() => new PublicKey(pk)).not.toThrow();
      }
    });

    it('matches generateAddressKeypairSOL element-by-element', () => {
      const arr = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 0);
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
      const a = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 0);
      const b = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 0);
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

  // Per-vault HD slot invariants for enterprise Solana. These pin the
  // critical contract that the wallet's signing keypair (derived at
  // [vault.vaultIndex][addressIndex]) MUST match the slot pubkey computed
  // from the stored xpub array's [addressIndex] entry — which itself was
  // generated at HD path [typeIndex=vault.vaultIndex][i=0..19]. If these
  // ever drift the slot-match check at sign time fails with PUBKEY_MISMATCH.
  describe('per-vault Solana xpub model', () => {
    it('pubkey array at typeIndex=N is element-by-element identical to keypair derivation at [N][i]', () => {
      for (const typeIndex of [0, 1, 2, 17, 99]) {
        const arr = generateSolanaPubkeyArray(
          xprivWallet,
          'solDevnet',
          typeIndex,
        );
        for (let i = 0; i < arr.length; i++) {
          const { pubKey } = generateAddressKeypairSOL(
            xprivWallet,
            typeIndex,
            i,
            'solDevnet',
          );
          expect(arr[i]).toBe(pubKey);
        }
      }
    });

    it('different typeIndex produces a completely disjoint pubkey set', () => {
      const arrV0 = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 0);
      const arrV1 = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 1);
      const arrV2 = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 2);
      // No overlap — each vault has its own pool.
      for (const pk of arrV0) {
        expect(arrV1).not.toContain(pk);
        expect(arrV2).not.toContain(pk);
      }
      for (const pk of arrV1) {
        expect(arrV2).not.toContain(pk);
      }
    });

    it('signing keypair at [vaultIndex][addressIndex] matches pubkey from stored array at addressIndex', () => {
      // Simulate the slot-match invariant for a few (vault, address) tuples.
      // The "stored array" is what generateSolanaPubkeyArray emits during
      // xpub submission; the "signing keypair" is what
      // EnterpriseVaultSignTx.deriveVaultKeypair produces at sign time.
      const cases = [
        { vaultIndex: 0, addressIndex: 0 },
        { vaultIndex: 0, addressIndex: 7 },
        { vaultIndex: 1, addressIndex: 0 },
        { vaultIndex: 5, addressIndex: 12 },
        { vaultIndex: 255, addressIndex: 19 },
      ];
      for (const { vaultIndex, addressIndex } of cases) {
        const storedArray = generateSolanaPubkeyArray(
          xprivWallet,
          'solDevnet',
          vaultIndex,
        );
        const { pubKey: signingPubkey } = generateAddressKeypairSOL(
          xprivWallet,
          vaultIndex,
          addressIndex,
          'solDevnet',
        );
        expect(signingPubkey).toBe(storedArray[addressIndex]);
      }
    });

    it('two vaults with same members/threshold but different vaultIndex produce different multisig PDAs', () => {
      // This is what protects the per-vault separation: even if both
      // vaults have the same {signers, threshold, addressIndex} config,
      // their pubkey arrays differ (per-vault HD slot), so their multisig
      // PDAs differ.
      const wArrV0 = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 0);
      const kArrV0 = generateSolanaPubkeyArray(xprivKey, 'solDevnet', 0);
      const wArrV1 = generateSolanaPubkeyArray(xprivWallet, 'solDevnet', 1);
      const kArrV1 = generateSolanaPubkeyArray(xprivKey, 'solDevnet', 1);
      // For both vaults, picking addressIndex=0 gives a (wallet, key) pair
      // that goes into the multisig PDA. Use the same vaultIndex (0) at the
      // SDK level so we're only varying the inputs (the pubkeys themselves).
      const a = generateMultisigAddressSOL(
        wArrV0[0],
        kArrV0[0],
        0,
        'solDevnet',
      );
      const b = generateMultisigAddressSOL(
        wArrV1[0],
        kArrV1[0],
        0,
        'solDevnet',
      );
      expect(a.address).not.toBe(b.address);
    });
  });
});
