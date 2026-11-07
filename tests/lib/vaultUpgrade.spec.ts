import { describe, it, expect } from 'vitest';
import {
  encrypt as passworderEncrypt,
  decrypt as passworderDecrypt,
  isVaultUpdated,
} from '@metamask/browser-passworder';
import {
  CURRENT_KEY_DERIVATION,
  VAULT_BLOB_LOCK,
  VaultLockError,
  isLegacyVault,
  passwordVaultKeys,
  rotateVaultPassword,
  upgradeLegacyVaults,
  type VaultLockManager,
  type VaultStorage,
} from '../../src/lib/vaultUpgrade';

/**
 * Security review WEXT-8: blobs written with browser-passworder 4.x carry no
 * keyMetadata and decrypt with PBKDF2 at 10,000 iterations forever, because
 * nothing ever upgraded them. These run the REAL passworder.
 */

const PASSWORD = 'correct horse battery staple' + 'r'.repeat(128);
const SEED =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** A blob exactly as passworder 4.x wrote it: 10k iterations, no keyMetadata. */
async function legacyBlob(password: string, value: string): Promise<string> {
  const blob = await passworderEncrypt(password, value, undefined, undefined, {
    algorithm: 'PBKDF2',
    params: { iterations: 10_000 },
  });
  const parsed = JSON.parse(blob) as Record<string, unknown>;
  delete parsed.keyMetadata;
  return JSON.stringify(parsed);
}

/**
 * An exclusive, FIFO, in-process stand-in for navigator.locks. `log` records
 * every acquisition; `maxHeld` the most locks of one name held at once.
 */
function createLocks() {
  const queues = new Map<string, Promise<void>>();
  const holders = new Map<string, number>();
  const log: string[] = [];
  let maxHeld = 0;
  const manager: VaultLockManager = {
    async request(name, _options, callback) {
      const previous = queues.get(name) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const chained = previous.then(() => current);
      queues.set(name, chained);
      await previous;
      const held = (holders.get(name) ?? 0) + 1;
      holders.set(name, held);
      maxHeld = Math.max(maxHeld, held);
      log.push(name);
      try {
        return await callback();
      } finally {
        holders.set(name, (holders.get(name) ?? 1) - 1);
        release();
        if (queues.get(name) === chained) queues.delete(name);
      }
    },
  };
  return {
    manager,
    log,
    get maxHeld() {
      return maxHeld;
    },
  };
}

const locks = createLocks();
const lockOptions = { lockManager: locks.manager };

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const storage: VaultStorage & {
    data: Map<string, string>;
    writes: string[];
  } = {
    data,
    writes,
    getRaw: (key) => data.get(key) ?? null,
    getFresh: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: (key) => {
      writes.push(key);
      data.delete(key);
    },
  };
  return storage;
}

/**
 * Persisted storage shared by several wallet views, each with its OWN cache
 * loaded once (exactly how react-secure-storage behaves). Raw values are a
 * fresh "ciphertext" on every write, like CryptoJS AES with a random salt.
 */
function sharedOrigin(initial: Record<string, string>) {
  const raw = new Map<string, string>();
  let counter = 0;
  const encode = (value: string) => `ct${(counter += 1)}:${value}`;
  const decode = (value: string | undefined) =>
    value === undefined ? null : value.slice(value.indexOf(':') + 1);
  for (const [key, value] of Object.entries(initial)) {
    raw.set(key, encode(value));
  }
  const openView = () => {
    const cache = new Map<string, string>();
    raw.forEach((value, key) => cache.set(key, decode(value) as string));
    const view: VaultStorage & { cached: (key: string) => string | null } = {
      cached: (key) => cache.get(key) ?? null,
      getRaw: (key) => raw.get(key) ?? null,
      getFresh: (key) => decode(raw.get(key)),
      setItem: (key, value) => {
        cache.set(key, value);
        raw.set(key, encode(value));
      },
      removeItem: (key) => {
        cache.delete(key);
        raw.delete(key);
      },
    };
    return view;
  };
  return { raw, openView, decode, encode };
}

