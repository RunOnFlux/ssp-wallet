// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
//
// Enterprise nonce pool — H-19 / EVM-6 / K2.
//
// The pool used to be read from react-secure-storage's per-view cache, so a
// popup / side panel opened earlier could sign with, and write back, nonces
// another view had already burned (nonce reuse => vault key extraction). These
// tests simulate SEVERAL extension views as separate module instances sharing
// one localStorage and one browser-wide Web Lock manager.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

// -------------------------------------------------------------------------
// Hoisted shared state: one "browser" (localStorage + navigator.locks) that
// every module instance (= extension view) sees.
// -------------------------------------------------------------------------
const shared = vi.hoisted(() => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k) : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };

  // Minimal browser-wide Web Locks implementation (exclusive mode).
  const queues = new Map<string, Promise<void>>();
  const held = new Set<string>();
  const locks = {
    request(name, options, callback) {
      if (options?.ifAvailable && (held.has(name) || queues.has(name))) {
        return Promise.resolve().then(() => callback(null));
      }
      const previous = queues.get(name) ?? Promise.resolve();
      let release;
      const mine = new Promise<void>((r) => {
        release = r;
      });
      const tail = previous.then(() => mine);
      queues.set(name, tail);
      return previous.then(async () => {
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          held.delete(name);
          release();
          if (queues.get(name) === tail) queues.delete(name);
        }
      });
    },
  };

  return {
    store,
    localStorage,
    locks,
    // Legacy react-secure-storage contents (pre-migration pool location).
    legacySecure: new Map<string, string>(),
    mockAxiosPost: vi.fn(),
    mockAxiosGet: vi.fn(),
    mockGeneratePublicNonce: vi.fn(),
  };
});

const MOCK_FINGERPRINT = 'f'.repeat(64);
const PASSWORD_BLOB = 'password-blob';
const PASSWORD = 'password';
const WK = 'bc1qwkidentitytest';

// Legacy react-secure-storage location of the pool — only read for the
// one-time migration now.
vi.mock('react-secure-storage', () => ({
  default: {
    getItem: (k: string) =>
      shared.legacySecure.has(k) ? shared.legacySecure.get(k) : null,
    setItem: (k: string, v: string) => {
      shared.legacySecure.set(k, v);
    },
    removeItem: (k: string) => {
      shared.legacySecure.delete(k);
    },
  },
}));

vi.mock('@metamask/browser-passworder', () => ({
  // Deterministic, reversible "encryption" for assertions.
  encrypt: vi.fn(async (pw: string, data: string) => `enc:${pw}:${data}`),
  decrypt: vi.fn(async (key: string, data: string) => {
    if (key === MOCK_FINGERPRINT && data === PASSWORD_BLOB) return PASSWORD;
    const prefix = `enc:${key}:`;
    if (typeof data === 'string' && data.startsWith(prefix)) {
      return data.slice(prefix.length);
    }
    throw new Error('bad decrypt');
  }),
}));

vi.mock('../../src/lib/fingerprint', () => ({
  getFingerprint: vi.fn(() => MOCK_FINGERPRINT),
}));

vi.mock('../../src/lib/wallet', () => ({
  generatePublicNonce: (...args) => shared.mockGeneratePublicNonce(...args),
}));

vi.mock('../../src/storage/ssp', () => ({
  sspConfig: vi.fn(() => ({ relay: 'relay.test.io' })),
}));

vi.mock('axios', () => ({
  default: {
    post: (...args) => shared.mockAxiosPost(...args),
    get: (...args) => shared.mockAxiosGet(...args),
  },
}));

type NonceModule = typeof import('../../src/lib/enterpriseNonces');

/** Import a fresh module instance = a new extension view. */
async function openView(): Promise<NonceModule> {
  vi.resetModules();
  return import('../../src/lib/enterpriseNonces');
}

function makeNonce(i: number) {
  // Realistic public nonces: uniformly random-looking x coordinates.
  const hex = createHash('sha256').update(`nonce-${i}`).digest('hex');
  return {
    k: `k_${i}`,
    kTwo: `kTwo_${i}`,
    kPublic: `02${hex}`,
    kTwoPublic: `03${hex}`,
  };
}

