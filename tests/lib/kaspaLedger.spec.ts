// @ts-nocheck test suite
/**
 * The wallet's Kaspa signed-amount ledger (reviews KAS-2 and KAS-6), driven
 * through the real signing path (signKasSend) with kaspa-core:
 *  - KAS-2 (poc/kas-poc-ledger-poison.mjs): one lying UTXO answer used to
 *    poison an outpoint forever. A conflict is now resolved by PROOF
 *    (getFundingTransaction): proven ≠ entry ⇒ the entry moves to the proven
 *    amount and the truth is signable; proven = entry ⇒ still refused;
 *    unprovable ⇒ KasLedgerConflictError + an explicit per-outpoint reset;
 *  - KAS-6: an unreadable blob fails CLOSED (explicit quarantine reset only),
 *    eviction never drops a guard younger than 30 days, and concurrent
 *    signatures never lose each other's entries (one mutex);
 *  - the ledger is written before the signatures are returned;
 *  - KAS-7: kasUnitsToSompi accepts plain decimals only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as K from '@runonflux/kaspa-core';

const mem = vi.hoisted(() => ({ store: new Map(), failWrites: false }));
vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async (k) => (mem.store.has(k) ? mem.store.get(k) : null)),
    setItem: vi.fn(async (k, v) => {
      if (mem.failWrites) throw new Error('quota');
      mem.store.set(k, v);
    }),
  },
}));

import {
  KAS_LEDGER_MAX_ENTRIES,
  KAS_LEDGER_MIN_AGE_MS,
  KAS_LEDGER_QUARANTINE_PREFIX,
  KAS_LEDGER_RESET_PREFIX,
  KAS_LEDGER_STORAGE_KEY,
  KasLedgerConflictError,
  KasLedgerCorruptError,
  KasLedgerFullError,
  isKasLedgerConflictError,
  kasSignedAmountLedger,
  kasUnitsToSompi,
  resetCorruptKasLedger,
  resetKasLedgerOutpoints,
  signKasSend,
} from '../../src/lib/kaspa';

const k1 = new Uint8Array(32);
k1[31] = 1;
const k2 = new Uint8Array(32);
k2[31] = 2;
const WALLET_PRIV = K.bytesToHex(k1);
const wallet = K.localSigner(k1);
const key = K.localSigner(k2);
const vault = K.multisigSpend([wallet.xOnlyPublicKey, key.xOnlyPublicKey], 2);
const spk = K.spendScriptPublicKey(vault);
const recipient = K.addressToScriptPublicKey(
  'kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva',
  'kaspa',
);
const REAL = 1_000_000_000_000n; // 10,000 KAS on chain
const LIE = REAL - 1n;
const NOW = 1_800_000_000_000;

const txidBytes = (b: number) => new Uint8Array(32).fill(b);
const opKey = (b: number, index = 0) =>
  `${K.bytesToHex(txidBytes(b))}:${index}`;

function planned(amount: bigint, b = 9) {
  const input = {
    outpoint: { transactionId: txidBytes(b), index: 0 },
    entry: {
      amount,
      scriptPublicKey: spk,
      blockDaaScore: 0n,
      isCoinbase: false,
    },
    spend: vault,
  };
  const plan = K.planTransaction(
    [input],
    [{ scriptPublicKey: recipient, amount: 100_000_000n }],
    { feeRate: 100n, changeSpend: vault, allowChain: false },
  );
  return { plan, spend: vault, sender: '', chain: 'kas' };
}

/** REST stub: the chain-proven output of each funding transaction. */
function rest(proven: Record<string, bigint | 'unprovable'>, script = spk) {
  return {
    getFundingTransaction: vi.fn(async (id: string) => {
      const v = proven[id];
      if (v === undefined || v === 'unprovable') {
        throw new Error(`transaction ${id} could not be proven`);
      }
      return { outputs: [{ value: v, scriptPublicKey: script }] };
    }),
  };
}

const ledger = (now = NOW) => kasSignedAmountLedger(() => now);
const stored = () => mem.store.get(KAS_LEDGER_STORAGE_KEY);
const TX9 = K.bytesToHex(txidBytes(9));

beforeEach(() => {
  mem.store.clear();
  mem.failWrites = false;
});

