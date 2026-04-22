// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, beforeEach } from 'vitest';
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Buffer } from 'buffer';

import {
  buildRecoveryEnvelope,
  decryptRecoveryEnvelope,
  persistRecoveryEnvelope,
  readRecoveryEnvelope,
  clearRecoveryEnvelope,
} from '../../src/lib/recoveryEnvelope';
import { blockchains } from '../../src/storage/blockchains';

// Installs a minimal localStorage shim so the env behaves like a browser.
function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  return store;
}

// Mirrors wallet.ts derivation: m/48'/coin'/0'/scriptType' from a mnemonic,
// then returns both the xpub (what wallet stores) and the master HDKey
// (what ssp-key has via its own seed).
function deriveIdentityMaster(mnemonic, identityChain = 'btc') {
  const chain = blockchains[identityChain];
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed, chain.bip32);
  const path = `m/48'/${chain.slip}'/0'/${2}'`; // p2wsh=2 for btc
  const identityMaster = master.derive(path);
  return {
    xpub: identityMaster.publicExtendedKey,
    hdkey: identityMaster,
  };
}

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const RANDOM_PARAMS_HEX = 'ab'.repeat(64); // 128 hex chars

describe('recoveryEnvelope', () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  describe('buildRecoveryEnvelope + decryptRecoveryEnvelope', () => {
    it('round-trips with the matching sk_r (simulated ssp-key side)', async () => {
      const keySide = deriveIdentityMaster(MNEMONIC);
      const envelope = await buildRecoveryEnvelope({
        userPassword: 'correct-horse-battery-staple',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: 'bc1qfakewkidentity0000000',
        identityChain: 'btc',
      });

      expect(envelope.version).toBe(1);
      expect(envelope.wkIdentity).toBe('bc1qfakewkidentity0000000');
      expect(envelope.keyIdentityPubKey).toHaveLength(66); // 33 bytes hex
      expect(envelope.blob.length).toBeGreaterThan(0);

      // ssp-key would derive sk_r at /11/0
      const skR = Buffer.from(
        keySide.hdkey.deriveChild(11).deriveChild(0).privateKey,
      );
      expect(skR).toBeTruthy();

      const recovered = await decryptRecoveryEnvelope({
        envelope,
        userPassword: 'correct-horse-battery-staple',
        skR,
      });
      expect(recovered).toBe(RANDOM_PARAMS_HEX);
    });

    it("publishes keyIdentityPubKey matching ssp-key's /10/0 pubkey", async () => {
      const keySide = deriveIdentityMaster(MNEMONIC);
      const expectedPubKey = Buffer.from(
        keySide.hdkey.deriveChild(10).deriveChild(0).publicKey,
      ).toString('hex');

      const envelope = await buildRecoveryEnvelope({
        userPassword: 'pw',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: 'bc1qwhatever',
        identityChain: 'btc',
      });
      expect(envelope.keyIdentityPubKey).toBe(expectedPubKey);
    });

    it('fails to decrypt with the wrong password', async () => {
      const keySide = deriveIdentityMaster(MNEMONIC);
      const envelope = await buildRecoveryEnvelope({
        userPassword: 'right-password',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: 'bc1q0',
        identityChain: 'btc',
      });
      const skR = Buffer.from(
        keySide.hdkey.deriveChild(11).deriveChild(0).privateKey,
      );
      await expect(
        decryptRecoveryEnvelope({
          envelope,
          userPassword: 'wrong-password',
          skR,
        }),
      ).rejects.toThrow();
    });

    it('fails to decrypt with the wrong sk_r (different mnemonic)', async () => {
      const real = deriveIdentityMaster(MNEMONIC);
      const attacker = deriveIdentityMaster(
        'legal winner thank year wave sausage worth useful legal winner thank yellow',
      );
      const envelope = await buildRecoveryEnvelope({
        userPassword: 'pw',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: real.xpub,
        wkIdentity: 'bc1q0',
        identityChain: 'btc',
      });
      const wrongSkR = Buffer.from(
        attacker.hdkey.deriveChild(11).deriveChild(0).privateKey,
      );
      await expect(
        decryptRecoveryEnvelope({
          envelope,
          userPassword: 'pw',
          skR: wrongSkR,
        }),
      ).rejects.toThrow();
    });

    it('fails to decrypt with a sibling key (/10/0 instead of /11/0)', async () => {
      // Confirms /11/0 and /10/0 produce different keys — no cross-domain
      // decryption possible if ssp-key ever mis-derives.
      const keySide = deriveIdentityMaster(MNEMONIC);
      const envelope = await buildRecoveryEnvelope({
        userPassword: 'pw',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: 'bc1q0',
        identityChain: 'btc',
      });
      const wrongSkR = Buffer.from(
        keySide.hdkey.deriveChild(10).deriveChild(0).privateKey,
      );
      await expect(
        decryptRecoveryEnvelope({
          envelope,
          userPassword: 'pw',
          skR: wrongSkR,
        }),
      ).rejects.toThrow();
    });

    it('rejects randomParams of wrong length at build time', async () => {
      const keySide = deriveIdentityMaster(MNEMONIC);
      await expect(
        buildRecoveryEnvelope({
          userPassword: 'pw',
          randomParams: 'short',
          xpubKeyIdentity: keySide.xpub,
          wkIdentity: 'bc1q0',
          identityChain: 'btc',
        }),
      ).rejects.toThrow(/128 hex chars/);
    });

    it('rejects empty userPassword at build time', async () => {
      const keySide = deriveIdentityMaster(MNEMONIC);
      await expect(
        buildRecoveryEnvelope({
          userPassword: '',
          randomParams: RANDOM_PARAMS_HEX,
          xpubKeyIdentity: keySide.xpub,
          wkIdentity: 'bc1q0',
          identityChain: 'btc',
        }),
      ).rejects.toThrow(/userPassword is required/);
    });

    it('produces different blobs for different inputs (nondeterministic outer ECIES + inner passworder)', async () => {
      const keySide = deriveIdentityMaster(MNEMONIC);
      const a = await buildRecoveryEnvelope({
        userPassword: 'pw',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: 'bc1q0',
        identityChain: 'btc',
      });
      const b = await buildRecoveryEnvelope({
        userPassword: 'pw',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: 'bc1q0',
        identityChain: 'btc',
      });
      // Blobs should differ because of random ephemeral + random iv + random salt.
      expect(a.blob).not.toBe(b.blob);

      // But both must decrypt to the same randomParams.
      const skR = Buffer.from(
        keySide.hdkey.deriveChild(11).deriveChild(0).privateKey,
      );
      const ra = await decryptRecoveryEnvelope({
        envelope: a,
        userPassword: 'pw',
        skR,
      });
      const rb = await decryptRecoveryEnvelope({
        envelope: b,
        userPassword: 'pw',
        skR,
      });
      expect(ra).toBe(RANDOM_PARAMS_HEX);
      expect(rb).toBe(RANDOM_PARAMS_HEX);
    });
  });

  describe('persistRecoveryEnvelope / readRecoveryEnvelope / clearRecoveryEnvelope', () => {
    it('persists and reads back a valid envelope', async () => {
      const keySide = deriveIdentityMaster(MNEMONIC);
      const envelope = await buildRecoveryEnvelope({
        userPassword: 'pw',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: 'bc1q0',
        identityChain: 'btc',
      });
      persistRecoveryEnvelope(envelope);
      const read = readRecoveryEnvelope();
      expect(read).toEqual(envelope);
    });

    it('returns null when no envelope is stored', () => {
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('returns null on unparseable JSON', () => {
      localStorage.setItem('recovery_v1', 'not json');
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('returns null on unknown version', () => {
      localStorage.setItem(
        'recovery_v1',
        JSON.stringify({
          version: 99,
          wkIdentity: 'x',
          keyIdentityPubKey: 'y',
          blob: 'z',
          createdAt: 0,
        }),
      );
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('returns null on missing fields', () => {
      localStorage.setItem(
        'recovery_v1',
        JSON.stringify({ version: 1, wkIdentity: 'x' }),
      );
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('clearRecoveryEnvelope removes the key', async () => {
      const keySide = deriveIdentityMaster(MNEMONIC);
      const envelope = await buildRecoveryEnvelope({
        userPassword: 'pw',
        randomParams: RANDOM_PARAMS_HEX,
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: 'bc1q0',
        identityChain: 'btc',
      });
      persistRecoveryEnvelope(envelope);
      expect(readRecoveryEnvelope()).not.toBeNull();
      clearRecoveryEnvelope();
      expect(readRecoveryEnvelope()).toBeNull();
    });
  });
});
