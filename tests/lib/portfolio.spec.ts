// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import {
  valueTokenBalances,
  mergeTokenHoldings,
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
});