describe('isLegacyVault', () => {
  it('flags a 4.x blob and passes a current one', async () => {
    const legacy = await legacyBlob(PASSWORD, SEED);
    const current = await passworderEncrypt(PASSWORD, SEED);
    expect(isLegacyVault(legacy)).toBe(true);
    expect(isLegacyVault(current)).toBe(false);
  });

  it('ignores anything that is not a passworder blob', () => {
    expect(isLegacyVault(null)).toBe(false);
    expect(isLegacyVault('')).toBe(false);
    expect(isLegacyVault('not json')).toBe(false);
    expect(isLegacyVault('{"foo":1}')).toBe(false);
    expect(isLegacyVault(42)).toBe(false);
  });
});

describe('passwordVaultKeys', () => {
  it('covers the seed and every chain key blob, but never the nonce pool', () => {
    const keys = passwordVaultKeys();
    expect(keys).toContain('walletSeed');
    expect(keys).toContain('xpriv-48-0-0-2-btc');
    expect(keys).toContain('xpub-48-0-0-2-btc');
    expect(keys).toContain('2-xpub-48-0-0-2-btc');
    expect(keys).not.toContain('enterpriseNoncesWallet');
    expect(keys).not.toContain('randomParams');
  });
});

describe('upgradeLegacyVaults', () => {
  it('re-encrypts legacy blobs at the current cost, verified, and leaves current ones alone', async () => {
    const current = await passworderEncrypt(PASSWORD, 'xpubCURRENT');
    const storage = memoryStorage({
      walletSeed: await legacyBlob(PASSWORD, SEED),
      'xpriv-48-0-0-2-btc': await legacyBlob(PASSWORD, 'xprvLEGACY'),
      'xpub-48-0-0-2-btc': current,
    });

    const result = await upgradeLegacyVaults(
      storage,
      PASSWORD,
      ['walletSeed', 'xpriv-48-0-0-2-btc', 'xpub-48-0-0-2-btc', 'missing-key'],
      lockOptions,
    );

    expect(result.upgraded.sort()).toEqual(
      ['walletSeed', 'xpriv-48-0-0-2-btc'].sort(),
    );
    expect(storage.writes).not.toContain('xpub-48-0-0-2-btc');
    expect(storage.data.get('xpub-48-0-0-2-btc')).toBe(current);

    for (const [key, expected] of [
      ['walletSeed', SEED],
      ['xpriv-48-0-0-2-btc', 'xprvLEGACY'],
    ] as const) {
      const blob = storage.data.get(key) as string;
      expect(isVaultUpdated(blob, CURRENT_KEY_DERIVATION)).toBe(true);
      expect(isLegacyVault(blob)).toBe(false);
      expect(await passworderDecrypt(PASSWORD, blob)).toBe(expected);
    }
  });

  it('does nothing when every blob is current', async () => {
    const storage = memoryStorage({
      walletSeed: await passworderEncrypt(PASSWORD, SEED),
    });
    const result = await upgradeLegacyVaults(
      storage,
      PASSWORD,
      ['walletSeed'],
      lockOptions,
    );
    expect(result).toEqual({ upgraded: [], skipped: [] });
    expect(storage.writes).toEqual([]);
  });

  it('writes nothing when any legacy blob fails to decrypt', async () => {
    const storage = memoryStorage({
      walletSeed: await legacyBlob(PASSWORD, SEED),
      'xpriv-48-0-0-2-btc': await legacyBlob('a different password', 'x'),
    });
    await expect(
      upgradeLegacyVaults(
        storage,
        PASSWORD,
        ['walletSeed', 'xpriv-48-0-0-2-btc'],
        lockOptions,
      ),
    ).rejects.toThrow();
    expect(storage.writes).toEqual([]);
  });

  it('skips a blob whose PERSISTED value was rewritten meanwhile (raw compare-and-swap)', async () => {
    const legacy = await legacyBlob(PASSWORD, 'xpubKEY');
    const origin = sharedOrigin({ '2-xpub-48-0-0-2-btc': legacy });
    const view = origin.openView();
    let rawReads = 0;
    const racing: VaultStorage = {
      ...view,
      getRaw: (key) => {
        rawReads += 1;
        // Between the scan and the commit a pairing (which does not take the
        // vault lock) replaced the record in localStorage.
        if (rawReads === 2) {
          origin.raw.set(key, origin.encode('rewritten-by-pairing'));
        }
        return view.getRaw(key);
      },
    };
    const result = await upgradeLegacyVaults(
      racing,
      PASSWORD,
      ['2-xpub-48-0-0-2-btc'],
      lockOptions,
    );
    expect(result).toEqual({ upgraded: [], skipped: ['2-xpub-48-0-0-2-btc'] });
    expect(origin.decode(origin.raw.get('2-xpub-48-0-0-2-btc'))).toBe(
      'rewritten-by-pairing',
    );
  });

  it('rolls back every replaced blob when a write fails', async () => {
    const seedBlob = await legacyBlob(PASSWORD, SEED);
    const xprivBlob = await legacyBlob(PASSWORD, 'xprvLEGACY');
    const storage = memoryStorage({
      walletSeed: seedBlob,
      'xpriv-48-0-0-2-btc': xprivBlob,
    });
    let failNext = false;
    const flaky: VaultStorage = {
      ...storage,
      setItem: (key, value) => {
        if (key === 'xpriv-48-0-0-2-btc' && value !== xprivBlob) {
          failNext = true;
        }
        if (failNext) {
          failNext = false;
          throw new Error('QuotaExceededError');
        }
        storage.setItem(key, value);
      },
    };
    await expect(
      upgradeLegacyVaults(
        flaky,
        PASSWORD,
        ['walletSeed', 'xpriv-48-0-0-2-btc'],
        lockOptions,
      ),
    ).rejects.toThrow('QuotaExceededError');
    expect(storage.data.get('walletSeed')).toBe(seedBlob);
    expect(storage.data.get('xpriv-48-0-0-2-btc')).toBe(xprivBlob);
  });

  it('refuses to run without a password', async () => {
    await expect(
      upgradeLegacyVaults(memoryStorage({}), '', ['walletSeed'], lockOptions),
    ).rejects.toThrow();
  });

  it('fails closed without Web Locks: nothing is rewritten', async () => {
    const storage = memoryStorage({
      walletSeed: await legacyBlob(PASSWORD, SEED),
    });
    await expect(
      upgradeLegacyVaults(storage, PASSWORD, ['walletSeed'], {
        lockManager: null,
      }),
    ).rejects.toBeInstanceOf(VaultLockError);
    expect(storage.writes).toEqual([]);
  });
});

