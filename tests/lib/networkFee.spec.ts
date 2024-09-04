// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import { restore, stub } from 'sinon';
import { describe, it, afterEach } from 'mocha';
import { fetchNetworkFees } from '../../src/lib/networkFee';
import axios from 'axios';

const { assert } = chai;

describe('Network Fee Lib', function () {
  describe('Verifies network fee', function () {
    afterEach(function () {
      restore();
    });

    // Testing using stub data
    it('should return successful result if stub value is valid', async function () {
      await stub(axios, 'get').returns({ data: 'sample data' });
      const res = await fetchNetworkFees().then((r) => {
        assert.equal(r, 'sample data');
      });
    });

    // Testing using stub data
    it('should return successful result if stub value is valid data', async function () {
      await stub(axios, 'get').returns({ data: 'result' });
      const res = await fetchNetworkFees().then((r) => {
        assert.equal(r, 'result');
      });
    });

    it('should return without data when value none', async function () {
      await stub(axios, 'get').returns({ data: {} });
      await fetchNetworkFees().catch((e) => {
        assert.equal(e, 'Error: Invalid response from SSP for network fees');
      });
    });
  });
});
