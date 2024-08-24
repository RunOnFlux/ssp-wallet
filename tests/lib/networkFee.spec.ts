/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import sinon from 'sinon';
import httpMocks from 'node-mocks-http';

import { fetchNetworkFees } from '../../src/lib/networkFee';
import axios from 'axios';

const { expect, assert } = chai;

describe('Network Fee Lib', () => {
  describe('Verifies network fee', () => {
    afterEach(function() {
      sinon.restore();
    });

    // Testing using stub data
    it('should return successful result if stub value is valid', async () => {
      await sinon.stub(axios, "get").returns({data:"sample data"});
      const res = await fetchNetworkFees().then((r) => {
        assert.equal(r, "sample data");
      });
    });

    // Testing using stub data
    it('should return successful result if stub value is valid data', async () => {
      await sinon.stub(axios, "get").returns({data:"result"});
      const res = await fetchNetworkFees().then((r) => {
        assert.equal(r, "result");
      });
    });

    it('should return without data when value none', async () => {
        await sinon.stub(axios, "get").returns({data:{}});
        await fetchNetworkFees().catch((e) => {
          assert.equal(e, 'Error: Invalid response from SSP for network fees');
        });
    });

  });
});