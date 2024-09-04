/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import { getBlockheight } from '../../src/lib/blockheight';
import { describe, it } from 'mocha';

const { expect } = chai;

describe('Currency Lib', function () {
  describe('Verifies currency', function () {
    it('should return data when value is valid evm', async function () {
      const res = await getBlockheight('eth');
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
    });

    it('should return data when value is valid', async function () {
      const res = await getBlockheight('flux');
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
    });

    it('should return data when value is valid blockbook', async function () {
      const res = await getBlockheight('bch');
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
    });
  });
});
