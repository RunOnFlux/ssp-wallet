/**
 * WK Sign Utilities for SSP Wallet
 *
 * Provides validation and signing utilities for the wk_sign action.
 */

import { signMessage } from './relayAuth';
import { cryptos } from '../types';

// Message validity window in milliseconds (15 minutes)
const MESSAGE_VALIDITY_MS = 15 * 60 * 1000;

// Maximum future timestamp drift allowed (5 minutes)
const MAX_FUTURE_DRIFT_MS = 5 * 60 * 1000;

// Minimum message length (timestamp = 13 chars = 26 hex chars minimum)
const MIN_MESSAGE_HEX_LENGTH = 26;

export interface WkSignMessageValidation {
  valid: boolean;
  error?: string;
  timestamp?: number;
  validTill?: number;
}

export interface WkSignRequesterInfo {
  origin: string;
  siteName?: string;
  description?: string;
  iconUrl?: string;
}

export interface WkSignResponse {
  walletSignature: string;
  walletPubKey: string;
  keySignature?: string;
  keyPubKey?: string;
  witnessScript: string;
  wkIdentity: string;
  message: string;
  requesterInfo?: WkSignRequesterInfo;
}

/**
 * Validates a wk_sign message format.
 *
 * @param hexMessage - The hex-encoded message to validate
 * @returns Validation result with timestamp info if valid
 */
export function validateWkSignMessage(
  hexMessage: string,
): WkSignMessageValidation {
  // Check if message exists and is a string
  if (!hexMessage || typeof hexMessage !== 'string') {
    return {
      valid: false,
      error: 'Message is required and must be a string',
    };
  }

  // Validate hex format
  if (!/^[0-9a-fA-F]+$/.test(hexMessage)) {
    return {
      valid: false,
      error: 'Message must be hex encoded',
    };
  }

  // Check minimum length
  if (hexMessage.length < MIN_MESSAGE_HEX_LENGTH) {
    return {
      valid: false,
      error: 'Message is too short',
    };
  }

  // Decode hex to string
  let decoded: string;
  try {
    decoded = Buffer.from(hexMessage, 'hex').toString('utf8');
  } catch {
    return {
      valid: false,
      error: 'Failed to decode hex message',
    };
  }

  // Extract timestamp (first 13 characters = milliseconds)
  const timestampStr = decoded.substring(0, 13);
  const timestamp = parseInt(timestampStr, 10);

  if (isNaN(timestamp)) {
    return {
      valid: false,
      error:
        'Invalid timestamp in message - must start with 13-digit millisecond timestamp',
    };
  }

  // Validate timestamp is reasonable (not year 3000 or year 1970)
  const now = Date.now();
  const minReasonableTimestamp = 1577836800000; // Jan 1, 2020
  const maxReasonableTimestamp = 4102444800000; // Jan 1, 2100

  if (
    timestamp < minReasonableTimestamp ||
    timestamp > maxReasonableTimestamp
  ) {
    return {
      valid: false,
      error: 'Timestamp is out of reasonable range',
    };
  }

  // Calculate validity window
  const validTill = timestamp + MESSAGE_VALIDITY_MS;

  // Check if message has expired
  if (now > validTill) {
    return {
      valid: false,
      error: 'Message has expired',
    };
  }

  // Check if timestamp is too far in the future
  if (timestamp > now + MAX_FUTURE_DRIFT_MS) {
    return {
      valid: false,
      error: 'Message timestamp is too far in the future',
    };
  }

  // Check that there's some random content after the timestamp
  if (decoded.length < 20) {
    return {
      valid: false,
      error: 'Message must include random component after timestamp',
    };
  }

  return {
    valid: true,
    timestamp,
    validTill,
  };
}

/**
 * Sign a wk_sign message using Bitcoin message signing format.
 *
 * @param message - The hex-encoded message to sign
 * @param privateKeyWIF - The private key in WIF format
 * @param chain - The blockchain (for message prefix)
 * @returns Base64-encoded signature
 */
export function signWkMessage(
  message: string,
  privateKeyWIF: string,
  chain: keyof cryptos = 'btc',
): string {
  return signMessage(message, privateKeyWIF, chain);
}

/**
 * Generate a unique request ID for wk_sign requests.
 */
export function generateRequestId(): string {
  return `wk-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

export default {
  validateWkSignMessage,
  signWkMessage,
  generateRequestId,
};
