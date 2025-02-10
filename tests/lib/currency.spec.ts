/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';

import { restore, stub } from 'sinon';
import axios from 'axios';
import { describe, it, afterEach } from 'mocha';

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
import { JSDOM } from 'jsdom';

const { expect, assert } = chai;

describe('Currency Lib', function () {
  describe('Verifies currency', function () {
    afterEach(function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      restore();
    });

    before(function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const { window } = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      global.navigator = window.navigator;
    });

    it('should return data when value is valid', function () {
      const res = getFiatSymbol('USD');
      assert.equal(res, `$`);
    });

    it('should return without data when value is invalid', function () {
      const res = getFiatSymbol('UST');
      assert.equal(res, '');
    });

    it('should return data 2 when value is valid', function () {
      const res = decimalPlaces();
      assert.equal(res, 2);
    });
    it('should return data 4 when value is valid', function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const sspConfigStub = stub(sspStorage, 'sspConfig');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      sspConfigStub.returns({
        fiatCurrency: 'BTC',
      });
      const res = decimalPlaces();
      assert.equal(res, 4);
    });

    it('should return crypto data formatted when value is valid', function () {
      const res = formatCrypto(new BigNumber(1.0));
      assert.equal(res, 1.0);
    });

    it('should return fiat data formatted when value is valid', function () {
      const res = formatFiat(new BigNumber(1.0));
      assert.equal(res, 1.0);
    });

    it('should return fiat with symbol formatted when value is valid', function () {
      const res = formatFiatWithSymbol(new BigNumber(1.0));
      assert.equal(res, `$1.00 USD`);
    });

    it('should return rates when value is undefined', async function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await stub(axios, 'get').returns(undefined);
      await fetchRate('ETH').catch((e) => {
        assert.equal(
          e,
          `TypeError: Cannot read properties of undefined (reading 'data')`,
        );
      });
    });

    it('should return rates when value is null', async function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await stub(axios, 'get').returns(null);
      await fetchRate('ETH').catch((e) => {
        assert.equal(
          e,
          `TypeError: Cannot read properties of null (reading 'data')`,
        );
      });
    });

    it('should return rates for fiat when value is valid', async function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await stub(axios, 'get').returns({
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
      assert.deepEqual(res, { JPY: 145.20292781997438 });
    });

    it('should return rates for crypto when value is valid', async function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await stub(axios, 'get').returns({
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
      assert.deepEqual(res, { JPY: 8931248.682850353 });
    });

    it('should return all rates when value is valid', async function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await stub(axios, 'get').returns({
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
      expect(res).to.have.property('crypto');
      expect(res).to.have.property('fiat');
      expect(res.fiat).to.not.be.null;
      expect(res.fiat).to.not.be.undefined;
      expect(res.crypto).to.not.be.null;
      expect(res.crypto).to.not.be.undefined;
    });
  });
});
