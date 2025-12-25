// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  computeBodyHash,
  generateNonce,
  createSignaturePayload,
  signMessage,
  addAuthToRequest,
} from '../../src/lib/relayAuth';

// Test fixtures - same WIF used in ssp-relay tests for consistency
const TEST_PRIVATE_KEY_WIF = 'L1TnU2zbNaAqMoVh65Cyvmcjzbrj41Gs9iTLcWbpJCMynXuap6UN';

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
      const payload = createSignaturePayload('sync', 'my-identity', 'abc123hash');

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
      const signature = signMessage(message, 'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU', 'flux');

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
