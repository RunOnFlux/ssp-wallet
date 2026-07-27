// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, beforeEach } from 'vitest';
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { fluxnode } from '@runonflux/flux-sdk';
import { Buffer } from 'buffer';

import {
  buildRecoveryEnvelope,
  decryptRecoveryEnvelope,
  persistRecoveryEnvelope,
  readRecoveryEnvelope,
  clearRecoveryEnvelope,
  ensureRecoveryEnvelope,
  isRecoveryEnvelopeCurrent,
  storeRecoveryXpub,
  readRecoveryXpub,
  advanceRecoveryIndex,
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

// The account whose keys are released: m/48'/coin'/99'/scriptType'.
// ssp-key derives it from the same seed (see ssp-key lib/recoveryAccount.ts)
// and publishes only its xpub.
function deriveRecoveryAccount(mnemonic, identityChain = 'btc') {
  const chain = blockchains[identityChain];
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed, chain.bip32);
  const account = master.derive(`m/48'/${chain.slip}'/99'/${2}'`);
  return {
    xpub: account.publicExtendedKey,
    hdkey: account,
  };
}

/**
 * Sign as ssp-key does when publishing (see ssp-key lib/recoveryPublish.ts):
 * a Bitcoin signed message over `ssp-recovery-xpub\n<wkIdentity>\n<xpub>` made
 * with the identity key at /10/0.
 */
function signAsKey(identity, wkIdentity, recoveryXpub) {
  const identityChild = identity.hdkey.deriveChild(10).deriveChild(0);
  return fluxnode.signMessage(
    `ssp-recovery-xpub\n${wkIdentity}\n${recoveryXpub}`,
    Buffer.from(identityChild.privateKey).toString('hex'),
    true,
    blockchains.btc.messagePrefix,
  );
}

/** sk_r(i) as ssp-key derives it: recoveryAccount/0/i. */
function skRAt(recovery, index) {
  return Buffer.from(
    recovery.hdkey.deriveChild(0).deriveChild(index).privateKey,
  );
}

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const OTHER_MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const RANDOM_PARAMS_HEX = 'ab'.repeat(64); // 128 hex chars

