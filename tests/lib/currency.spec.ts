/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import sinon from 'sinon';
import httpMocks from 'node-mocks-http';
import axios from 'axios';

import { 
    supportedFiatValues, 
    getFiatSymbol,
    decimalPlaces,
    formatCrypto,
    formatFiat,
    formatFiatWithSymbol,
    fetchRate,
    fetchAllRates
} from '../../src/lib/currency';

import { sspConfig } from '@storage/ssp';

const BigNumber = require('bignumber.js');
var  MockBrowser = require('mock-browser').mocks.MockBrowser;

const { expect, assert } = chai;

describe('Currency Lib', () => {
  describe('Verifies currency', () => {
    afterEach(function() {
      sinon.restore();
    });

    before(function(){
      var mock = new MockBrowser();
      global.navigator = mock.getNavigator();
    });

    it('should return data when value is valid', async () => {
        const res = getFiatSymbol('USD');
        assert.equal(res, `$`);
    });

    it('should return without data when value is invalid', async () => {
        const res = getFiatSymbol('UST');
        assert.equal(res, '');
    });

    it('should return data 2 when value is valid', async () => {
        const res = decimalPlaces();
        assert.equal(res, 2);
    });

    it.skip('should return data 4 when value is valid', async () => {
        await sinon.stub(sspConfig, "fiatCurrency").returns('BTC');
        const res = decimalPlaces();
        assert.equal(res, 4);
    });

    it('should return crypto data formatted when value is valid', async () => {
        const res = formatCrypto(new BigNumber(1.00));
        assert.equal(res, 1.00);
    });

    it('should return fiat data formatted when value is valid', async () => {
        const res = formatFiat(new BigNumber(1.00));
        assert.equal(res, 1.00);
    });

    it('should return fiat with symbol formatted when value is valid', async () => {
        const res = formatFiatWithSymbol(new BigNumber(1.00));
        assert.equal(res, `$1.00 USD`);
    });

    it('should return rates when value is undefined', async () => {
        await sinon.stub(axios, "get").returns(undefined);
        await fetchRate('ETH').catch((e) => {
          assert.equal(e, `TypeError: Cannot read properties of undefined (reading 'data')`);
        });
    });

    it('should return rates when value is null', async () => {
      await sinon.stub(axios, "get").returns(null);
      await fetchRate('ETH').catch((e) => {
        assert.equal(e, `TypeError: Cannot read properties of null (reading 'data')`);
      });
    });

    it('should return rates for fiat when value is valid', async () => {
      await sinon.stub(axios, "get").returns({data: {
        "fiat":{"JPY":145.2032555},
        "crypto":{
          "btc":61508.59808270864,
          "flux":0.5750235389063905,
          "rvn":0.018527379859369836,
          "ltc":64.09884198167549,
          "doge":0.10923927081626982,
          "eth":2677.5115070999564,
          "zec":40.415534125354206,
          "bch":356.28178295334055,
          "usdt":0.9999977433011092,
          "usdc":0.9997477197809201
        }}});
        const res = await fetchRate('usdt'); 
        assert.deepEqual(res, {"JPY":145.20292781997438});
    });

    it('should return rates for crypto when value is valid', async () => {
      await sinon.stub(axios, "get").returns({data: {
        "fiat":{"JPY":145.2032555},
        "crypto":{
          "btc":61508.59808270864,
          "flux":0.5750235389063905,
          "rvn":0.018527379859369836,
          "ltc":64.09884198167549,
          "doge":0.10923927081626982,
          "eth":2677.5115070999564,
          "zec":40.415534125354206,
          "bch":356.28178295334055,
          "usdt":0.9999977433011092,
          "usdc":0.9997477197809201
        }}});
      const res = await fetchRate('btc'); 
      assert.deepEqual(res, {"JPY":8931248.682850353});
  });

    it('should return all rates when value is valid', async () => {
      await sinon.stub(axios, "get").returns({data: {
        "fiat":{"JPY":145.2032555},
        "crypto":{
          "btc":61508.59808270864,
          "flux":0.5750235389063905,
          "rvn":0.018527379859369836,
          "ltc":64.09884198167549,
          "doge":0.10923927081626982,
          "eth":2677.5115070999564,
          "zec":40.415534125354206,
          "bch":356.28178295334055,
          "usdt":0.9999977433011092,
          "usdc":0.9997477197809201
        }}});
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