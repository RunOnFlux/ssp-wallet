// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BigNumber from 'bignumber.js';

// In-memory localForage so snapshot-ring behavior is testable and corrupt
// values / read failures can be simulated.
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
  valueTokenBalances,
  mergeTokenHoldings,
  updatePortfolioSnapshots,
} from '../../src/lib/portfolio';

const usdc = {
  contract: '0xUSDC',
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: 6,
  logo: '',
};
const weth = {
  contract: '0xWETH',
  name: 'Wrapped Ether',
  symbol: 'WETH',
  decimals: 18,
  logo: '',
};
const native = {
  contract: '',
  name: 'Ethereum',
  symbol: 'ETH',
  decimals: 18,
  logo: '',
};
const specs = [native, usdc, weth];

// Token rates are keyed by lower-cased symbol (same as Home's TokenBox).
const cryptoRates = { usdc: 1, weth: 2000, eth: 2000 };
const fiatRates = { USD: 1, EUR: 0.5 };

describe('Portfolio Lib', () => {
  describe('valueTokenBalances', () => {
    it('values activated token balances in fiat using symbol rate', () => {
      const balances = [
        { contract: '0xUSDC', balance: '2500000' }, // 2.5 USDC
        { contract: '0xWETH', balance: '500000000000000000' }, // 0.5 WETH
      ];
      const holdings = valueTokenBalances(
        balances,
        ['0xUSDC', '0xWETH'],
        specs,
        cryptoRates,
        fiatRates,
        'USD',
      );
      expect(holdings).toHaveLength(2);
      const usdcH = holdings.find((h) => h.contract === '0xUSDC');
      expect(usdcH.symbol).toBe('USDC');
      expect(usdcH.crypto.toString()).toBe('2.5');
      expect(usdcH.fiat).toBeCloseTo(2.5, 10);
      const wethH = holdings.find((h) => h.contract === '0xWETH');
      expect(wethH.crypto.toString()).toBe('0.5');
      expect(wethH.fiat).toBeCloseTo(1000, 10);
    });

    it('applies the fiat currency rate', () => {
      const holdings = valueTokenBalances(
        [{ contract: '0xUSDC', balance: '1000000' }],
        ['0xUSDC'],
        specs,
        cryptoRates,
        fiatRates,
        'EUR',
      );
      expect(holdings[0].fiat).toBeCloseTo(0.5, 10);
    });

    it('skips tokens that are not activated (stale cached balances)', () => {
      const holdings = valueTokenBalances(
        [
          { contract: '0xUSDC', balance: '1000000' },
          { contract: '0xWETH', balance: '1000000000000000000' },
        ],
        ['0xWETH'],
        specs,
        cryptoRates,
        fiatRates,
        'USD',
      );
      expect(holdings).toHaveLength(1);
      expect(holdings[0].contract).toBe('0xWETH');
    });

    it('never counts the contract-less native pseudo-token', () => {
      const holdings = valueTokenBalances(
        [{ contract: '', balance: '1000000000000000000' }],
        ['', '0xUSDC'],
        specs,
        cryptoRates,
        fiatRates,
        'USD',
      );
      expect(holdings).toHaveLength(0);
    });

    it('skips balances without a known token spec', () => {
      const holdings = valueTokenBalances(
        [{ contract: '0xUNKNOWN', balance: '1000000' }],
        ['0xUNKNOWN'],
        specs,
        cryptoRates,
        fiatRates,
        'USD',
      );
      expect(holdings).toHaveLength(0);
    });

    it('treats missing rates as zero value, not NaN', () => {
      const holdings = valueTokenBalances(
        [{ contract: '0xUSDC', balance: '1000000' }],
        ['0xUSDC'],
        specs,
        {},
        fiatRates,
        'USD',
      );
      expect(holdings).toHaveLength(1);
      expect(holdings[0].fiat).toBe(0);
    });

    it('handles empty inputs', () => {
      expect(
        valueTokenBalances([], [], specs, cryptoRates, fiatRates, 'USD'),
      ).toEqual([]);
      expect(
        valueTokenBalances(
          [{ contract: '0xUSDC', balance: '1' }],
          [],
          specs,
          cryptoRates,
          fiatRates,
          'USD',
        ),
      ).toEqual([]);
    });
  });

  describe('mergeTokenHoldings', () => {
    const holding = (contract, symbol, crypto, fiat) => ({
      contract,
      symbol,
      name: symbol,
      crypto: new BigNumber(crypto),
      fiat,
    });

    it('sums the same token across wallets', () => {
      const merged = mergeTokenHoldings([
        [holding('0xUSDC', 'USDC', '1.5', 1.5)],
        [holding('0xUSDC', 'USDC', '2.5', 2.5)],
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0].crypto.toString()).toBe('4');
      expect(merged[0].fiat).toBeCloseTo(4, 10);
    });

    it('keeps distinct tokens separate and sorts by fiat desc', () => {
      const merged = mergeTokenHoldings([
        [holding('0xUSDC', 'USDC', '1', 1)],
        [holding('0xWETH', 'WETH', '1', 2000)],
      ]);
      expect(merged.map((h) => h.contract)).toEqual(['0xWETH', '0xUSDC']);
    });

    it('does not mutate its inputs', () => {
      const a = holding('0xUSDC', 'USDC', '1', 1);
      mergeTokenHoldings([[a], [holding('0xUSDC', 'USDC', '2', 2)]]);
      expect(a.crypto.toString()).toBe('1');
      expect(a.fiat).toBe(1);
    });

    it('handles empty input', () => {
      expect(mergeTokenHoldings([])).toEqual([]);
    });
  });

  describe('updatePortfolioSnapshots', () => {
    const SNAP_KEY = 'portfolioSnapshots';
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    beforeEach(() => {
      forageStore.clear();
      forageFailures.clear();
    });

    it('reports no change and writes NOTHING when total is 0 (rates not loaded / empty wallet)', async () => {
      const change = await updatePortfolioSnapshots(0, 'USD');
      expect(change).toEqual({ absolute: 0, percent: 0, available: false });
      expect(forageStore.has(SNAP_KEY)).toBe(false);
    });

    it('reports no change and writes nothing for NaN / negative / Infinity totals', async () => {
      for (const bad of [NaN, -5, Infinity]) {
        const change = await updatePortfolioSnapshots(bad, 'USD');
        expect(change.available).toBe(false);
      }
      expect(forageStore.has(SNAP_KEY)).toBe(false);
    });

    it('never shows -100% for a zero-balance wallet even with a real baseline', async () => {
      forageStore.set(SNAP_KEY, [
        { ts: Date.now() - DAY, total: 500, currency: 'USD' },
      ]);
      const change = await updatePortfolioSnapshots(0, 'USD');
      expect(change).toEqual({ absolute: 0, percent: 0, available: false });
      // and the poisoning zero-snapshot was NOT appended
      expect(forageStore.get(SNAP_KEY)).toHaveLength(1);
    });

    it('computes the 24h change against a same-currency baseline', async () => {
      forageStore.set(SNAP_KEY, [
        { ts: Date.now() - DAY, total: 100, currency: 'USD' },
      ]);
      const change = await updatePortfolioSnapshots(110, 'USD');
      expect(change.available).toBe(true);
      expect(change.absolute).toBeCloseTo(10, 10);
      expect(change.percent).toBeCloseTo(10, 10);
    });

    it('treats a currency mismatch as "no baseline", not a bogus change', async () => {
      // 100 USD yesterday vs 2300 CZK today must NOT read as +2200%.
      forageStore.set(SNAP_KEY, [
        { ts: Date.now() - DAY, total: 100, currency: 'USD' },
      ]);
      const change = await updatePortfolioSnapshots(2300, 'CZK');
      expect(change).toEqual({ absolute: 0, percent: 0, available: false });
      // a fresh CZK ring entry starts immediately after the switch
      const snaps = forageStore.get(SNAP_KEY);
      expect(snaps[snaps.length - 1]).toMatchObject({
        total: 2300,
        currency: 'CZK',
      });
    });

    it('never uses legacy currency-less snapshots as a baseline', async () => {
      forageStore.set(SNAP_KEY, [{ ts: Date.now() - DAY, total: 100 }]);
      const change = await updatePortfolioSnapshots(110, 'USD');
      expect(change.available).toBe(false);
    });

    it('records the fiat currency on every new snapshot', async () => {
      await updatePortfolioSnapshots(42, 'EUR');
      expect(forageStore.get(SNAP_KEY)).toEqual([
        expect.objectContaining({ total: 42, currency: 'EUR' }),
      ]);
    });

    it('does not throw on corrupt snapshot storage and recovers', async () => {
      forageStore.set(SNAP_KEY, 'garbage-not-an-array');
      const change = await updatePortfolioSnapshots(100, 'USD');
      expect(change.available).toBe(false);
      expect(forageStore.get(SNAP_KEY)).toEqual([
        expect.objectContaining({ total: 100, currency: 'USD' }),
      ]);
    });

    it('discards invalid entries inside a corrupt snapshot array', async () => {
      forageStore.set(SNAP_KEY, [
        null,
        'junk',
        { ts: 'yesterday', total: 100 },
        { ts: Date.now() - DAY, total: NaN, currency: 'USD' },
        { ts: Date.now() - DAY, total: 100, currency: 'USD' },
      ]);
      const change = await updatePortfolioSnapshots(150, 'USD');
      expect(change.available).toBe(true);
      expect(change.percent).toBeCloseTo(50, 10);
    });

    it('does not throw when the storage read itself rejects', async () => {
      forageFailures.add(SNAP_KEY);
      const change = await updatePortfolioSnapshots(100, 'USD');
      expect(change.available).toBe(false);
    });

    it('throttles same-currency snapshots to one per ~3h', async () => {
      await updatePortfolioSnapshots(100, 'USD');
      await updatePortfolioSnapshots(101, 'USD');
      expect(forageStore.get(SNAP_KEY)).toHaveLength(1);
    });

    it('prunes snapshots older than 48h', async () => {
      forageStore.set(SNAP_KEY, [
        { ts: Date.now() - 3 * DAY, total: 50, currency: 'USD' },
        { ts: Date.now() - 5 * HOUR, total: 90, currency: 'USD' },
      ]);
      await updatePortfolioSnapshots(100, 'USD');
      const snaps = forageStore.get(SNAP_KEY);
      expect(snaps.every((s) => Date.now() - s.ts < 2 * DAY)).toBe(true);
    });
  });
});
