// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';
import { Buffer } from 'buffer';

import {
  verifyRecoveryXpubSignature,
  recoveryXpubMessage,
} from '../../src/lib/recoveryXpubVerify';

/**
 * Cross-repo vector. Produced by ssp-key's OWN signer — lib/recoveryPublish.ts
 * signRecoveryXpub(), which goes through lib/relayAuth.ts signMessage() and
 * @runonflux/flux-sdk — from the standard test mnemonic:
 *
 *   recovery account   m/48'/0'/99'/2'
 *   signing identity   m/48'/0'/0'/2'/10/0
 *
 * If this stops verifying, the two repos have drifted and the wallet would
 * start refusing genuine records.
 */
const VECTOR = {
  wkIdentity: 'bc1qexamplewkidentity000000000000000000000',
  recoveryXpub:
    'Zpub74BWc4YJJs2zaF4x2W8PUFKZyQxkxkgPuDCNKymYBADpqYbXGWj95kPE346PUFcpeGUivfougEkNvGcbnLhWwBD1rJ2q7gsfGcSHpW87L4p',
  pubKey: '024cec9c5d2dcf594d0b99a4d02d79d571f2e82ed0e69bcb4666a89373566f0932',
  signature:
    'HxGkyMKpPsD4ktvf2uJqX5ZQQ6CjKNPCtQyaUwUf52+lPzpYInpgRnxcZwiOhYWA/t97t7GEpITTOCKXfgn60t4=',
};

const verify = (overrides = {}) =>
  verifyRecoveryXpubSignature({
    wkIdentity: VECTOR.wkIdentity,
    recoveryXpub: VECTOR.recoveryXpub,
    signature: VECTOR.signature,
    expectedPubKeyHex: VECTOR.pubKey,
    identityChain: 'btc',
    ...overrides,
  });

describe('recoveryXpubMessage', () => {
  it('is the domain-separated, identity-bound string both repos build', () => {
    // Byte-identical to ssp-key's lib/recoveryPublish.ts copy.
    expect(recoveryXpubMessage('bc1qwk', 'Zpub123')).toBe(
      'ssp-recovery-xpub\nbc1qwk\nZpub123',
    );
  });
});

describe('verifyRecoveryXpubSignature', () => {
  it('accepts a signature ssp-key actually produced', () => {
    expect(verify()).toBe(true);
  });

  it('rejects a substituted xpub', () => {
    // The relay serves this record; swapping the xpub must not go unnoticed.
    const other =
      'Zpub74BWc4YJJs2zaF4x2W8PUFKZyQxkxkgPuDCNKymYBADpqYbXGWj95kPE346PUFcpeGUivfougEkNvGcbnLhWwBD1rJ2q7gsfGcSHpW87L4q';
    expect(verify({ recoveryXpub: other })).toBe(false);
  });

  it('rejects a record replayed onto another identity', () => {
    expect(verify({ wkIdentity: 'bc1qsomeoneelse' })).toBe(false);
  });

  it('rejects verification against a different identity key', () => {
    const otherPub =
      '024cec9c5d2dcf594d0b99a4d02d79d571f2e82ed0e69bcb4666a89373566f0933';
    expect(verify({ expectedPubKeyHex: otherPub })).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const raw = Buffer.from(VECTOR.signature, 'base64');
    raw[10] ^= 0xff;
    expect(verify({ signature: raw.toString('base64') })).toBe(false);
  });

  it('rejects a signature of the wrong length', () => {
    const raw = Buffer.from(VECTOR.signature, 'base64').subarray(0, 64);
    expect(verify({ signature: raw.toString('base64') })).toBe(false);
  });

  it('rejects an uncompressed-key header (SSP always signs compressed)', () => {
    const raw = Buffer.from(VECTOR.signature, 'base64');
    raw[0] = raw[0] - 4; // 31..34 -> 27..30
    expect(verify({ signature: raw.toString('base64') })).toBe(false);
  });

  it('rejects a wrong recovery id', () => {
    const raw = Buffer.from(VECTOR.signature, 'base64');
    raw[0] = 31 + ((raw[0] - 31 + 1) % 4);
    expect(verify({ signature: raw.toString('base64') })).toBe(false);
  });

  it('rejects empty or malformed input without throwing', () => {
    expect(verify({ signature: '' })).toBe(false);
    expect(verify({ signature: 'not base64 !!!' })).toBe(false);
    expect(verify({ expectedPubKeyHex: '' })).toBe(false);
  });

  it('rejects when checked against a chain with a different message prefix', () => {
    // The prefix is part of the digest, so the chain must match.
    expect(verify({ identityChain: 'flux' })).toBe(false);
  });
});
