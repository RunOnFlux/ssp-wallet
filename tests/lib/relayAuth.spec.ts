// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createHash } from 'crypto';
import {
  computeBodyHash,
  generateNonce,
  createSignaturePayload,
  signMessage,
  addAuthToRequest,
  createReadAuthHeaders,
  readAuthPath,
  readAuthDataHash,
  verifyMessageSignature,
  READ_AUTH_HEADERS,
} from '../../src/lib/relayAuth';
import { blockchains } from '@storage/blockchains';
import utxolib from '@runonflux/utxo-lib';

// Test fixtures - same WIF used in ssp-relay tests for consistency
const TEST_PRIVATE_KEY_WIF =
  'L1TnU2zbNaAqMoVh65Cyvmcjzbrj41Gs9iTLcWbpJCMynXuap6UN';

describe('RelayAuth Lib', () => {
  describe('computeBodyHash', () => {
    it('should compute SHA256 hash of request body', () => {
      const body = { action: 'test', data: 'hello' };
      const hash = computeBodyHash(body);

      // Hash should be 64 character hex string (256 bits)
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it('should produce consistent hash for same input', () => {
      const body = { foo: 'bar', num: 123 };
      const hash1 = computeBodyHash(body);
      const hash2 = computeBodyHash(body);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', () => {
      const body1 = { action: 'test1' };
      const body2 = { action: 'test2' };

      const hash1 = computeBodyHash(body1);
      const hash2 = computeBodyHash(body2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty object', () => {
      const hash = computeBodyHash({});
      expect(hash).toHaveLength(64);
    });

    it('should handle nested objects', () => {
      const body = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };
      const hash = computeBodyHash(body);
      expect(hash).toHaveLength(64);
    });
  });

  describe('generateNonce', () => {
    it('should generate a 64 character hex string', () => {
      const nonce = generateNonce();

      expect(nonce).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(nonce)).toBe(true);
    });

    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      const nonce3 = generateNonce();

      expect(nonce1).not.toBe(nonce2);
      expect(nonce2).not.toBe(nonce3);
      expect(nonce1).not.toBe(nonce3);
    });
  });

  describe('createSignaturePayload', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    it('should create payload with all required fields', () => {
      const payload = createSignaturePayload('action', 'test-identity');

      expect(payload.action).toBe('action');
      expect(payload.identity).toBe('test-identity');
      expect(payload.timestamp).toBe(Date.now());
      expect(payload.nonce).toHaveLength(64);
    });

    it('should include data hash when provided', () => {
      const payload = createSignaturePayload(
        'sync',
        'my-identity',
        'abc123hash',
      );

      expect(payload.data).toBe('abc123hash');
    });

    it('should not include data when not provided', () => {
      const payload = createSignaturePayload('join', 'my-identity');

      expect(payload.data).toBeUndefined();
    });

    it('should support all action types', () => {
      const actions = ['sync', 'action', 'token', 'join'] as const;

      for (const action of actions) {
        const payload = createSignaturePayload(action, 'identity');
        expect(payload.action).toBe(action);
      }
    });

    vi.useRealTimers();
  });

  describe('signMessage', () => {
    it('should produce a base64 encoded signature', () => {
      const message = 'test message to sign';
      const signature = signMessage(message, TEST_PRIVATE_KEY_WIF, 'btc');

      // Base64 signatures are typically 88 characters for Bitcoin message signatures
      expect(signature.length).toBeGreaterThan(0);
      // Verify it's valid base64
      expect(() => Buffer.from(signature, 'base64')).not.toThrow();
    });

    it('should produce different signatures for different messages', () => {
      const sig1 = signMessage('message 1', TEST_PRIVATE_KEY_WIF, 'btc');
      const sig2 = signMessage('message 2', TEST_PRIVATE_KEY_WIF, 'btc');

      expect(sig1).not.toBe(sig2);
    });

    it('should produce non-deterministic signatures (extra entropy)', () => {
      const message = 'same message';
      const sig1 = signMessage(message, TEST_PRIVATE_KEY_WIF, 'btc');
      const sig2 = signMessage(message, TEST_PRIVATE_KEY_WIF, 'btc');

      // Due to extra entropy, signatures should be different each time
      expect(sig1).not.toBe(sig2);
    });

    it('should work with flux chain', () => {
      const message = 'flux test message';
      const signature = signMessage(
        message,
        'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU',
        'flux',
      );

      expect(signature.length).toBeGreaterThan(0);
      expect(() => Buffer.from(signature, 'base64')).not.toThrow();
    });
  });

  describe('addAuthToRequest', () => {
    it('should merge auth fields into request body', () => {
      const body = { action: 'test', data: 'payload' };
      const authFields = {
        signature: 'test-signature',
        message: 'test-message',
        publicKey: 'test-pubkey',
        witnessScript: 'test-witness',
      };

      const result = addAuthToRequest(body, authFields);

      expect(result.action).toBe('test');
      expect(result.data).toBe('payload');
      expect(result.signature).toBe('test-signature');
      expect(result.message).toBe('test-message');
      expect(result.publicKey).toBe('test-pubkey');
      expect(result.witnessScript).toBe('test-witness');
    });

    it('should preserve original body fields', () => {
      const body = { foo: 'bar', nested: { a: 1 } };
      const authFields = {
        signature: 'sig',
        message: 'msg',
        publicKey: 'pk',
      };

      const result = addAuthToRequest(body, authFields);

      expect(result.foo).toBe('bar');
      expect(result.nested).toEqual({ a: 1 });
    });

    it('should handle auth without witnessScript', () => {
      const body = { test: true };
      const authFields = {
        signature: 'sig',
        message: 'msg',
        publicKey: 'pk',
      };

      const result = addAuthToRequest(body, authFields);

      expect(result.witnessScript).toBeUndefined();
    });
  });
});