function poolInStorage(mod: NonceModule) {
  const raw = shared.store.get(mod.NONCE_POOL_STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw.slice(`enc:${PASSWORD}:`.length));
}

function seedPool(mod: NonceModule, nonces) {
  shared.store.set(
    mod.NONCE_POOL_STORAGE_KEY,
    `enc:${PASSWORD}:${JSON.stringify(nonces)}`,
  );
}

const fakeAuth = {
  signature: 'sig',
  message: '{"action":"action"}',
  publicKey: '02'.padEnd(66, 'a'),
  witnessScript: 'ws',
};

beforeEach(() => {
  shared.store.clear();
  shared.legacySecure.clear();
  shared.mockAxiosPost.mockReset();
  shared.mockAxiosGet.mockReset();
  shared.mockGeneratePublicNonce.mockReset();
  vi.stubGlobal('localStorage', shared.localStorage);
  vi.stubGlobal('navigator', { locks: shared.locks });
  shared.mockAxiosGet.mockResolvedValue({
    data: { data: { wallet: { available: 0 } } },
  });
  shared.mockAxiosPost.mockResolvedValue({
    data: { status: 'success', data: { purged: 0 } },
  });
  let counter = 1000;
  shared.mockGeneratePublicNonce.mockImplementation(() => makeNonce(counter++));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage model', () => {
  it('saves to localStorage (encrypted, no plaintext k) and loads fresh', async () => {
    const view = await openView();
    await view.saveEncryptedNonces([makeNonce(1), makeNonce(2)], PASSWORD_BLOB);
    const raw = shared.store.get(view.NONCE_POOL_STORAGE_KEY);
    expect(raw.startsWith(`enc:${PASSWORD}:`)).toBe(true);
    expect(await view.loadEncryptedNonces(PASSWORD_BLOB)).toEqual([
      makeNonce(1),
      makeNonce(2),
    ]);
  });

  it('migrates the legacy react-secure-storage pool once and removes it', async () => {
    shared.legacySecure.set(
      'enterpriseNoncesWallet',
      `enc:${PASSWORD}:${JSON.stringify([makeNonce(7)])}`,
    );
    const view = await openView();
    expect(await view.loadEncryptedNonces(PASSWORD_BLOB)).toEqual([
      makeNonce(7),
    ]);
    expect(shared.legacySecure.has('enterpriseNoncesWallet')).toBe(false);
    expect(poolInStorage(view)).toEqual([makeNonce(7)]);
  });

  it('returns [] when nothing is stored or decryption fails', async () => {
    const view = await openView();
    expect(await view.loadEncryptedNonces(PASSWORD_BLOB)).toEqual([]);
    shared.store.set(view.NONCE_POOL_STORAGE_KEY, 'garbage');
    expect(await view.loadEncryptedNonces(PASSWORD_BLOB)).toEqual([]);
  });

  it('saveEncryptedNonces throws when the password cannot be decrypted', async () => {
    const view = await openView();
    await expect(
      view.saveEncryptedNonces([makeNonce(1)], 'wrong-blob'),
    ).rejects.toThrow();
  });

  it('refuses to run without the Web Locks API in a browser page', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    const sign = vi.fn();
    await expect(
      view.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, sign),
    ).rejects.toMatchObject({ code: 'lock' });
    expect(sign).not.toHaveBeenCalled();
  });
});

describe('consumeEnterpriseNonce — check-and-burn', () => {
  it('burns the nonce durably BEFORE the signature is computed', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1), makeNonce(2)]);
    const reserved = makeNonce(1);
    const sig = await view.consumeEnterpriseNonce(
      reserved,
      PASSWORD_BLOB,
      (nonce) => {
        // At signing time the nonce is already burned and out of the pool.
        expect(nonce.k).toBe('k_1');
        expect(view.isEnterpriseNonceBurned(reserved.kPublic)).toBe(true);
        expect(poolInStorage(view)).toEqual([makeNonce(2)]);
        return 'partial-signature';
      },
    );
    expect(sig).toBe('partial-signature');
  });

  it('refuses a nonce that was already used (burned set is append-only)', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    await view.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, () => 'a');
    // Even if the nonce reappears in the pool, it is never used again.
    seedPool(view, [makeNonce(1)]);
    const sign = vi.fn();
    await expect(
      view.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, sign),
    ).rejects.toMatchObject({ code: 'already_used' });
    expect(sign).not.toHaveBeenCalled();
  });

  it('reports not_found for a nonce this device does not hold', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    await expect(
      view.consumeEnterpriseNonce(makeNonce(9), PASSWORD_BLOB, () => 'x'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('a failed signature leaves the nonce burned (lost, never reused)', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    await expect(
      view.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, () => {
        throw new Error('sign failed');
      }),
    ).rejects.toThrow('sign failed');
    expect(view.isEnterpriseNonceBurned(makeNonce(1).kPublic)).toBe(true);
  });

  it('refuses to sign when the burned record is corrupted (fail closed)', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    shared.store.set(view.BURNED_NONCES_STORAGE_KEY, '{not json');
    const sign = vi.fn();
    await expect(
      view.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, sign),
    ).rejects.toMatchObject({ code: 'storage' });
    expect(sign).not.toHaveBeenCalled();
  });
});

