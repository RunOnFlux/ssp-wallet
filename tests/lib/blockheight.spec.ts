/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import sinon from 'sinon';
import httpMocks from 'node-mocks-http';
import axios from 'axios';

import { getBlockheight } from '../../src/lib/blockheight';

const { expect, assert } = chai;

describe('Currency Lib', () => {
  describe('Verifies currency', () => {
    afterEach(function () {
      sinon.restore();
    });

    it('should return data when value is valid evm', async () => {
      const res = await getBlockheight('eth');
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
    });

    it('should return data when value is valid', async () => {
      const res = await getBlockheight('flux');
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
    });

    it('should return data when value is valid blockbook', async () => {
      const res = await getBlockheight('bch');
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
    });
  });
});