describe('secret-blob rewrites across two wallet views', () => {
  const OLD = 'user-password' + 'a'.repeat(128);
  const NEW = 'user-password' + 'b'.repeat(128);

  it('a view with a stale cache never writes back a blob another view rotated', async () => {
    const origin = sharedOrigin({
      walletSeed: await legacyBlob(OLD, SEED),
    });
    // View A loaded its cache BEFORE view B rotated the wallet.
    const viewA = origin.openView();
    const viewB = origin.openView();
    await rotateVaultPassword({
      locations: [{ storage: viewB, key: 'walletSeed' }],
      oldPassword: OLD,
      newPassword: NEW,
      ...lockOptions,
    });
    const rotatedRaw = origin.raw.get('walletSeed');
    // A's cache still holds the legacy blob under the OLD password...
    expect(isLegacyVault(viewA.cached('walletSeed'))).toBe(true);
    // ...but the upgrade reads what is persisted, so it has nothing to do —
    // re-encrypting the cached copy would have put the OLD password back.
    const result = await upgradeLegacyVaults(
      viewA,
      OLD,
      ['walletSeed'],
      lockOptions,
    );
    expect(result).toEqual({ upgraded: [], skipped: [] });
    expect(origin.raw.get('walletSeed')).toBe(rotatedRaw);
    expect(
      await passworderDecrypt(NEW, viewB.getFresh('walletSeed') as string),
    ).toBe(SEED);
  });

  it('serialises concurrent upgrades from two views under one lock', async () => {
    const origin = sharedOrigin({
      walletSeed: await legacyBlob(PASSWORD, SEED),
    });
    const viewA = origin.openView();
    const viewB = origin.openView();
    const lockSet = createLocks();
    const [a, b] = await Promise.all([
      upgradeLegacyVaults(viewA, PASSWORD, ['walletSeed'], {
        lockManager: lockSet.manager,
      }),
      upgradeLegacyVaults(viewB, PASSWORD, ['walletSeed'], {
        lockManager: lockSet.manager,
      }),
    ]);
    expect(lockSet.maxHeld).toBe(1);
    expect(lockSet.log).toEqual([VAULT_BLOB_LOCK, VAULT_BLOB_LOCK]);
    // Exactly one view upgraded; the other found a current blob.
    expect([...a.upgraded, ...b.upgraded]).toEqual(['walletSeed']);
    const persisted = viewA.getFresh('walletSeed') as string;
    expect(isVaultUpdated(persisted, CURRENT_KEY_DERIVATION)).toBe(true);
    expect(await passworderDecrypt(PASSWORD, persisted)).toBe(SEED);
  });
});