describe('two extension views (H-19 / EVM-6)', () => {
  it('a stale view can neither reuse nor resurrect a nonce burned by another view', async () => {
    const pool = [makeNonce(1), makeNonce(2), makeNonce(3)];
    // Snapshot taken by the older view (side panel) when it opened.
    const sidePanel = await openView();
    seedPool(sidePanel, pool);
    const staleSnapshot = await sidePanel.loadEncryptedNonces(PASSWORD_BLOB);
    expect(staleSnapshot).toHaveLength(3);

    // The popup burns nonce 1.
    const popup = await openView();
    await popup.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, () => 's1');

    // (1) Second use from the stale side panel is refused.
    const sign = vi.fn();
    await expect(
      sidePanel.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, sign),
    ).rejects.toMatchObject({ code: 'already_used' });
    expect(sign).not.toHaveBeenCalled();

    // (2) The stale view writing its old snapshot back does NOT resurrect it.
    await sidePanel.saveEncryptedNonces(staleSnapshot, PASSWORD_BLOB);
    const third = await openView();
    const reloaded = await third.loadEncryptedNonces(PASSWORD_BLOB);
    expect(reloaded.map((n) => n.kPublic)).not.toContain(makeNonce(1).kPublic);
    // (3) …and a third view cannot use it either.
    await expect(
      third.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, sign),
    ).rejects.toMatchObject({ code: 'already_used' });
    expect(sign).not.toHaveBeenCalled();
  });

  it('two views racing for the SAME reserved nonce produce exactly one signature', async () => {
    const viewA = await openView();
    seedPool(viewA, [makeNonce(1), makeNonce(2)]);
    const viewB = await openView();
    const signA = vi.fn(async () => 'A');
    const signB = vi.fn(async () => 'B');
    const results = await Promise.allSettled([
      viewA.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, signA),
      viewB.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, signB),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('already_used');
    expect(signA.mock.calls.length + signB.mock.calls.length).toBe(1);
  });

  it('K2: a replenish in one view never resurrects a nonce burned meanwhile in another', async () => {
    const replenishView = await openView();
    seedPool(replenishView, [makeNonce(1), makeNonce(2)]);
    const signingView = await openView();

    // Hold the POST /v1/nonces until the other view has signed.
    let releasePost;
    const postGate = new Promise((r) => {
      releasePost = r;
    });
    let postReached;
    const reachedPost = new Promise((r) => {
      postReached = r;
    });
    shared.mockAxiosPost.mockImplementation(async (url) => {
      if (url.endsWith('/v1/nonces')) {
        postReached();
        await postGate;
      }
      return { data: { status: 'success', data: { purged: 0 } } };
    });

    const replenishing = replenishView.replenishWalletEnterpriseNonces(
      WK,
      PASSWORD_BLOB,
      false,
      { createAuth: async () => fakeAuth },
    );
    // The replenish has taken its snapshot and is waiting on the relay.
    await reachedPost;
    await signingView.consumeEnterpriseNonce(
      makeNonce(1),
      PASSWORD_BLOB,
      () => 'sig',
    );
    releasePost();
    const result = await replenishing;
    expect(result.ok).toBe(true);
    expect(result.generated).toBe(50);

    const final = poolInStorage(replenishView).map((n) => n.kPublic);
    expect(final).not.toContain(makeNonce(1).kPublic);
    expect(final).toContain(makeNonce(2).kPublic);
    expect(final).toHaveLength(1 + 50);
  });

  it('only one replenish runs at a time across views (the other reports busy)', async () => {
    const viewA = await openView();
    const viewB = await openView();
    let releaseStatus;
    shared.mockAxiosGet.mockImplementation(
      () =>
        new Promise((r) => {
          releaseStatus = () =>
            r({ data: { data: { wallet: { available: 50 } } } });
        }),
    );
    const first = viewA.replenishWalletEnterpriseNonces(WK, PASSWORD_BLOB);
    await new Promise((r) => setTimeout(r, 10));
    const second = await viewB.replenishWalletEnterpriseNonces(
      WK,
      PASSWORD_BLOB,
    );
    expect(second).toEqual({ ok: false, generated: 0, reason: 'busy' });
    releaseStatus();
    await first;
  });

  it('forceReplace waits for an in-flight replenish instead of reporting busy', async () => {
    const viewA = await openView();
    const viewB = await openView();
    let release;
    shared.mockAxiosGet.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = () => r({ data: { data: { wallet: { available: 50 } } } });
        }),
    );
    shared.mockAxiosGet.mockResolvedValue({
      data: { data: { wallet: { available: 50 } } },
    });
    const first = viewA.replenishWalletEnterpriseNonces(WK, PASSWORD_BLOB);
    await new Promise((r) => setTimeout(r, 10));
    const forced = viewB.replenishWalletEnterpriseNonces(
      WK,
      PASSWORD_BLOB,
      true,
      { createAuth: async () => fakeAuth },
    );
    release();
    await first;
    const res = await forced;
    expect(res.reason).not.toBe('busy');
  });
});

