// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory localForage so the discovery/cache loaders are testable and
// corrupt values / read failures can be simulated (mirrors portfolio.spec).
const { forageStore, forageFailures } = vi.hoisted(() => ({
  forageStore: new Map(),
  forageFailures: new Set(),
}));

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn((key) => {
      if (forageFailures.has(key)) {
        return Promise.reject(new Error('storage read failed'));
      }
      return Promise.resolve(
        forageStore.has(key) ? forageStore.get(key) : null,
      );
    }),
    setItem: vi.fn((key, value) => {
      forageStore.set(key, value);
      return Promise.resolve(value);
    }),
    removeItem: vi.fn((key) => {
      forageStore.delete(key);
      return Promise.resolve();
    }),
  },
}));

import {
  mergeChainTransactions,
  filterFeedByChain,
  buildTxRowIdentities,
  discoverActivityChains,
  loadCachedChainTransactions,
} from '../../src/lib/activityFeed';

const tx = (txid, timestamp, extra = {}) => ({
  txid,
  timestamp,
  blockheight: 100,
  fee: '100',
  amount: '5000',
  message: '',
  receiver: 'addr',
  ...extra,
});

describe('activityFeed merge/sort/filter', () => {
  it('merges multiple chains newest-first and tags each row with its chain', () => {
    const merged = mergeChainTransactions([
      { chain: 'btc', transactions: [tx('b1', 1000), tx('b2', 3000)] },
      { chain: 'eth', transactions: [tx('e1', 2000)] },
    ]);
    expect(merged.map((m) => m.txid)).toEqual(['b2', 'e1', 'b1']);
    expect(merged.map((m) => m.chain)).toEqual(['btc', 'eth', 'btc']);
  });

  it('keeps every field of the source transaction on the feed item', () => {
    const merged = mergeChainTransactions([
      {
        chain: 'sepolia',
        transactions: [tx('t1', 1, { tokenSymbol: 'USDC', decimals: 6 })],
      },
    ]);
    expect(merged[0]).toMatchObject({
      chain: 'sepolia',
      txid: 't1',
      tokenSymbol: 'USDC',
      decimals: 6,
      amount: '5000',
    });
  });

  it('breaks timestamp ties deterministically (txid, then chain)', () => {
    const sources = [
      { chain: 'flux', transactions: [tx('same', 500)] },
      { chain: 'btc', transactions: [tx('same', 500), tx('aaa', 500)] },
    ];
    const a = mergeChainTransactions(sources);
    const b = mergeChainTransactions([...sources].reverse());
    expect(a.map((m) => `${m.chain}:${m.txid}`)).toEqual(
      b.map((m) => `${m.chain}:${m.txid}`),
    );
    expect(a[0].txid).toBe('aaa'); // same ts → txid asc
    expect(a.map((m) => m.chain).slice(1)).toEqual(['btc', 'flux']); // then chain asc
  });

  it('drops malformed records instead of rendering broken rows', () => {
    const merged = mergeChainTransactions([
      {
        chain: 'btc',
        transactions: [tx('ok', 10), null, { timestamp: 20 }, { txid: '' }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].txid).toBe('ok');
  });

  it('handles empty and missing transaction lists', () => {
    expect(mergeChainTransactions([])).toEqual([]);
    expect(
      mergeChainTransactions([
        { chain: 'btc', transactions: [] },
        { chain: 'eth', transactions: undefined },
      ]),
    ).toEqual([]);
  });

  it('treats missing timestamps as oldest (sorted last)', () => {
    const merged = mergeChainTransactions([
      {
        chain: 'btc',
        transactions: [tx('no-ts', undefined), tx('recent', 999)],
      },
    ]);
    expect(merged.map((m) => m.txid)).toEqual(['recent', 'no-ts']);
  });

  it('filterFeedByChain: all passes through, chain narrows', () => {
    const merged = mergeChainTransactions([
      { chain: 'btc', transactions: [tx('b1', 2)] },
      { chain: 'eth', transactions: [tx('e1', 1)] },
    ]);
    expect(filterFeedByChain(merged, 'all')).toHaveLength(2);
    const only = filterFeedByChain(merged, 'eth');
    expect(only).toHaveLength(1);
    expect(only[0].chain).toBe('eth');
    expect(filterFeedByChain(merged, 'flux')).toEqual([]);
  });
});

describe('buildTxRowIdentities', () => {
  it('gives rows sharing one txid unique keys and 1-of-N ordinals', () => {
    // One EVM contract call → ETH value movement + token transfer: same txid.
    const rows = [
      tx('0xabc', 10, { amount: '-100', tokenSymbol: undefined }),
      tx('0xabc', 10, { amount: '5000', tokenSymbol: 'USDC' }),
      tx('0xother', 5),
    ];
    const ids = buildTxRowIdentities(rows);
    expect(ids).toHaveLength(3);
    expect(new Set(ids.map((i) => i.key)).size).toBe(3); // all unique
    expect(ids[0]).toMatchObject({ ordinal: 1, total: 2 });
    expect(ids[1]).toMatchObject({ ordinal: 2, total: 2 });
    expect(ids[2]).toMatchObject({ ordinal: 1, total: 1 });
  });

  it('keys identical duplicate rows apart via the occurrence ordinal', () => {
    const rows = [
      tx('dup', 1, { amount: '10' }),
      tx('dup', 1, { amount: '10' }),
    ];
    const ids = buildTxRowIdentities(rows);
    expect(ids[0].key).not.toBe(ids[1].key);
    expect(ids.map((i) => i.ordinal)).toEqual([1, 2]);
    expect(ids.map((i) => i.total)).toEqual([2, 2]);
  });

  it('is stable across rebuilds for the same input order', () => {
    const rows = [
      tx('0xabc', 10, { amount: '-100' }),
      tx('0xabc', 10, { amount: '5000', tokenSymbol: 'USDC' }),
    ];
    expect(buildTxRowIdentities(rows)).toEqual(buildTxRowIdentities(rows));
  });

  it('scopes txid grouping by chain (multi-chain feed)', () => {
    const rows = [
      { ...tx('same', 1), chain: 'btc' },
      { ...tx('same', 1), chain: 'eth' },
    ];
    const ids = buildTxRowIdentities(rows);
    // Same txid on DIFFERENT chains is not the same transaction — no link.
    expect(ids.map((i) => i.total)).toEqual([1, 1]);
    expect(ids[0].key).not.toBe(ids[1].key);
  });

  it('returns an empty array for an empty feed', () => {
    expect(buildTxRowIdentities([])).toEqual([]);
  });
});

describe('activityFeed storage loaders', () => {
  beforeEach(() => {
    forageStore.clear();
    forageFailures.clear();
  });

  it('discovers only chains with generated wallets, using their own walletInUse', async () => {
    forageStore.set('wallets-btc', { '0-0': 'btcaddr0', '0-1': 'btcaddr1' });
    forageStore.set('walletInUse-btc', '0-1');
    forageStore.set('wallets-eth', { '0-0': 'ethaddr0' });
    const discovered = await discoverActivityChains();
    const byChain = Object.fromEntries(discovered.map((d) => [d.chain, d]));
    expect(byChain.btc).toMatchObject({
      walletInUse: '0-1',
      address: 'btcaddr1',
    });
    expect(byChain.eth).toMatchObject({
      walletInUse: '0-0',
      address: 'ethaddr0',
    });
    expect(byChain.flux).toBeUndefined();
  });

  it('falls back to the first wallet when walletInUse points at a removed wallet', async () => {
    forageStore.set('wallets-btc', { '0-0': 'btcaddr0' });
    forageStore.set('walletInUse-btc', '0-7');
    const discovered = await discoverActivityChains();
    const btc = discovered.find((d) => d.chain === 'btc');
    expect(btc).toMatchObject({ walletInUse: '0-0', address: 'btcaddr0' });
  });

  it('never throws on corrupt storage — failed reads read as "not set up"', async () => {
    forageStore.set('wallets-btc', { '0-0': 'btcaddr0' });
    forageFailures.add('wallets-btc');
    const discovered = await discoverActivityChains();
    expect(discovered.find((d) => d.chain === 'btc')).toBeUndefined();
  });

  it('loads cached transactions and guards non-array records', async () => {
    forageStore.set('transactions-btc-0-0', [tx('t', 1)]);
    expect(await loadCachedChainTransactions('btc', '0-0')).toHaveLength(1);
    forageStore.set('transactions-eth-0-0', { corrupt: true });
    expect(await loadCachedChainTransactions('eth', '0-0')).toEqual([]);
    expect(await loadCachedChainTransactions('flux', '0-0')).toEqual([]);
  });
});