describe('recoveryEnvelope', () => {
  let keySide;
  let recoverySide;

  beforeEach(() => {
    installLocalStorageShim();
    keySide = deriveIdentityMaster(MNEMONIC);
    recoverySide = deriveRecoveryAccount(MNEMONIC);
  });

  const WK = 'bc1qtestwkidentity00000000000000000000000';

  const store = (overrides = {}) => {
    const recoveryXpub = overrides.recoveryXpub ?? recoverySide.xpub;
    const signer = overrides.signer ?? keySide;
    const wkIdentity = overrides.wkIdentity ?? WK;
    return storeRecoveryXpub({
      recoveryXpub,
      signature:
        overrides.signature ?? signAsKey(signer, wkIdentity, recoveryXpub),
      wkIdentity,
      xpubKeyIdentity: overrides.xpubKeyIdentity ?? keySide.xpub,
      identityChain: 'btc',
    });
  };

  const build = (overrides = {}) =>
    buildRecoveryEnvelope({
      userPassword: 'pw',
      randomParams: RANDOM_PARAMS_HEX,
      xpubKeyIdentity: keySide.xpub,
      recoveryXpub: recoverySide.xpub,
      wkIdentity: 'bc1q0',
      identityChain: 'btc',
      ...overrides,
    });

  describe('buildRecoveryEnvelope + decryptRecoveryEnvelope', () => {
    it('round-trips with the matching sk_r (simulated ssp-key side)', async () => {
      const envelope = await build({
        userPassword: 'correct-horse-battery-staple',
        wkIdentity: 'bc1qfakewkidentity0000000',
      });

      expect(envelope.version).toBe(2);
      expect(envelope.wkIdentity).toBe('bc1qfakewkidentity0000000');
      expect(envelope.keyIdentityPubKey).toHaveLength(66); // 33 bytes hex
      expect(envelope.recoveryXpub).toBe(recoverySide.xpub);
      expect(envelope.recoveryIndex).toBe(0);
      expect(envelope.blob.length).toBeGreaterThan(0);

      const recovered = await decryptRecoveryEnvelope({
        envelope,
        userPassword: 'correct-horse-battery-staple',
        skR: skRAt(recoverySide, 0),
      });
      expect(recovered).toBe(RANDOM_PARAMS_HEX);
    });

    it("publishes keyIdentityPubKey matching ssp-key's /10/0 pubkey", async () => {
      const expectedPubKey = Buffer.from(
        keySide.hdkey.deriveChild(10).deriveChild(0).publicKey,
      ).toString('hex');

      const envelope = await build();
      expect(envelope.keyIdentityPubKey).toBe(expectedPubKey);
    });

    it('seals to the requested index, and only that index opens it', async () => {
      const envelope = await build({ recoveryIndex: 7 });
      expect(envelope.recoveryIndex).toBe(7);

      await expect(
        decryptRecoveryEnvelope({
          envelope,
          userPassword: 'pw',
          skR: skRAt(recoverySide, 0),
        }),
      ).rejects.toThrow();

      const recovered = await decryptRecoveryEnvelope({
        envelope,
        userPassword: 'pw',
        skR: skRAt(recoverySide, 7),
      });
      expect(recovered).toBe(RANDOM_PARAMS_HEX);
    });

    it('is sealed under the recovery account, hardened off the signing one', async () => {
      const envelope = await build();

      // 99' is hardened, so the recovery account is not addressable from the
      // identity xpub.
      const identityFromXpub = HDKey.fromExtendedKey(
        keySide.xpub,
        blockchains.btc.bip32,
      );
      expect(() =>
        identityFromXpub.deriveChild(99 + 0x80000000),
      ).toThrowError();

      // And each account yields its own keys at the change levels BIP-48
      // defines.
      for (const change of [0, 1]) {
        const sibling = Buffer.from(
          keySide.hdkey.deriveChild(change).deriveChild(0).privateKey,
        );
        await expect(
          decryptRecoveryEnvelope({
            envelope,
            userPassword: 'pw',
            skR: sibling,
          }),
        ).rejects.toThrow();
      }
    });

    it('fails to decrypt with the wrong password', async () => {
      const envelope = await build({ userPassword: 'right-password' });
      await expect(
        decryptRecoveryEnvelope({
          envelope,
          userPassword: 'wrong-password',
          skR: skRAt(recoverySide, 0),
        }),
      ).rejects.toThrow();
    });

    it('fails to decrypt with the wrong sk_r (different mnemonic)', async () => {
      const envelope = await build();
      const attacker = deriveRecoveryAccount(OTHER_MNEMONIC);
      await expect(
        decryptRecoveryEnvelope({
          envelope,
          userPassword: 'pw',
          skR: skRAt(attacker, 0),
        }),
      ).rejects.toThrow();
    });

    it('rejects randomParams of wrong length at build time', async () => {
      await expect(build({ randomParams: 'short' })).rejects.toThrow(
        /128 hex chars/,
      );
    });

    it('rejects empty userPassword at build time', async () => {
      await expect(build({ userPassword: '' })).rejects.toThrow(
        /userPassword is required/,
      );
    });

    it('rejects a build with no recovery account xpub', async () => {
      await expect(build({ recoveryXpub: '' })).rejects.toThrow(
        /recoveryXpub is required/,
      );
    });

    it('produces different blobs for different inputs (nondeterministic outer ECIES + inner passworder)', async () => {
      const a = await build();
      const b = await build();
      // Blobs should differ because of random ephemeral + random iv + random salt.
      expect(a.blob).not.toBe(b.blob);

      // But both must decrypt to the same randomParams.
      const skR = skRAt(recoverySide, 0);
      expect(
        await decryptRecoveryEnvelope({
          envelope: a,
          userPassword: 'pw',
          skR,
        }),
      ).toBe(RANDOM_PARAMS_HEX);
      expect(
        await decryptRecoveryEnvelope({
          envelope: b,
          userPassword: 'pw',
          skR,
        }),
      ).toBe(RANDOM_PARAMS_HEX);
    });
  });

  describe('persistRecoveryEnvelope / readRecoveryEnvelope / clearRecoveryEnvelope', () => {
    it('persists and reads back a valid envelope', async () => {
      const envelope = await build();
      persistRecoveryEnvelope(envelope);
      expect(readRecoveryEnvelope()).toEqual(envelope);
    });

    it('returns null when no envelope is stored', () => {
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('returns null on unparseable JSON', () => {
      localStorage.setItem('recovery_v2', 'not json');
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('returns null unless the version matches', () => {
      // Only the current version is read.
      localStorage.setItem(
        'recovery_v2',
        JSON.stringify({
          version: 1,
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
        'recovery_v2',
        JSON.stringify({ version: 2, wkIdentity: 'x' }),
      );
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('discards a superseded envelope when a current one is written', async () => {
      localStorage.setItem('recovery_v1', JSON.stringify({ version: 1 }));
      persistRecoveryEnvelope(await build());
      expect(localStorage.getItem('recovery_v1')).toBeNull();
      expect(readRecoveryEnvelope()).not.toBeNull();
    });

    it('clears an earlier envelope even when no replacement can be built', async () => {
      // No account xpub cached, so nothing is sealed this session — the earlier
      // key still goes, since nothing reads it.
      localStorage.setItem('recovery_v1', JSON.stringify({ version: 1 }));
      await ensureRecoveryEnvelope({
        passwordBlob: '',
        xpubKeyIdentity: keySide.xpub,
        wkIdentity: WK,
        identityChain: 'btc',
      });
      expect(localStorage.getItem('recovery_v1')).toBeNull();
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('clearRecoveryEnvelope removes every stored envelope', async () => {
      localStorage.setItem('recovery_v1', JSON.stringify({ version: 1 }));
      persistRecoveryEnvelope(await build());
      expect(readRecoveryEnvelope()).not.toBeNull();
      clearRecoveryEnvelope();
      expect(readRecoveryEnvelope()).toBeNull();
      expect(localStorage.getItem('recovery_v1')).toBeNull();
    });
  });

  describe('isRecoveryEnvelopeCurrent', () => {
    it('is false with nothing stored', () => {
      expect(isRecoveryEnvelopeCurrent(WK)).toBe(false);
    });

    it('is true for the pairing the envelope was built for', async () => {
      store();
      persistRecoveryEnvelope(await build({ wkIdentity: WK }));
      expect(isRecoveryEnvelopeCurrent(WK)).toBe(true);
    });

    it('is false for a different pairing', async () => {
      // Re-pairing changes the identity, and an envelope from the previous
      // pairing can never be opened — so it must not block a rebuild.
      store();
      persistRecoveryEnvelope(await build({ wkIdentity: WK }));
      expect(isRecoveryEnvelopeCurrent('bc1qadifferentidentity')).toBe(false);
    });

    it('is false when the cached account xpub has moved on', async () => {
      store();
      persistRecoveryEnvelope(await build({ wkIdentity: WK }));
      const other = deriveRecoveryAccount(OTHER_MNEMONIC);
      // A newly published account xpub for the same identity: the stored
      // envelope is sealed under the old one, so it no longer counts.
      expect(store({ recoveryXpub: other.xpub })).toBe(true);
      expect(isRecoveryEnvelopeCurrent(WK)).toBe(false);
    });
  });

  describe('storeRecoveryXpub / advanceRecoveryIndex', () => {
    it('caches a usable, correctly signed account xpub', () => {
      expect(readRecoveryXpub()).toBeNull();
      expect(store()).toBe(true);
      expect(readRecoveryXpub()).toBe(recoverySide.xpub);
    });

    it('refuses anything that is not a usable account xpub', () => {
      // Signed correctly each time, so these fail on the xpub itself rather
      // than on the signature check that precedes it.
      for (const bad of ['not-an-xpub', keySide.xpub.slice(0, 20)]) {
        expect(store({ recoveryXpub: bad })).toBe(false);
      }
      expect(store({ recoveryXpub: '' })).toBe(false);
      expect(readRecoveryXpub()).toBeNull();
    });

    it('refuses an extended PRIVATE key', () => {
      // Only the public half belongs on this side, even properly signed.
      expect(
        store({ recoveryXpub: recoverySide.hdkey.privateExtendedKey }),
      ).toBe(false);
      expect(readRecoveryXpub()).toBeNull();
    });

    it('refuses a record the paired ssp-key did not sign', () => {
      // What a substituting relay would serve: a well-formed xpub of its own,
      // signed by a key the wallet has never paired with.
      const attacker = deriveIdentityMaster(OTHER_MNEMONIC);
      const attackerAccount = deriveRecoveryAccount(OTHER_MNEMONIC);
      expect(
        store({ recoveryXpub: attackerAccount.xpub, signer: attacker }),
      ).toBe(false);
      expect(readRecoveryXpub()).toBeNull();
    });

    it('refuses an unsigned or tampered record', () => {
      expect(store({ signature: '' })).toBe(false);
      expect(store({ signature: 'garbage' })).toBe(false);
      const good = signAsKey(keySide, WK, recoverySide.xpub);
      const raw = Buffer.from(good, 'base64');
      raw[12] ^= 0xff;
      expect(store({ signature: raw.toString('base64') })).toBe(false);
      expect(readRecoveryXpub()).toBeNull();
    });

    it('refuses a record signed for a different identity', () => {
      expect(
        store({
          signature: signAsKey(keySide, 'bc1qsomeoneelse', recoverySide.xpub),
        }),
      ).toBe(false);
      expect(readRecoveryXpub()).toBeNull();
    });

    it('drops the envelope and index when the account changes', async () => {
      store();
      advanceRecoveryIndex();
      persistRecoveryEnvelope(await build({ recoveryIndex: 1 }));

      // The SAME ssp-key publishing a different account (e.g. after a restore
      // onto a new seed) is still legitimate, so it is signed by that key.
      const other = deriveRecoveryAccount(OTHER_MNEMONIC);
      expect(store({ recoveryXpub: other.xpub })).toBe(true);
      expect(readRecoveryXpub()).toBe(other.xpub);
      // Indices under the previous account mean nothing under the new one.
      expect(readRecoveryEnvelope()).toBeNull();
    });

    it('re-storing the same xpub keeps the envelope', async () => {
      store();
      persistRecoveryEnvelope(await build());
      expect(store()).toBe(true);
      expect(readRecoveryEnvelope()).not.toBeNull();
    });

    it('advancing moves to another index and drops the envelope', async () => {
      store();
      persistRecoveryEnvelope(await build({ recoveryIndex: 0 }));
      const before = localStorage.getItem('recovery_ix');
      advanceRecoveryIndex();
      expect(readRecoveryEnvelope()).toBeNull();
      const after = localStorage.getItem('recovery_ix');
      expect(after).not.toBe(before);
      expect(Number(after)).toBeGreaterThanOrEqual(0);
      expect(Number(after)).toBeLessThanOrEqual(0x7fffffff);
    });

    it('each index is a distinct key, so rotation is meaningful', async () => {
      // sk_r(0), which one recovery used...
      const released = skRAt(recoverySide, 0);
      advanceRecoveryIndex();
      // ...and sk_r(1), which the next envelope seals to.
      const next = await build({ recoveryIndex: 1 });
      await expect(
        decryptRecoveryEnvelope({
          envelope: next,
          userPassword: 'pw',
          skR: released,
        }),
      ).rejects.toThrow();
      expect(
        await decryptRecoveryEnvelope({
          envelope: next,
          userPassword: 'pw',
          skR: skRAt(recoverySide, 1),
        }),
      ).toBe(RANDOM_PARAMS_HEX);
    });

    it('always stays inside the non-hardened index range', () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        advanceRecoveryIndex();
        const value = Number(localStorage.getItem('recovery_ix'));
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(0x7fffffff);
      }
    });

    it('does not fall back to a fixed index when storage was wiped', () => {
      // A password change clears this origin's storage, so an index that had to
      // survive in order to stay meaningful would not. Drawing one instead means
      // a wiped store still yields an index of its own rather than restarting
      // from a value an earlier envelope already used.
      const seen = new Set();
      for (let attempt = 0; attempt < 25; attempt += 1) {
        localStorage.clear();
        advanceRecoveryIndex();
        seen.add(localStorage.getItem('recovery_ix'));
      }
      expect(seen.size).toBeGreaterThan(1);
      expect(seen.has('0')).toBe(false);
    });
  });
});