describe('replenishWalletEnterpriseNonces', () => {
  it('generates up to TARGET_COUNT, submits ONLY public parts, then stores', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    shared.mockAxiosGet.mockResolvedValue({
      data: { data: { wallet: { available: 1 } } },
    });
    const order: string[] = [];
    shared.mockAxiosPost.mockImplementation(async (url) => {
      order.push(url);
      return { data: { status: 'success', data: { purged: 0 } } };
    });
    const res = await view.replenishWalletEnterpriseNonces(
      WK,
      PASSWORD_BLOB,
      false,
      { createAuth: async () => fakeAuth },
    );
    expect(res).toEqual({ ok: true, generated: 49 });
    const submit = shared.mockAxiosPost.mock.calls.find(([u]) =>
      u.endsWith('/v1/nonces'),
    );
    expect(submit[0]).toBe('https://relay.test.io/v1/nonces');
    expect(submit[1].nonces).toHaveLength(49);
    for (const n of submit[1].nonces) {
      expect(Object.keys(n).sort()).toEqual(['kPublic', 'kTwoPublic']);
    }
    expect(JSON.stringify(submit[1])).not.toContain('"k_');
    expect(order).toEqual([
      'https://relay.test.io/v1/nonces/reconcile',
      'https://relay.test.io/v1/nonces',
    ]);
    expect(poolInStorage(view)).toHaveLength(50);
  });

  it('RA-2: signs the reconcile and submit bodies with WK auth', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    const createAuth = vi.fn(async () => fakeAuth);
    await view.replenishWalletEnterpriseNonces(WK, PASSWORD_BLOB, false, {
      createAuth,
    });
    expect(createAuth).toHaveBeenCalledTimes(2);
    for (const [, body] of shared.mockAxiosPost.mock.calls) {
      expect(body).toMatchObject({ wkIdentity: WK, ...fakeAuth });
    }
    // The hashed body is the one WITHOUT auth fields, in send order.
    const [, , signedBody] = createAuth.mock.calls[1];
    expect(Object.keys(signedBody)).toEqual(['wkIdentity', 'source', 'nonces']);
  });

  it('RA-4: signs the GET status read with the supplied read-auth headers', async () => {
    const view = await openView();
    const readHeaders = vi.fn(async (url) => ({ 'x-ssp-message': url }));
    await view.replenishWalletEnterpriseNonces(WK, PASSWORD_BLOB, false, {
      createAuth: async () => fakeAuth,
      readHeaders,
    });
    const statusUrl = `https://relay.test.io/v1/nonces/status/${WK}`;
    expect(readHeaders).toHaveBeenCalledWith(statusUrl);
    const [url, config] = shared.mockAxiosGet.mock.calls[0];
    expect(url).toBe(statusUrl);
    expect(config.headers).toEqual({ 'x-ssp-message': statusUrl });
  });

  it('refuses to submit when relay auth is unavailable', async () => {
    const view = await openView();
    const res = await view.replenishWalletEnterpriseNonces(
      WK,
      PASSWORD_BLOB,
      false,
      { createAuth: async () => null },
    );
    expect(res).toEqual({
      ok: false,
      generated: 0,
      reason: 'auth_unavailable',
    });
    expect(
      shared.mockAxiosPost.mock.calls.some(([u]) => u.endsWith('/v1/nonces')),
    ).toBe(false);
  });

  it('does NOT store locally when the relay submission fails', async () => {
    const view = await openView();
    shared.mockAxiosPost.mockImplementation(async (url) => {
      if (url.endsWith('/v1/nonces')) throw new Error('500');
      return { data: { data: { purged: 0 } } };
    });
    const res = await view.replenishWalletEnterpriseNonces(
      WK,
      PASSWORD_BLOB,
      false,
      { createAuth: async () => fakeAuth },
    );
    expect(res).toEqual({ ok: false, generated: 0, reason: 'submit_failed' });
    expect(poolInStorage(view)).toBeNull();
  });

  it('skips when the pool is healthy on both sides', async () => {
    const view = await openView();
    seedPool(
      view,
      Array.from({ length: 50 }, (_, i) => makeNonce(i + 1)),
    );
    shared.mockAxiosGet.mockResolvedValue({
      data: { data: { wallet: { available: 50 } } },
    });
    const res = await view.replenishWalletEnterpriseNonces(
      WK,
      PASSWORD_BLOB,
      false,
      { createAuth: async () => fakeAuth },
    );
    expect(res).toEqual({ ok: true, generated: 0, reason: 'not_needed' });
  });

  it('never posts a nonce body unsigned (RA-2): no relay auth, nothing sent', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    shared.mockAxiosGet.mockResolvedValue({
      data: { data: { wallet: { available: 1 } } },
    });
    const res = await view.replenishWalletEnterpriseNonces(WK, PASSWORD_BLOB);
    expect(res).toEqual({
      ok: false,
      generated: 0,
      reason: 'auth_unavailable',
    });
    expect(shared.mockAxiosPost).not.toHaveBeenCalled();
    // Nothing was generated or stored either.
    expect(poolInStorage(view)).toEqual([makeNonce(1)]);
  });

  it('does not overwrite real nonces when the pool cannot be read', async () => {
    const view = await openView();
    shared.store.set(view.NONCE_POOL_STORAGE_KEY, `enc:${PASSWORD}:not-json`);
    const res = await view.replenishWalletEnterpriseNonces(
      WK,
      PASSWORD_BLOB,
      false,
      { createAuth: async () => fakeAuth },
    );
    expect(res.ok).toBe(false);
    expect(shared.store.get(view.NONCE_POOL_STORAGE_KEY)).toBe(
      `enc:${PASSWORD}:not-json`,
    );
  });
});

