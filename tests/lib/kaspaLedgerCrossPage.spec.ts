// @ts-nocheck test suite
/**
 * The Kaspa signed-amount ledger lock across extension pages.
 *
 * Every extension page (popup, full tab, side panel) loads its own copy of
 * lib/kaspa.ts, so the in-page mutex is per page, while localForage is shared
 * by all of them. Two pages signing at once could each read the ledger, sign,
 * and write back, and the second write dropped the first page's entries (an
 * outpoint left unguarded is the KAS-2 fee-inflation attack). The ledger is
 * now also under an exclusive Web Lock (navigator.locks, shared by the whole
 * origin) and fails CLOSED without one.
 *
 * Two "pages" are simulated as two fresh module instances of lib/kaspa.ts
 * (vi.resetModules) that share one storage and one LockManager.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as K from '@runonflux/kaspa-core';

const mem = vi.hoisted(() => ({
  store: new Map(),
  readDelayMs: 0,
  reads: 0,
  writes: 0,
}));
vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async (k) => {
      // Other modules read their own keys at import; count the ledger only.
      if (k === 'kas-signed-amounts') mem.reads++;
      // Slow storage: the value is read NOW and delivered later, so two
      // unlocked sessions both see the ledger as it was before either wrote.
      const v = mem.store.has(k) ? structuredClone(mem.store.get(k)) : null;
      await new Promise((r) => setTimeout(r, mem.readDelayMs));
      return v;
    }),
    setItem: vi.fn(async (k, v) => {
      if (k === 'kas-signed-amounts') mem.writes++;
      mem.store.set(k, v);
    }),
  },
}));

const KEY = 'kas-signed-amounts';
const NOW = 1_800_000_000_000;
const op = (b: number, index = 0) =>
  `${K.bytesToHex(new Uint8Array(32).fill(b))}:${index}`;

/** A fresh copy of lib/kaspa.ts, as a separate extension page loads it. */
async function openPage() {
  vi.resetModules();
  return import('../../src/lib/kaspa');
}

// --- a real consumer vault, to drive the signing path (signKasSend) --------
const k1 = new Uint8Array(32);
k1[31] = 1;
const k2 = new Uint8Array(32);
k2[31] = 2;
const WALLET_PRIV = K.bytesToHex(k1);
const vault = K.multisigSpend(
  [K.localSigner(k1).xOnlyPublicKey, K.localSigner(k2).xOnlyPublicKey],
  2,
);
const recipient = K.addressToScriptPublicKey(
  'kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva',
  'kaspa',
);
function planned(b: number, amount = 1_000_000_000n) {
  const plan = K.planTransaction(
    [
      {
        outpoint: {
          transactionId: new Uint8Array(32).fill(b),
          index: 0,
        },
        entry: {
          amount,
          scriptPublicKey: K.spendScriptPublicKey(vault),
          blockDaaScore: 0n,
          isCoinbase: false,
        },
        spend: vault,
      },
    ],
    [{ scriptPublicKey: recipient, amount: 100_000_000n }],
    { feeRate: 100n, changeSpend: vault, allowChain: false },
  );
  return { plan, spend: vault, sender: '', chain: 'kas' };
}
const noProofs = { getFundingTransaction: vi.fn() };

/** A LockManager that does NOT exclude: the in-page-only world before the fix. */
const nonExclusiveLocks = {
  request: async (_name, opts, cb) =>
    (typeof opts === 'function' ? opts : cb)({}),
};

