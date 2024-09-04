// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import sinon from 'sinon';
import httpMocks from 'node-mocks-http';
import { getFingerprint } from '../../src/lib/fingerprint';

const MockBrowser = require('mock-browser').mocks.MockBrowser;

const { expect, assert } = chai;

describe('Fingerprint Lib', () => {
  describe('Verifies fingerprint', () => {
    afterEach(function () {
      sinon.restore();
    });

    before(function () {
      const mock = new MockBrowser();
      global.window = mock.getWindow();
      global.document = mock.getDocument();
    });

    // Testing using stub data
    it('should return successful result if value is valid', async () => {
      const res = await getFingerprint();
      assert.equal(
        res,
        `d9ce9e4a4c6c3ae9d4fa04e840cb536d2b64f2cd8740614a9e4ce323ac6a2d82`,
      );
    });
  });
});