describe('legacy pool migration (under the pool lock)', () => {
  it('waits for the pool lock and never lands on a pool another view wrote meanwhile', async () => {
    shared.legacySecure.set(
      'enterpriseNoncesWallet',
      `enc:${PASSWORD}:${JSON.stringify([makeNonce(1), makeNonce(2)])}`,
    );
    const view = await openView();
    // Another view holds the pool lock (it is migrating and burning nonce 1).
    let releaseLock;
    let lockTaken;
    const taken = new Promise((r) => {
      lockTaken = r;
    });
    const otherView = shared.locks.request(
      view.NONCE_POOL_LOCK,
      {},
      () =>
        new Promise((r) => {
          lockTaken();
          releaseLock = r;
        }),
    );
    await taken;
    const loading = view.loadEncryptedNonces(PASSWORD_BLOB);
    await new Promise((r) => setTimeout(r, 10));
    // Not migrated while the lock is held elsewhere.
    expect(shared.store.has(view.NONCE_POOL_STORAGE_KEY)).toBe(false);
    expect(shared.legacySecure.has('enterpriseNoncesWallet')).toBe(true);
    // The other view finishes ITS migration with nonce 1 already burned.
    seedPool(view, [makeNonce(2)]);
    releaseLock();
    await otherView;
    // The re-check inside the lock sees the migrated pool: no overwrite with
    // the stale legacy copy that still contains nonce 1.
    expect(await loading).toEqual([makeNonce(2)]);
    expect(poolInStorage(view)).toEqual([makeNonce(2)]);
  });
});