beforeEach(() => {
  mem.store.clear();
  mem.readDelayMs = 0;
  mem.reads = 0;
  mem.writes = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Kaspa ledger lock across extension pages (Web Locks)', () => {
  it('the extension test runtime provides Web Locks (as Chrome/Firefox MV3 pages do)', () => {
    expect(typeof navigator.locks?.request).toBe('function');
  });

  it('control: with an in-page-only mutex, two pages lose an entry (the bug)', async () => {
    vi.stubGlobal('navigator', { locks: nonExclusiveLocks });
    mem.readDelayMs = 20;
    const pageA = await openPage();
    const pageB = await openPage();
    await Promise.all([
      pageA.kasSignedAmountLedger(() => NOW).set(op(1), 5n),
      pageB.kasSignedAmountLedger(() => NOW).set(op(2), 7n),
    ]);
    // Both read the empty ledger; the second write dropped the first entry.
    expect(Object.keys(mem.store.get(KEY))).toHaveLength(1);
  });

  it('two pages writing at once keep every entry (shared exclusive Web Lock)', async () => {
    mem.readDelayMs = 20;
    const pageA = await openPage();
    const pageB = await openPage();
    await Promise.all([
      pageA.kasSignedAmountLedger(() => NOW).set(op(1), 5n),
      pageB.kasSignedAmountLedger(() => NOW).set(op(2), 7n),
      pageA.kasSignedAmountLedger(() => NOW).set(op(3), 9n),
    ]);
    expect(mem.store.get(KEY)).toEqual({
      [op(1)]: `5@${NOW}`,
      [op(2)]: `7@${NOW}`,
      [op(3)]: `9@${NOW}`,
    });
  });

  it('two pages SIGNING at once both persist their guards before releasing', async () => {
    mem.readDelayMs = 15;
    const pageA = await openPage();
    const pageB = await openPage();
    const [a, b] = await Promise.all([
      pageA.signKasSend(
        planned(1),
        WALLET_PRIV,
        pageA.kasSignedAmountLedger(() => NOW),
        noProofs,
      ),
      pageB.signKasSend(
        planned(2),
        WALLET_PRIV,
        pageB.kasSignedAmountLedger(() => NOW),
        noProofs,
      ),
    ]);
    expect(a.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(b.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(mem.store.get(KEY)).sort()).toEqual(
      [op(1), op(2)].sort(),
    );
    // And page B's guard now binds page A too: a different amount for the
    // outpoint page B signed is refused in page A (no proof available).
    const e = await pageA
      .signKasSend(
        planned(2, 999_999_999n),
        WALLET_PRIV,
        pageA.kasSignedAmountLedger(() => NOW),
        {
          getFundingTransaction: vi.fn(async () =>
            Promise.reject(new Error('x')),
          ),
        },
      )
      .catch((x) => x);
    expect(pageA.isKasLedgerConflictError(e)).toBe(true);
    expect(e.unprovable).toEqual([op(2)]);
  });

  it('a page waits while another page holds the ledger', async () => {
    const pageA = await openPage();
    const pageB = await openPage();
    let release;
    const held = new Promise((r) => (release = r));
    let aInside = false;
    const aDone = pageA.withKasLedgerLock(async () => {
      aInside = true;
      await held;
      return 'a';
    });
    await vi.waitFor(() => expect(aInside).toBe(true));
    let bRan = false;
    const bDone = pageB.withKasLedgerLock(async () => {
      bRan = true;
      return 'b';
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(bRan).toBe(false); // page B is blocked by page A's lock
    release();
    await expect(aDone).resolves.toBe('a');
    await expect(bDone).resolves.toBe('b');
    expect(bRan).toBe(true);
  });

  it('a page that cannot get the lock in time refuses (KasLedgerLockError timeout)', async () => {
    const pageA = await openPage();
    const pageB = await openPage();
    let release;
    const held = new Promise((r) => (release = r));
    let aInside = false;
    const aDone = pageA.withKasLedgerLock(async () => {
      aInside = true;
      await held;
    });
    await vi.waitFor(() => expect(aInside).toBe(true));
    // Page B's wait times out at once.
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('timed out', 'TimeoutError')),
    );
    const fn = vi.fn();
    const e = await pageB.withKasLedgerLock(fn).catch((x) => x);
    expect(pageB.isKasLedgerLockError(e)).toBe(true);
    expect(e.reason).toBe('timeout');
    expect(fn).not.toHaveBeenCalled();
    release();
    await aDone;
  });

  it('an AbortError thrown by the session itself is NOT reported as a lock timeout', async () => {
    const page = await openPage();
    const own = new DOMException('fetch aborted', 'AbortError');
    const e = await page
      .withKasLedgerLock(async () => {
        throw own;
      })
      .catch((x) => x);
    expect(e).toBe(own);
  });

  it('fails CLOSED without Web Locks: nothing is read, signed or written', async () => {
    vi.stubGlobal('navigator', {});
    const page = await openPage();
    mem.store.set(KEY, { [op(9)]: `1@${NOW}` });
    const before = structuredClone(mem.store.get(KEY));
    const e = await page
      .signKasSend(
        planned(1),
        WALLET_PRIV,
        page.kasSignedAmountLedger(() => NOW),
        noProofs,
      )
      .catch((x) => x);
    expect(page.isKasLedgerLockError(e)).toBe(true);
    expect(e.reason).toBe('unavailable');
    expect(e.message).toMatch(/refusing to sign/);
    await expect(page.resetKasLedgerOutpoints([op(9)])).rejects.toMatchObject({
      name: 'KasLedgerLockError',
    });
    await expect(page.resetCorruptKasLedger()).rejects.toMatchObject({
      name: 'KasLedgerLockError',
    });
    await expect(
      page.kasSignedAmountLedger().set(op(1), 1n),
    ).rejects.toMatchObject({ name: 'KasLedgerLockError' });
    expect(mem.reads).toBe(0);
    expect(mem.writes).toBe(0);
    expect(mem.store.get(KEY)).toEqual(before);
  });

  it('fails CLOSED when navigator.locks is present but unusable', async () => {
    vi.stubGlobal('navigator', { locks: {} });
    const page = await openPage();
    await expect(
      page.withKasLedgerLock(async () => 'never'),
    ).rejects.toMatchObject({
      name: 'KasLedgerLockError',
      reason: 'unavailable',
    });
  });
});
