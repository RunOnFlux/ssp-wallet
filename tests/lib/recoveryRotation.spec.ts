// Login recovery: randomParams rotation after a recovery exchange must leave a
// wallet that unlocks at EVERY point it can be interrupted (security review:
// recovery rotation interrupt safety). Real passworder, real vaultUpgrade.
import { describe, expect, it, vi } from 'vitest';
import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';

vi.mock('../../src/lib/vaultStorage', () => ({
  secureVaultStorage: () => {
    throw new Error('tests pass their own storage');
  },
  plainVaultStorage: () => {
    throw new Error('tests pass their own storage');
  },
}));
vi.mock('../../src/lib/enterpriseNonces', () => ({
  NONCE_POOL_LOCK: 'ssp-enterprise-nonce-pool',
  NONCE_POOL_STORAGE_KEY: 'sspEnterpriseNoncesWalletV2',
}));
vi.mock('../../src/lib/recoveryEnvelope', () => ({
  advanceRecoveryIndex: () => {
    throw new Error('tests pass their own advanceIndex');
  },
}));
vi.mock('../../src/lib/fingerprint', () => ({
  getRandomParams: () => 'r'.repeat(128),
}));

import {
  RANDOM_PARAMS_STORAGE_KEY,
  secureWalletAfterRecovery,
} from '../../src/lib/recoveryRotation';
import type {
  VaultLockManager,
  VaultStorage,
} from '../../src/lib/vaultUpgrade';

const USER = 'user-password';
const RECOVERED = 'a'.repeat(128);
const ROTATED = 'b'.repeat(128);
const FINGERPRINT = 'fresh-fingerprint';
const SEED =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function memoryStorage(initial: Record<string, string>, events: string[]) {
  const data = new Map(Object.entries(initial));
  const storage: VaultStorage & { data: Map<string, string> } = {
    data,
    getRaw: (key) => data.get(key) ?? null,
    getFresh: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      events.push(`write:${key}`);
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  return storage;
}

const immediateLocks: VaultLockManager = {
  request: (_name, _options, callback) => callback(),
};

/** A view that closes mid-rotation: the lock is never granted. */
const stalledLocks: VaultLockManager = {
  request: () => new Promise(() => undefined),
};

async function setup(lockManager: VaultLockManager | null) {
  const events: string[] = [];
  const storage = memoryStorage(
    {
      // The drifted fingerprint no longer opens this one.
      [RANDOM_PARAMS_STORAGE_KEY]: await passworderEncrypt(
        'old-fingerprint',
        RECOVERED,
      ),
      walletSeed: await passworderEncrypt(USER + RECOVERED, SEED),
    },
    events,
  );
  const advanceIndex = vi.fn(() => {
    events.push('advance');
  });
  const run = (rotate = true) =>
    secureWalletAfterRecovery({
      userPassword: USER,
      recoveredRandomParams: RECOVERED,
      freshFingerprint: FINGERPRINT,
      rotate,
      onStep: (step) => events.push(`step:${step}`),
      randomParamsStorage: storage,
      locations: [{ storage, key: 'walletSeed' }],
      lockOptions: { lockManager },
      advanceIndex,
      generateRandomParams: () => ROTATED,
    });
  /** What a fresh login would get: randomParams, and does the seed open? */
  const unlockState = async () => {
    const randomParams = (await passworderDecrypt(
      FINGERPRINT,
      storage.data.get(RANDOM_PARAMS_STORAGE_KEY) as string,
    )) as string;
    const seed = await passworderDecrypt(
      USER + randomParams,
      storage.data.get('walletSeed') as string,
    );
    return { randomParams, seed };
  };
  return { events, storage, advanceIndex, run, unlockState };
}

describe('secureWalletAfterRecovery', () => {
  it('saves the recovered randomParams first, advances the index, then rotates in one commit', async () => {
    const t = await setup(immediateLocks);
    const result = await t.run();
    expect(result).toEqual({ randomParams: ROTATED, rotated: true });
    expect(t.events).toEqual([
      'write:randomParams', // 1. recoverable state
      'step:fallback_saved',
      'advance', // 2. spent index
      'step:rotating',
      'write:walletSeed', // 3. one commit: blobs, then the new randomParams
      'write:randomParams',
    ]);
    expect(await t.unlockState()).toEqual({
      randomParams: ROTATED,
      seed: SEED,
    });
  });

  it('a rotation interrupted mid-way leaves a wallet that unlocks locally', async () => {
    const t = await setup(stalledLocks);
    let rotating!: () => void;
    const reachedRotation = new Promise<void>((resolve) => {
      rotating = resolve;
    });
    const events = t.events;
    events.push = (...items: string[]) => {
      if (items.includes('step:rotating')) rotating();
      return Array.prototype.push.apply(events, items);
    };
    void t.run();
    await reachedRotation;
    // The popup closes here. The next login decrypts randomParams with the
    // fresh fingerprint and the seed opens with them — no second recovery.
    expect(t.advanceIndex).toHaveBeenCalledTimes(1);
    expect(await t.unlockState()).toEqual({
      randomParams: RECOVERED,
      seed: SEED,
    });
  });

  it('a refused rotation (no Web Locks) keeps the recovered randomParams', async () => {
    const t = await setup(null);
    const result = await t.run();
    expect(result).toEqual({ randomParams: RECOVERED, rotated: false });
    expect(t.advanceIndex).toHaveBeenCalledTimes(1);
    expect(t.events).not.toContain('write:walletSeed');
    expect(await t.unlockState()).toEqual({
      randomParams: RECOVERED,
      seed: SEED,
    });
  });

  it('cancelled after the exchange: saved and advanced, never rotated', async () => {
    const t = await setup(immediateLocks);
    const result = await t.run(false);
    expect(result).toEqual({ randomParams: RECOVERED, rotated: false });
    expect(t.events).toEqual([
      'write:randomParams',
      'step:fallback_saved',
      'advance',
    ]);
    expect(await t.unlockState()).toEqual({
      randomParams: RECOVERED,
      seed: SEED,
    });
  });

  it('keeps the envelope (no advance) when randomParams cannot be saved', async () => {
    const t = await setup(immediateLocks);
    t.storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    await expect(t.run()).rejects.toThrow('QuotaExceededError');
    expect(t.advanceIndex).not.toHaveBeenCalled();
  });
});
