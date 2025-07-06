/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import {
  getFiatSymbol,
  decimalPlaces,
  formatCrypto,
  formatFiat,
  formatFiatWithSymbol,
  fetchRate,
  fetchAllRates,
} from '../../src/lib/currency';
import * as sspStorage from '@storage/ssp';
import BigNumber from 'bignumber.js';
import axios from 'axios';

// Mock the sspStorage module
vi.mock('@storage/ssp', () => ({
  sspConfig: vi.fn(),
}));

// Mock axios
vi.mock('axios');

describe('Currency Lib', () => {
  describe('Verifies currency', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    beforeAll(() => {
      // JSDOM is already set up in setup.ts
    });

    it('should return data when value is valid', () => {
      const res = getFiatSymbol('USD');
      expect(res).toBe('$');
    });

    it('should return without data when value is invalid', () => {
      const res = getFiatSymbol('UST');
      expect(res).toBe('');
    });

    it('should return data 2 when value is valid', () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        fiatCurrency: 'USD',
      });
      const res = decimalPlaces();
      expect(res).toBe(2);
    });

    it('should return data 4 when value is valid', () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        fiatCurrency: 'BTC',
      });
      const res = decimalPlaces();
      expect(res).toBe(4);
    });

    it('should return crypto data formatted when value is valid', () => {
      const res = formatCrypto(new BigNumber(1.0));
      expect(res).toBe('1');
    });

    it('should return fiat data formatted when value is valid', () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        fiatCurrency: 'USD',
      });
      const res = formatFiat(new BigNumber(1.0));
      expect(res).toBe('1.00');
    });

    it('should return fiat with symbol formatted when value is valid', () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        fiatCurrency: 'USD',
        fiatSymbol: 'USD',
      });
      const res = formatFiatWithSymbol(new BigNumber(1.0));
      expect(res).toBe('1.00 USD');
    });

    it('should return rates when value is undefined', async () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        relay: 'test-relay.com',
      });
      vi.mocked(axios.get).mockResolvedValue(undefined);

      await expect(fetchRate('ETH')).rejects.toThrow(
        "Cannot read properties of undefined (reading 'data')",
      );
    });

    it('should return rates when value is null', async () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        relay: 'test-relay.com',
      });
      vi.mocked(axios.get).mockResolvedValue(null);

      await expect(fetchRate('ETH')).rejects.toThrow(
        "Cannot read properties of null (reading 'data')",
      );
    });

    it('should return rates for fiat when value is valid', async () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        relay: 'test-relay.com',
      });
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          fiat: { JPY: 145.2032555 },
          crypto: {
            btc: 61508.59808270864,
            flux: 0.5750235389063905,
            rvn: 0.018527379859369836,
            ltc: 64.09884198167549,
            doge: 0.10923927081626982,
            eth: 2677.5115070999564,
            zec: 40.415534125354206,
            bch: 356.28178295334055,
            usdt: 0.9999977433011092,
            usdc: 0.9997477197809201,
          },
        },
      });

      const res = await fetchRate('usdt');
      expect(res).toEqual({ JPY: 145.20292781997438 });
    });

    it('should return rates for crypto when value is valid', async () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        relay: 'test-relay.com',
      });
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          fiat: { JPY: 145.2032555 },
          crypto: {
            btc: 61508.59808270864,
            flux: 0.5750235389063905,
            rvn: 0.018527379859369836,
            ltc: 64.09884198167549,
            doge: 0.10923927081626982,
            eth: 2677.5115070999564,
            zec: 40.415534125354206,
            bch: 356.28178295334055,
            usdt: 0.9999977433011092,
            usdc: 0.9997477197809201,
          },
        },
      });

      const res = await fetchRate('btc');
      expect(res).toEqual({ JPY: 8931248.682850353 });
    });

    it('should return all rates when value is valid', async () => {
      const sspConfigSpy = vi.mocked(sspStorage.sspConfig);
      sspConfigSpy.mockReturnValue({
        relay: 'test-relay.com',
      });
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          fiat: { JPY: 145.2032555 },
          crypto: {
            btc: 61508.59808270864,
            flux: 0.5750235389063905,
            rvn: 0.018527379859369836,
            ltc: 64.09884198167549,
            doge: 0.10923927081626982,
            eth: 2677.5115070999564,
            zec: 40.415534125354206,
            bch: 356.28178295334055,
            usdt: 0.9999977433011092,
            usdc: 0.9997477197809201,
          },
        },
      });

      const res = await fetchAllRates('btc');
      expect(res).toHaveProperty('crypto');
      expect(res).toHaveProperty('fiat');
      expect(res.fiat).not.toBeNull();
      expect(res.fiat).toBeDefined();
      expect(res.crypto).not.toBeNull();
      expect(res.crypto).toBeDefined();
    });
  });
});
