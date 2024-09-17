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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      restore();
    });

    // Testing using stub data
    it('should return successful result if stub value is valid', async function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await stub(axios, 'get').returns({ data: 'sample data' });
      await fetchNetworkFees().then((r) => {
        assert.equal(r, 'sample data');
      });
    });

    it('should return successful result if stub value is valid data', async function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await stub(axios, 'get').returns({ data: 'result' });
      await fetchNetworkFees().then((r) => {
        assert.equal(r, 'result');
      });
    });

    it('should return without data when value none', async function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await stub(axios, 'get').returns({ data: {} });
      await fetchNetworkFees().catch((e) => {
        assert.equal(e, 'Error: Invalid response from SSP for network fees');
      });
    });
  });
});
