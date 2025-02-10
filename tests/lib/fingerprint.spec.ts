// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import { getFingerprint } from '../../src/lib/fingerprint';
import { describe, it } from 'mocha';
import { JSDOM } from 'jsdom';

const { expect } = chai;

describe('Fingerprint Lib', function () {
  describe('Verifies fingerprint', function () {
    before(function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const { window } = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      global.document = window.document;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      global.window = window;
    });

    // Testing using stub data
    it('should return successful result if value is valid', function () {
      const res = getFingerprint();
      expect(res).to.be.a('string');
      expect(res.length).to.be.equal(64);
    });
  });
});
