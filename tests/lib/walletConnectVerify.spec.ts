import { describe, it, expect } from 'vitest';
import {
  assessVerifyContext,
  displayOrigin,
  isSessionAccount,
  isVerifyBlocked,
  sessionAccountAddresses,
  verifyNeedsAcknowledgement,
} from '../../src/components/WalletConnect/verifyContext';

/**
 * WalletConnect Verify API handling (security review WEXT-5) and session
 * account scoping (WEXT-6).
 */

const ctx = (verified: Record<string, unknown>) => ({ verified });

describe('assessVerifyContext', () => {
  it('blocks a scam-flagged origin whatever else it says', () => {
    const a = assessVerifyContext(
      ctx({
        origin: 'https://app.uniswap.org',
        validation: 'VALID',
        isScam: true,
      }),
      'https://app.uniswap.org',
    );
    expect(a.status).toBe('scam');
    expect(isVerifyBlocked(a)).toBe(true);
  });

  it('flags INVALID (declared domain does not match) for explicit confirmation', () => {
    const a = assessVerifyContext(
      ctx({ origin: 'https://evil.example', validation: 'INVALID' }),
      'https://app.uniswap.org',
    );
    expect(a.status).toBe('invalid');
    expect(verifyNeedsAcknowledgement(a)).toBe(true);
    expect(isVerifyBlocked(a)).toBe(false);
    // The requester shown is where the connection came from, not the claim.
    expect(displayOrigin(a)).toBe('https://evil.example');
  });

  it('treats a reported origin that differs from the claim as a mismatch', () => {
    const a = assessVerifyContext(
      ctx({ origin: 'https://evil.example', validation: 'UNKNOWN' }),
      'https://app.uniswap.org/swap',
    );
    expect(a.status).toBe('invalid');
  });

  it('accepts VALID with matching origins', () => {
    const a = assessVerifyContext(
      ctx({ origin: 'https://app.uniswap.org', validation: 'VALID' }),
      'https://app.uniswap.org/',
    );
    expect(a.status).toBe('valid');
    expect(verifyNeedsAcknowledgement(a)).toBe(false);
  });

  it('labels a missing or unknown verification as unknown, falling back to the claim', () => {
    const missing = assessVerifyContext(undefined, 'https://dapp.example');
    expect(missing.status).toBe('unknown');
    expect(displayOrigin(missing)).toBe('https://dapp.example');
    expect(
      assessVerifyContext(ctx({ validation: 'UNKNOWN' }), 'https://d.example')
        .status,
    ).toBe('unknown');
    expect(assessVerifyContext('garbage', null).status).toBe('unknown');
  });
});

describe('session account scoping', () => {
  const accounts = [
    'eip155:1:0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
    'eip155:137:0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB',
    'eip155:1:0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'solana:x:abc',
    'eip155:1:not-an-address',
  ];

  it('returns only the accounts the session granted, per chain, deduplicated', () => {
    expect(sessionAccountAddresses(accounts, 1)).toEqual([
      '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
    ]);
    expect(sessionAccountAddresses(accounts, 137)).toEqual([
      '0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB',
    ]);
    expect(sessionAccountAddresses(accounts)).toHaveLength(2);
    expect(sessionAccountAddresses(undefined)).toEqual([]);
  });

  it('allows signing only for a session account (case-insensitive)', () => {
    expect(
      isSessionAccount(accounts, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toBe(true);
    expect(
      isSessionAccount(accounts, '0xcccccccccccccccccccccccccccccccccccccccc'),
    ).toBe(false);
    expect(isSessionAccount(accounts, '')).toBe(false);
    expect(isSessionAccount(accounts, undefined)).toBe(false);
    expect(isSessionAccount(undefined, '0xaaaa')).toBe(false);
  });
});