describe('KAS-2: ledger conflicts are resolved by proof, not by trust', () => {
  it('PoC regression: one lie no longer locks the real amount out forever', async () => {
    const r = rest({ [TX9]: REAL });
    // session 1: the backend lies once; the signature commits to LIE (useless on chain)
    await signKasSend(planned(LIE), WALLET_PRIV, ledger(), r);
    expect(stored()[opKey(9)]).toBe(`${LIE}@${NOW}`);
    // session 2: honest backend — the chain proves REAL ≠ LIE: entry moves, signs
    await expect(
      signKasSend(planned(REAL), WALLET_PRIV, ledger(NOW + 1), r),
    ).resolves.toMatchObject({ txid: expect.any(String) });
    expect(stored()[opKey(9)]).toBe(`${REAL}@${NOW + 1}`);
    // session 3: still fine
    await signKasSend(planned(REAL), WALLET_PRIV, ledger(NOW + 2), r);
    expect(r.getFundingTransaction).toHaveBeenCalledTimes(1);
  });

  it('proven amount = ledger entry: the contradicting claim stays refused', async () => {
    const r = rest({ [TX9]: REAL });
    await signKasSend(planned(REAL), WALLET_PRIV, ledger(), r);
    const e = await signKasSend(planned(LIE), WALLET_PRIV, ledger(), r).catch(
      (x) => x,
    );
    expect(e).toBeInstanceOf(KasLedgerConflictError);
    expect(e.refused).toEqual([opKey(9)]);
    expect(e.unprovable).toEqual([]);
    expect(e.message).toMatch(/different amount/);
    expect(stored()[opKey(9)]).toBe(`${REAL}@${NOW}`);
  });

  it('proven amount differs from BOTH: entry moves to the proof, the lie is refused', async () => {
    const r = rest({ [TX9]: REAL });
    await signKasSend(planned(LIE), WALLET_PRIV, ledger(), r);
    const e = await signKasSend(
      planned(LIE - 5n),
      WALLET_PRIV,
      ledger(NOW + 9),
      r,
    ).catch((x) => x);
    expect(isKasLedgerConflictError(e)).toBe(true);
    expect(e.refused).toEqual([opKey(9)]);
    // persisted even though signing was refused
    expect(stored()[opKey(9)]).toBe(`${REAL}@${NOW + 9}`);
  });

  it('a lookalike conflict error without a `refused` list is not trusted as one', () => {
    // The reset UI decides on `refused`: a cross-realm error missing it must
    // never be read as "nothing proven wrong".
    const lookalike = Object.assign(new Error('x'), {
      name: 'KasLedgerConflictError',
      unprovable: [opKey(9)],
    });
    expect(isKasLedgerConflictError(lookalike)).toBe(false);
    expect(
      isKasLedgerConflictError(
        Object.assign(lookalike, { refused: [] as string[] }),
      ),
    ).toBe(true);
  });

  it('a proof whose script differs is refused, the entry untouched', async () => {
    const other = K.addressToScriptPublicKey(
      'kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva',
      'kaspa',
    );
    await signKasSend(planned(LIE), WALLET_PRIV, ledger(), rest({}));
    const e = await signKasSend(
      planned(REAL),
      WALLET_PRIV,
      ledger(),
      rest({ [TX9]: REAL }, other),
    ).catch((x) => x);
    expect(e.refused).toEqual([opKey(9)]);
    expect(stored()[opKey(9)]).toBe(`${LIE}@${NOW}`);
  });

  it('unprovable: conflict error; only an explicit per-outpoint reset lets it sign', async () => {
    const r = rest({ [TX9]: 'unprovable' });
    await signKasSend(planned(LIE), WALLET_PRIV, ledger(), r);
    const e = await signKasSend(planned(REAL), WALLET_PRIV, ledger(), r).catch(
      (x) => x,
    );
    expect(e).toBeInstanceOf(KasLedgerConflictError);
    expect(e.unprovable).toEqual([opKey(9)]);
    expect(e.refused).toEqual([]);
    // the user confirms the reset of exactly that coin
    expect(await resetKasLedgerOutpoints(e.unprovable, () => NOW + 5)).toBe(1);
    expect(stored()[opKey(9)]).toBeUndefined();
    expect(mem.store.get(`${KAS_LEDGER_RESET_PREFIX}${NOW + 5}`)).toEqual({
      [opKey(9)]: `${LIE}@${NOW}`,
    });
    await signKasSend(planned(REAL), WALLET_PRIV, ledger(), r);
    expect(stored()[opKey(9)]).toBe(`${REAL}@${NOW}`);
    // resetting an outpoint that is not in the ledger is a no-op
    expect(await resetKasLedgerOutpoints([opKey(7)])).toBe(0);
  });
});