// Compressed pubkey of TEST_PRIVATE_KEY_WIF.
const testPubKeyHex = () =>
  utxolib.ECPair.fromWIF(TEST_PRIVATE_KEY_WIF, utxolib.networks.bitcoin)
    .getPublicKeyBuffer()
    .toString('hex');

describe('RA-4 read auth headers', () => {
  const wk = 'bc1qexamplewkidentity';
  const url = `https://relay.sspwallet.com/v1/action/${wk}?cache=1`;

  it('binds the request path (no query) the way the contract defines it', () => {
    expect(readAuthPath(url)).toBe(`/v1/action/${wk}`);
    expect(readAuthPath('/v1/sync/1abc?x=y')).toBe('/v1/sync/1abc');
    expect(readAuthDataHash(`/v1/action/${wk}`)).toBe(
      createHash('sha256').update(`GET /v1/action/${wk}`, 'utf8').digest('hex'),
    );
  });

  it('produces all four headers for a multisig identity', () => {
    const headers = createReadAuthHeaders({
      identity: wk,
      url,
      privateKeyWIF: TEST_PRIVATE_KEY_WIF,
      publicKey: testPubKeyHex(),
      witnessScript: '5221aa52ae',
    });
    expect(Object.keys(headers).sort()).toEqual(
      [
        READ_AUTH_HEADERS.message,
        READ_AUTH_HEADERS.publicKey,
        READ_AUTH_HEADERS.signature,
        READ_AUTH_HEADERS.witnessScript,
      ].sort(),
    );
    expect(headers['x-ssp-publickey']).toMatch(/^0[23][0-9a-f]{64}$/);
    expect(headers['x-ssp-witnessscript']).toBe('5221aa52ae');

    const payload = JSON.parse(headers['x-ssp-message']);
    expect(payload.action).toBe('read');
    expect(payload.identity).toBe(wk);
    expect(payload.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof payload.timestamp).toBe('number');
    expect(payload.data).toBe(readAuthDataHash(`/v1/action/${wk}`));
  });

  it('omits the witness script for a single-sig identity', () => {
    const headers = createReadAuthHeaders({
      identity: '1WalletIdentity',
      url: 'https://relay.sspwallet.com/v1/sync/1WalletIdentity',
      privateKeyWIF: TEST_PRIVATE_KEY_WIF,
      publicKey: testPubKeyHex(),
    });
    expect(headers['x-ssp-witnessscript']).toBeUndefined();
  });

  it('signs the message with the Bitcoin prefix, verifiable against the pubkey', () => {
    const headers = createReadAuthHeaders({
      identity: wk,
      url,
      privateKeyWIF: TEST_PRIVATE_KEY_WIF,
      publicKey: testPubKeyHex(),
    });
    expect(
      verifyMessageSignature({
        message: headers['x-ssp-message'],
        signature: headers['x-ssp-signature'],
        expectedPubKeyHex: testPubKeyHex(),
        messagePrefixes: [blockchains.btc.messagePrefix],
      }),
    ).toBe(true);
  });

  it('uses a fresh nonce for every read', () => {
    const make = () =>
      JSON.parse(
        createReadAuthHeaders({
          identity: wk,
          url,
          privateKeyWIF: TEST_PRIVATE_KEY_WIF,
          publicKey: testPubKeyHex(),
        })['x-ssp-message'],
      ).nonce;
    expect(make()).not.toBe(make());
  });
});

describe('verifyMessageSignature', () => {
  const prefix = blockchains.btc.messagePrefix;

  it('verifies only against the expected key, message and prefix', () => {
    const signature = signMessage('hello', TEST_PRIVATE_KEY_WIF, 'btc');
    const base = {
      message: 'hello',
      signature,
      expectedPubKeyHex: testPubKeyHex(),
      messagePrefixes: [prefix],
    };
    expect(verifyMessageSignature(base)).toBe(true);
    expect(verifyMessageSignature({ ...base, message: 'hellO' })).toBe(false);
    expect(
      verifyMessageSignature({
        ...base,
        expectedPubKeyHex: `02${'11'.repeat(32)}`,
      }),
    ).toBe(false);
    expect(
      verifyMessageSignature({
        ...base,
        messagePrefixes: [blockchains.flux.messagePrefix],
      }),
    ).toBe(false);
    expect(
      verifyMessageSignature({
        ...base,
        messagePrefixes: [blockchains.flux.messagePrefix, prefix],
      }),
    ).toBe(true);
  });

  it('fails closed on malformed input', () => {
    const signature = signMessage('hello', TEST_PRIVATE_KEY_WIF, 'btc');
    for (const bad of [
      { signature: '' },
      { signature: 'AAAA' },
      { signature: '%%%' },
      { expectedPubKeyHex: 'zz' },
      { expectedPubKeyHex: testPubKeyHex().slice(2) },
    ]) {
      expect(
        verifyMessageSignature({
          message: 'hello',
          signature,
          expectedPubKeyHex: testPubKeyHex(),
          messagePrefixes: [prefix],
          ...bad,
        }),
      ).toBe(false);
    }
  });
});
