// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock relayAuth to avoid crypto/blockchain dependencies
vi.mock('../../src/lib/relayAuth', () => ({
  signMessage: vi.fn(() => 'mock-base64-signature'),
}));

import {
  validateWkSignMessage,
  signWkMessage,
  generateRequestId,
} from '../../src/lib/wkSign';
import { signMessage } from '../../src/lib/relayAuth';

// Constants matching the source
const MIN_MESSAGE_LENGTH = 45;
const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_VALIDITY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FUTURE_DRIFT_MS = 5 * 60 * 1000; // 5 minutes
const MIN_REASONABLE_TIMESTAMP = 1577836800000; // Jan 1, 2020
const MAX_REASONABLE_TIMESTAMP = 4102444800000; // Jan 1, 2100

/**
 * Helper to build a valid WK sign message with the given timestamp.
 * Pads the message with hex characters to reach the desired length.
 */
function buildMessage(timestamp: number, totalLength: number = 45): string {
  const tsStr = String(timestamp);
  const paddingNeeded = totalLength - tsStr.length;
  if (paddingNeeded < 0) return tsStr.substring(0, totalLength);
  const padding = 'a'.repeat(paddingNeeded);
  return tsStr + padding;
}

describe('wkSign', () => {
  describe('validateWkSignMessage', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Set "now" to a known time: Jan 15, 2025 00:00:00 UTC
      vi.setSystemTime(new Date('2025-01-15T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // --- Basic format validation ---

    it('should accept a valid message with current timestamp and minimum length', () => {
      const now = Date.now();
      const message = buildMessage(now, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
      expect(result.timestamp).toBe(now);
      expect(result.validTill).toBe(now + MESSAGE_VALIDITY_MS);
      expect(result.error).toBeUndefined();
    });

    it('should accept a valid message with 100 characters', () => {
      const now = Date.now();
      const message = buildMessage(now, 100);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
      expect(result.timestamp).toBe(now);
    });

    it('should reject an empty string', () => {
      const result = validateWkSignMessage('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message is required and must be a string');
    });

    it('should reject null input', () => {
      const result = validateWkSignMessage(null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message is required and must be a string');
    });

    it('should reject undefined input', () => {
      const result = validateWkSignMessage(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message is required and must be a string');
    });

    it('should reject a non-string input (number)', () => {
      const result = validateWkSignMessage(12345 as unknown as string);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message is required and must be a string');
    });

    // --- Length validation ---

    it('should reject message shorter than minimum length (44 chars)', () => {
      const now = Date.now();
      const message = buildMessage(now, MIN_MESSAGE_LENGTH - 1);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('too short');
      expect(result.error).toContain(String(MIN_MESSAGE_LENGTH));
    });

    it('should accept message at exact minimum length (45 chars)', () => {
      const now = Date.now();
      const message = buildMessage(now, MIN_MESSAGE_LENGTH);

      expect(message.length).toBe(MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
    });

    it('should accept message at exact maximum length (500 chars)', () => {
      const now = Date.now();
      const message = buildMessage(now, MAX_MESSAGE_LENGTH);

      expect(message.length).toBe(MAX_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
    });

    it('should reject message longer than maximum length (501 chars)', () => {
      const now = Date.now();
      const message = buildMessage(now, MAX_MESSAGE_LENGTH + 1);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
      expect(result.error).toContain(String(MAX_MESSAGE_LENGTH));
    });

    // --- Timestamp format validation ---

    it('should reject when first 13 characters are not numeric', () => {
      const message = 'abcdefghijklm' + 'x'.repeat(32);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid timestamp in message');
    });

    it('should reject when timestamp contains mixed alpha-numeric characters', () => {
      // parseInt('12345abc12345', 10) returns 12345 which is below min reasonable timestamp
      // so this gets caught by the range check, not the NaN check
      const message = '12345abc12345' + 'x'.repeat(32);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Timestamp is out of reasonable range');
    });

    // --- Timestamp range validation ---

    it('should reject timestamp before Jan 1, 2020', () => {
      // Dec 31, 2019 23:59:59 UTC
      const oldTimestamp = MIN_REASONABLE_TIMESTAMP - 1;
      const message = buildMessage(oldTimestamp, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Timestamp is out of reasonable range');
    });

    it('should accept timestamp at exactly Jan 1, 2020', () => {
      // We need "now" to be in a window where this timestamp is not expired
      vi.setSystemTime(new Date('2020-01-01T00:05:00.000Z'));
      const message = buildMessage(
        MIN_REASONABLE_TIMESTAMP,
        MIN_MESSAGE_LENGTH,
      );

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
      expect(result.timestamp).toBe(MIN_REASONABLE_TIMESTAMP);
    });

    it('should reject timestamp after Jan 1, 2100', () => {
      const futureTimestamp = MAX_REASONABLE_TIMESTAMP + 1;
      const message = buildMessage(futureTimestamp, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Timestamp is out of reasonable range');
    });

    // --- Expiry validation ---

    it('should accept message that is fresh (just created)', () => {
      const now = Date.now();
      const message = buildMessage(now, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
    });

    it('should accept message created 14 minutes ago (within 15-min window)', () => {
      const now = Date.now();
      const fourteenMinAgo = now - 14 * 60 * 1000;
      const message = buildMessage(fourteenMinAgo, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
    });

    it('should reject message that expired (created over 15 minutes ago)', () => {
      const now = Date.now();
      const sixteenMinAgo = now - 16 * 60 * 1000;
      const message = buildMessage(sixteenMinAgo, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message has expired');
    });

    it('should accept message at exact expiry boundary (now === validTill)', () => {
      const now = Date.now();
      // Message created exactly 15 minutes ago means validTill === now
      // The check is `now > validTill`, so now === validTill should pass
      const exactBoundary = now - MESSAGE_VALIDITY_MS;
      const message = buildMessage(exactBoundary, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
    });

    it('should reject message 1ms past expiry boundary', () => {
      const now = Date.now();
      const pastBoundary = now - MESSAGE_VALIDITY_MS - 1;
      const message = buildMessage(pastBoundary, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message has expired');
    });

    // --- Future drift validation ---

    it('should accept message with timestamp slightly in the future (1 minute ahead)', () => {
      const now = Date.now();
      const oneMinFuture = now + 1 * 60 * 1000;
      const message = buildMessage(oneMinFuture, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
    });

    it('should accept message at exact future drift boundary (5 min ahead)', () => {
      const now = Date.now();
      // The check is `timestamp > now + MAX_FUTURE_DRIFT_MS`
      // So timestamp === now + MAX_FUTURE_DRIFT_MS should pass
      const exactFutureBoundary = now + MAX_FUTURE_DRIFT_MS;
      const message = buildMessage(exactFutureBoundary, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
    });

    it('should reject message with timestamp too far in the future (6 minutes ahead)', () => {
      const now = Date.now();
      const sixMinFuture = now + 6 * 60 * 1000;
      const message = buildMessage(sixMinFuture, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message timestamp is too far in the future');
    });

    it('should reject message 1ms past the future drift boundary', () => {
      const now = Date.now();
      const pastFutureBoundary = now + MAX_FUTURE_DRIFT_MS + 1;
      const message = buildMessage(pastFutureBoundary, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message timestamp is too far in the future');
    });

    // --- Return value structure ---

    it('should return timestamp and validTill on valid message', () => {
      const now = Date.now();
      const message = buildMessage(now, MIN_MESSAGE_LENGTH);

      const result = validateWkSignMessage(message);

      expect(result.valid).toBe(true);
      expect(result.timestamp).toBe(now);
      expect(result.validTill).toBe(now + MESSAGE_VALIDITY_MS);
      expect(result.error).toBeUndefined();
    });

    it('should not return timestamp or validTill on invalid message', () => {
      const result = validateWkSignMessage('short');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.timestamp).toBeUndefined();
      expect(result.validTill).toBeUndefined();
    });

    // --- Edge case: message content after timestamp ---

    it('should accept message with special characters after timestamp', () => {
      const now = Date.now();
      const tsStr = String(now);
      const padding = ':SSP_CRITICAL:transfer_ownership:org123:wk456:nonce789';
      const message = tsStr + padding;
      // Ensure it meets min length
      const finalMessage =
        message.length >= MIN_MESSAGE_LENGTH
          ? message
          : message + 'x'.repeat(MIN_MESSAGE_LENGTH - message.length);

      const result = validateWkSignMessage(finalMessage);

      expect(result.valid).toBe(true);
    });
  });

  describe('signWkMessage', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should delegate to signMessage with correct parameters', () => {
      const message = 'test-message';
      const privateKeyWIF =
        'L1TnU2zbNaAqMoVh65Cyvmcjzbrj41Gs9iTLcWbpJCMynXuap6UN';
      const chain = 'btc';

      const result = signWkMessage(message, privateKeyWIF, chain);

      expect(signMessage).toHaveBeenCalledWith(message, privateKeyWIF, chain);
      expect(result).toBe('mock-base64-signature');
    });

    it('should default to btc chain when no chain is specified', () => {
      const message = 'test-message';
      const privateKeyWIF =
        'L1TnU2zbNaAqMoVh65Cyvmcjzbrj41Gs9iTLcWbpJCMynXuap6UN';

      signWkMessage(message, privateKeyWIF);

      expect(signMessage).toHaveBeenCalledWith(message, privateKeyWIF, 'btc');
    });

    it('should pass through the return value from signMessage', () => {
      const customSig = 'custom-signature-value';
      vi.mocked(signMessage).mockReturnValueOnce(customSig);

      const result = signWkMessage('msg', 'wif', 'flux');

      expect(result).toBe(customSig);
    });

    it('should forward the chain parameter for non-btc chains', () => {
      signWkMessage('msg', 'wif', 'flux');

      expect(signMessage).toHaveBeenCalledWith('msg', 'wif', 'flux');
    });
  });

  describe('generateRequestId', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return a string starting with "wk-"', () => {
      const id = generateRequestId();

      expect(id.startsWith('wk-')).toBe(true);
    });

    it('should include the current timestamp', () => {
      const now = Date.now();
      const id = generateRequestId();

      expect(id).toContain(String(now));
    });

    it('should have three parts separated by hyphens (wk-timestamp-random)', () => {
      const id = generateRequestId();
      // Format: wk-{timestamp}-{random}
      // The "wk" prefix, then timestamp, then random suffix
      const parts = id.split('-');

      // At least 3 parts: "wk", timestamp digits, random string
      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(parts[0]).toBe('wk');
    });

    it('should generate unique IDs on successive calls', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
    });

    it('should include a random suffix of 8 characters', () => {
      const id = generateRequestId();
      // Format: wk-{timestamp}-{8 chars random}
      const lastHyphenIndex = id.lastIndexOf('-');
      const randomPart = id.substring(lastHyphenIndex + 1);

      expect(randomPart.length).toBe(8);
    });
  });
});