describe('KAS-6: the ledger fails closed and never evicts young guards', () => {
  it('an unreadable blob refuses every signature until an explicit reset', async () => {
    for (const bad of ['garbage', [], { nope: '1' }, { [opKey(9)]: 'abc' }]) {
      mem.store.set(KAS_LEDGER_STORAGE_KEY, bad);
      await expect(
        signKasSend(planned(REAL), WALLET_PRIV, ledger(), rest({})),
      ).rejects.toBeInstanceOf(KasLedgerCorruptError);
    }
    expect(await resetCorruptKasLedger(() => NOW)).toBe(true);
    expect(mem.store.get(`${KAS_LEDGER_QUARANTINE_PREFIX}${NOW}`)).toEqual({
      [opKey(9)]: 'abc',
    });
    expect(stored()).toEqual({});
    await signKasSend(planned(REAL), WALLET_PRIV, ledger(), rest({}));
    // a healthy ledger can never be wiped by the corrupt-reset
    expect(await resetCorruptKasLedger()).toBe(false);
    expect(stored()[opKey(9)]).toBe(`${REAL}@${NOW}`);
  });

  it('reads legacy bare-amount entries', async () => {
    mem.store.set(KAS_LEDGER_STORAGE_KEY, { [opKey(9)]: REAL.toString() });
    await signKasSend(planned(REAL), WALLET_PRIV, ledger(), rest({}));
    const e = await signKasSend(
      planned(LIE),
      WALLET_PRIV,
      ledger(),
      rest({ [TX9]: REAL }),
    ).catch((x) => x);
    expect(e.refused).toEqual([opKey(9)]);
  });

  it('full of recent guards: refuses instead of evicting; old guards are evicted oldest first', async () => {
    const young = {};
    for (let i = 0; i < KAS_LEDGER_MAX_ENTRIES; i++) {
      young[`c${i.toString(16).padStart(63, '0')}:0`] = `1@${NOW - 1000}`;
    }
    mem.store.set(KAS_LEDGER_STORAGE_KEY, young);
    await expect(
      signKasSend(planned(REAL), WALLET_PRIV, ledger(), rest({})),
    ).rejects.toBeInstanceOf(KasLedgerFullError);
    const old = { ...young };
    const oldest = `b${'0'.repeat(63)}:0`;
    delete old[`c${'0'.repeat(63)}:0`];
    old[oldest] = `1@${NOW - KAS_LEDGER_MIN_AGE_MS - 1}`;
    mem.store.set(KAS_LEDGER_STORAGE_KEY, old);
    await signKasSend(planned(REAL), WALLET_PRIV, ledger(), rest({}));
    expect(stored()[oldest]).toBeUndefined();
    expect(stored()[opKey(9)]).toBe(`${REAL}@${NOW}`);
    expect(Object.keys(stored()).length).toBe(KAS_LEDGER_MAX_ENTRIES);
  });

  it('concurrent signatures never lose each other’s entries (one mutex)', async () => {
    await Promise.all([
      signKasSend(planned(REAL, 1), WALLET_PRIV, ledger(), rest({})),
      signKasSend(planned(REAL, 2), WALLET_PRIV, ledger(), rest({})),
      signKasSend(planned(REAL, 3), WALLET_PRIV, ledger(), rest({})),
    ]);
    expect(Object.keys(stored()).sort()).toEqual(
      [opKey(1), opKey(2), opKey(3)].sort(),
    );
  });

  it('the entry is persisted before the signature is released (a failed write refuses)', async () => {
    mem.failWrites = true;
    await expect(
      signKasSend(planned(REAL), WALLET_PRIV, ledger(), rest({})),
    ).rejects.toThrow(/quota/);
  });
});

describe('KAS-7: kasUnitsToSompi', () => {
  it('plain decimals with at most 8 places only', () => {
    expect(kasUnitsToSompi('1')).toBe(100_000_000n);
    expect(kasUnitsToSompi('0.5')).toBe(50_000_000n);
    expect(kasUnitsToSompi('1.00000001')).toBe(100_000_001n);
    for (const bad of [
      '0x10',
      '1e2',
      ' 1',
      '+1',
      '-1',
      '1_000',
      '1,000',
      '12.345678912',
      '0',
      '',
      'Infinity',
    ]) {
      expect(kasUnitsToSompi(bad)).toBeNull();
    }
  });
});