/**
 * KEY-5 residual: after a recovery exchange the wallet rotates randomParams,
 * so every blob moves from `user + oldParams` to `user + newParams`. A partial
 * rotation would brick the wallet, so it is all-or-nothing.
 */
describe('rotateVaultPassword', () => {
  const OLD = 'user-password' + 'a'.repeat(128);
  const NEW = 'user-password' + 'b'.repeat(128);

  async function vault() {
    return memoryStorage({
      walletSeed: await passworderEncrypt(OLD, SEED),
      'xpriv-48-0-0-2-btc': await legacyBlob(OLD, 'xprvBTC'),
      randomParams: 'old-randomParams-blob',
    });
  }

  it('moves every blob to the new password and writes the extras in the same commit', async () => {
    const secure = await vault();
    const plain = memoryStorage({
      pool: await passworderEncrypt(OLD, '[{"k":1}]'),
    });
    const result = await rotateVaultPassword({
      locations: [
        { storage: secure, key: 'walletSeed' },
        { storage: secure, key: 'xpriv-48-0-0-2-btc' },
        { storage: secure, key: 'absent-key' },
        { storage: plain, key: 'pool' },
      ],
      oldPassword: OLD,
      newPassword: NEW,
      extraWrites: [
        {
          storage: secure,
          key: 'randomParams',
          value: 'new-randomParams-blob',
        },
      ],
      lockManager: locks.manager,
      extraLocks: ['ssp-enterprise-nonce-pool'],
    });
    expect(locks.log.slice(-2)).toEqual([
      VAULT_BLOB_LOCK,
      'ssp-enterprise-nonce-pool',
    ]);
    expect(result.rotated.sort()).toEqual(
      ['pool', 'walletSeed', 'xpriv-48-0-0-2-btc'].sort(),
    );
    expect(
      await passworderDecrypt(NEW, secure.data.get('walletSeed') as string),
    ).toBe(SEED);
    expect(
      await passworderDecrypt(
        NEW,
        secure.data.get('xpriv-48-0-0-2-btc') as string,
      ),
    ).toBe('xprvBTC');
    expect(await passworderDecrypt(NEW, plain.data.get('pool') as string)).toBe(
      '[{"k":1}]',
    );
    await expect(
      passworderDecrypt(OLD, secure.data.get('walletSeed') as string),
    ).rejects.toThrow();
    expect(secure.data.get('randomParams')).toBe('new-randomParams-blob');
    expect(isLegacyVault(secure.data.get('xpriv-48-0-0-2-btc'))).toBe(false);
  });

  it('writes nothing when any blob does not decrypt with the old password', async () => {
    const secure = await vault();
    secure.data.set('xpub-48-0-0-2-btc', await passworderEncrypt('other', 'x'));
    await expect(
      rotateVaultPassword({
        locations: [
          { storage: secure, key: 'walletSeed' },
          { storage: secure, key: 'xpub-48-0-0-2-btc' },
        ],
        oldPassword: OLD,
        newPassword: NEW,
        extraWrites: [{ storage: secure, key: 'randomParams', value: 'new' }],
        ...lockOptions,
      }),
    ).rejects.toThrow();
    expect(secure.writes).toEqual([]);
  });

  it('writes nothing when a persisted blob changed during the rotation', async () => {
    const secure = await vault();
    let rawReads = 0;
    const racing: VaultStorage = {
      ...secure,
      getRaw: (key: string) => {
        if (key === 'walletSeed') {
          rawReads += 1;
          // Snapshot, scan, then the commit check sees another view's write.
          if (rawReads === 3) return 'changed-meanwhile';
        }
        return secure.getRaw(key);
      },
    };
    await expect(
      rotateVaultPassword({
        locations: [{ storage: racing, key: 'walletSeed' }],
        oldPassword: OLD,
        newPassword: NEW,
        extraWrites: [{ storage: secure, key: 'randomParams', value: 'new' }],
        ...lockOptions,
      }),
    ).rejects.toThrow(/changed during rotation/);
    expect(secure.writes).toEqual([]);
  });

  it('writes nothing when a blob appeared at an empty location meanwhile', async () => {
    const secure = await vault();
    let rawReads = 0;
    const racing: VaultStorage = {
      ...secure,
      getRaw: (key: string) => {
        if (key === 'xpriv-48-60-0-0-eth') {
          rawReads += 1;
          // Snapshot and scan see nothing; by the commit check another view
          // derived the chain — left under the OLD password, it would be
          // stranded, so the commit must refuse.
          if (rawReads > 2) return 'created-meanwhile';
        }
        return secure.getRaw(key);
      },
    };
    await expect(
      rotateVaultPassword({
        locations: [
          { storage: racing, key: 'walletSeed' },
          { storage: racing, key: 'xpriv-48-60-0-0-eth' },
        ],
        oldPassword: OLD,
        newPassword: NEW,
        ...lockOptions,
      }),
    ).rejects.toThrow(/changed during rotation/);
    expect(secure.writes).toEqual([]);
  });

  it('refuses to rotate around a persisted value it cannot read', async () => {
    const secure = await vault();
    secure.data.set('xpub-48-0-0-2-btc', 'not-a-blob');
    await expect(
      rotateVaultPassword({
        locations: [
          { storage: secure, key: 'walletSeed' },
          { storage: secure, key: 'xpub-48-0-0-2-btc' },
        ],
        oldPassword: OLD,
        newPassword: NEW,
        ...lockOptions,
      }),
    ).rejects.toThrow(/could not be read/);
    expect(secure.writes).toEqual([]);
  });

  it('fails closed without Web Locks', async () => {
    const secure = await vault();
    await expect(
      rotateVaultPassword({
        locations: [{ storage: secure, key: 'walletSeed' }],
        oldPassword: OLD,
        newPassword: NEW,
        lockManager: null,
      }),
    ).rejects.toBeInstanceOf(VaultLockError);
    expect(secure.writes).toEqual([]);
  });

  it('restores every value, extras included, when a write fails', async () => {
    const secure = await vault();
    const seedBefore = secure.data.get('walletSeed');
    const flaky: VaultStorage = {
      ...secure,
      setItem: (key: string, value: string) => {
        if (key === 'randomParams' && value === 'new-randomParams-blob') {
          throw new Error('QuotaExceededError');
        }
        secure.setItem(key, value);
      },
    };
    await expect(
      rotateVaultPassword({
        locations: [{ storage: flaky, key: 'walletSeed' }],
        oldPassword: OLD,
        newPassword: NEW,
        extraWrites: [
          {
            storage: flaky,
            key: 'randomParams',
            value: 'new-randomParams-blob',
          },
        ],
        ...lockOptions,
      }),
    ).rejects.toThrow('QuotaExceededError');
    expect(secure.data.get('walletSeed')).toBe(seedBefore);
    expect(secure.data.get('randomParams')).toBe('old-randomParams-blob');
    expect(
      await passworderDecrypt(OLD, secure.data.get('walletSeed') as string),
    ).toBe(SEED);
  });

  it('refuses a no-op or empty rotation', async () => {
    const secure = await vault();
    await expect(
      rotateVaultPassword({
        locations: [{ storage: secure, key: 'walletSeed' }],
        oldPassword: OLD,
        newPassword: OLD,
        ...lockOptions,
      }),
    ).rejects.toThrow();
    await expect(
      rotateVaultPassword({
        locations: [{ storage: secure, key: 'missing' }],
        oldPassword: OLD,
        newPassword: NEW,
        ...lockOptions,
      }),
    ).rejects.toThrow();
  });
});
