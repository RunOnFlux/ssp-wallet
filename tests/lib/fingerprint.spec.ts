/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck test suite

import { getFingerprint } from '../../src/lib/fingerprint';
import { JSDOM } from 'jsdom';

describe('Fingerprint Lib', () => {
  describe('Verifies fingerprint', () => {
    beforeAll(() => {
      const { window } = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
      global.document = window.document;
      global.window = window;
    });

    // Testing using stub data
    it('should return successful result if value is valid', () => {
      const res = getFingerprint();
      expect(typeof res).toBe('string');
      expect(res.length).toBe(64);
    });
  });
});