describe('consumeEnterpriseNonceForPartial — retry after a failed post', () => {
  const binding = {
    message: '0x' + 'ab'.repeat(32),
    signingKeys: ['02' + '11'.repeat(32), '03' + '22'.repeat(32)],
    signingNonces: [
      { kPublic: makeNonce(1).kPublic, kTwoPublic: makeNonce(1).kTwoPublic },
      { kPublic: makeNonce(9).kPublic, kTwoPublic: makeNonce(9).kTwoPublic },
    ],
  };
  const partial = { sigOne: 'partial-1', challenge: 'challenge-1' };

  it('re-posts the SAME partial for the same nonce, message and signer set', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    const sign = vi.fn(() => partial);
    const first = await view.consumeEnterpriseNonceForPartial(
      makeNonce(1),
      PASSWORD_BLOB,
      binding,
      'request-1',
      sign,
    );
    expect(first).toEqual({
      ...partial,
      requestId: 'request-1',
      replayed: false,
    });
    // The post failed; the user retries (a new dialog, a new request id).
    const retry = await view.consumeEnterpriseNonceForPartial(
      makeNonce(1),
      PASSWORD_BLOB,
      {
        ...binding,
        message: binding.message.toUpperCase().replace('0X', '0x'),
      },
      'request-2',
      sign,
    );
    expect(sign).toHaveBeenCalledTimes(1);
    expect(retry).toEqual({
      ...partial,
      requestId: 'request-1',
      replayed: true,
    });
  });

  it('works across views (the record is in shared storage)', async () => {
    const viewA = await openView();
    seedPool(viewA, [makeNonce(1)]);
    await viewA.consumeEnterpriseNonceForPartial(
      makeNonce(1),
      PASSWORD_BLOB,
      binding,
      'request-1',
      () => partial,
    );
    const viewB = await openView();
    const sign = vi.fn();
    const retry = await viewB.consumeEnterpriseNonceForPartial(
      makeNonce(1),
      PASSWORD_BLOB,
      binding,
      'request-2',
      sign,
    );
    expect(sign).not.toHaveBeenCalled();
    expect(retry.replayed).toBe(true);
    expect(retry.sigOne).toBe('partial-1');
  });

  it('never signs or replays a burned nonce for a DIFFERENT message', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    await view.consumeEnterpriseNonceForPartial(
      makeNonce(1),
      PASSWORD_BLOB,
      binding,
      'request-1',
      () => partial,
    );
    const sign = vi.fn();
    await expect(
      view.consumeEnterpriseNonceForPartial(
        makeNonce(1),
        PASSWORD_BLOB,
        { ...binding, message: '0x' + 'cd'.repeat(32) },
        'request-2',
        sign,
      ),
    ).rejects.toMatchObject({ code: 'already_used' });
    expect(sign).not.toHaveBeenCalled();
  });

  it('refuses a replay for a different signer set', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    await view.consumeEnterpriseNonceForPartial(
      makeNonce(1),
      PASSWORD_BLOB,
      binding,
      'request-1',
      () => partial,
    );
    await expect(
      view.consumeEnterpriseNonceForPartial(
        makeNonce(1),
        PASSWORD_BLOB,
        { ...binding, signingKeys: [...binding.signingKeys].reverse() },
        'request-2',
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: 'already_used' });
  });

  it('a nonce burned without a stored partial stays refused', async () => {
    const view = await openView();
    seedPool(view, [makeNonce(1)]);
    await view.consumeEnterpriseNonce(makeNonce(1), PASSWORD_BLOB, () => 's');
    await expect(
      view.consumeEnterpriseNonceForPartial(
        makeNonce(1),
        PASSWORD_BLOB,
        binding,
        'request-1',
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: 'already_used' });
  });
});
