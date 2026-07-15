// @ts-nocheck test suite
import { describe, it, expect, vi } from 'vitest';

// chainSync.ts pulls in storage/store side-effect modules — mock the ones
// that don't run under node; lib/wallet stays REAL so verifyBatchSyncDoc is
// exercised against genuine derivations.
vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock('@metamask/browser-passworder', () => ({
  encrypt: vi.fn(async (_pw, value) => `enc(${value})`),
  decrypt: vi.fn(async () => 'password'),
}));
vi.mock('../../src/lib/fingerprint', () => ({
  getFingerprint: vi.fn(() => 'fingerprint'),
}));
vi.mock('../../src/store', () => ({
  setXpubWallet: vi.fn(),
  setXpubKey: vi.fn(),
  store: { getState: vi.fn(() => ({})) },
}));
vi.mock('../../src/storage/ssp', () => ({
  sspConfig: () => ({ relay: 'relay.example.com' }),
}));
vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import axios from 'axios';
import {
  CHAIN_SYNC_VERSION,
  CHAIN_SYNC_MAX_CHAINS,
  CHAIN_SYNC_FALLBACK_TIMEOUT_MS,
  CHAIN_SYNC_STALL_TIMEOUT_MS,
  buildChainSyncRequestPayload,
  parseChainSyncRejection,
  shouldShowQrFallback,
  isBatchStalled,
  verifyBatchSyncDoc,
  fetchChainSyncRejection,
} from '../../src/lib/chainSync';
import { getMasterXpub, generateMultisigAddress } from '../../src/lib/wallet';

const walletMnemonic =
  'silver trouble mountain crouch angry park film strong escape theory illegal bunker cargo taxi tuna real drift alert state match great escape option explain';
const keyMnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('chainSync payload building', () => {
  it('builds a versioned payload with the chain entries', () => {
    const payload = buildChainSyncRequestPayload([
      { chain: 'eth', xpubWallet: 'xpubA' },
      { chain: 'flux', xpubWallet: 'xpubB' },
    ]);
    expect(JSON.parse(payload)).toEqual({
      version: CHAIN_SYNC_VERSION,
      chains: [
        { chain: 'eth', xpubWallet: 'xpubA' },
        { chain: 'flux', xpubWallet: 'xpubB' },
      ],
    });
  });

  it('rejects empty and oversized batches', () => {
    expect(() => buildChainSyncRequestPayload([])).toThrow();
    const tooMany = Array.from(
      { length: CHAIN_SYNC_MAX_CHAINS + 1 },
      (_, i) => ({ chain: 'eth', xpubWallet: `xpub${i}` }),
    );
    expect(() => buildChainSyncRequestPayload(tooMany)).toThrow();
  });
});

describe('parseChainSyncRejection', () => {
  it('parses a valid rejection payload', () => {
    expect(
      parseChainSyncRejection(
        JSON.stringify({ version: 1, reason: 'declined' }),
      ),
    ).toEqual({ version: 1, reason: 'declined' });
  });

  it('parses a rejection without reason', () => {
    expect(parseChainSyncRejection(JSON.stringify({ version: 2 }))).toEqual({
      version: 2,
      reason: undefined,
    });
  });

  it('returns null for malformed payloads', () => {
    expect(parseChainSyncRejection(undefined)).toBeNull();
    expect(parseChainSyncRejection('')).toBeNull();
    expect(parseChainSyncRejection('not json')).toBeNull();
    expect(parseChainSyncRejection('[1]')).toBeNull();
    expect(parseChainSyncRejection('{"reason":"declined"}')).toBeNull();
    expect(parseChainSyncRejection(42)).toBeNull();
  });
});

describe('fallback timing', () => {
  it('does not fall back before the timeout', () => {
    const start = 1_000_000;
    expect(
      shouldShowQrFallback(
        start,
        start + CHAIN_SYNC_FALLBACK_TIMEOUT_MS - 1,
        false,
      ),
    ).toBe(false);
  });

  it('falls back once the timeout elapses without any response', () => {
    const start = 1_000_000;
    expect(
      shouldShowQrFallback(
        start,
        start + CHAIN_SYNC_FALLBACK_TIMEOUT_MS,
        false,
      ),
    ).toBe(true);
  });

  it('never falls back after the key responded', () => {
    const start = 1_000_000;
    expect(
      shouldShowQrFallback(
        start,
        start + CHAIN_SYNC_FALLBACK_TIMEOUT_MS * 10,
        true,
      ),
    ).toBe(false);
  });

  it('detects a stalled batch', () => {
    const last = 5_000_000;
    expect(isBatchStalled(last, last + CHAIN_SYNC_STALL_TIMEOUT_MS - 1)).toBe(
      false,
    );
    expect(isBatchStalled(last, last + CHAIN_SYNC_STALL_TIMEOUT_MS)).toBe(true);
  });
});

describe('verifyBatchSyncDoc (real derivations)', () => {
  const chain = 'flux';
  // same call shape as the wallet/key sync flows: account 0, p2sh
  const xpubWallet = getMasterXpub(walletMnemonic, 48, 19167, 0, 'p2sh', chain);
  const xpubKey = getMasterXpub(keyMnemonic, 48, 19167, 0, 'p2sh', chain);
  const generated = generateMultisigAddress(xpubWallet, xpubKey, 0, 0, chain);

  it('accepts a fully populated, matching doc', () => {
    expect(
      verifyBatchSyncDoc(
        {
          chain,
          keyXpub: xpubKey,
          generatedAddress: generated.address,
          walletXpub: xpubWallet,
          witnessScript: generated.witnessScript,
          redeemScript: generated.redeemScript,
        },
        xpubWallet,
      ),
    ).toEqual({ valid: true });
  });

  it('accepts a minimal doc (optional fields absent — guards stay dormant, matching the classic flow)', () => {
    expect(verifyBatchSyncDoc({ chain, keyXpub: xpubKey }, xpubWallet)).toEqual(
      { valid: true },
    );
  });

  it('rejects a doc whose generated address does not match', () => {
    const result = verifyBatchSyncDoc(
      {
        chain,
        keyXpub: xpubKey,
        generatedAddress: 't1UnrealAddressUnrealAddressUnreal',
      },
      xpubWallet,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('generatedAddress mismatch');
  });

  it('rejects a doc echoing a different wallet xpub', () => {
    const result = verifyBatchSyncDoc(
      { chain, keyXpub: xpubKey, walletXpub: xpubKey },
      xpubWallet,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('sspKeyWalletXpub mismatch');
  });

  it('rejects a key xpub identical to the wallet xpub (same seed phrase)', () => {
    const result = verifyBatchSyncDoc(
      { chain, keyXpub: xpubWallet },
      xpubWallet,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('keyXpub equals walletXpub');
  });

  it('rejects mismatching scripts', () => {
    const witness = verifyBatchSyncDoc(
      { chain, keyXpub: xpubKey, witnessScript: 'deadbeef' },
      xpubWallet,
    );
    // flux is p2sh — witnessScript is not generated, guard stays dormant
    // (matches the classic flow exactly); redeemScript IS generated:
    const redeem = verifyBatchSyncDoc(
      { chain, keyXpub: xpubKey, redeemScript: 'deadbeef' },
      xpubWallet,
    );
    expect(redeem.valid).toBe(false);
    expect(redeem.reason).toBe('redeemScript mismatch');
    expect(witness.valid).toBe(generated.witnessScript ? false : true);
  });

  it('rejects unknown chains and garbage xpubs', () => {
    expect(
      verifyBatchSyncDoc({ chain: 'nochain', keyXpub: xpubKey }, xpubWallet)
        .valid,
    ).toBe(false);
    expect(
      verifyBatchSyncDoc({ chain, keyXpub: 'garbage' }, xpubWallet).valid,
    ).toBe(false);
    expect(verifyBatchSyncDoc({ chain, keyXpub: '' }, xpubWallet).valid).toBe(
      false,
    );
  });
});

describe('fetchChainSyncRejection', () => {
  it('returns the rejection when the latest action is chainsyncrejected', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        action: 'chainsyncrejected',
        payload: JSON.stringify({ version: 1, reason: 'declined' }),
      },
    });
    await expect(fetchChainSyncRejection('wkid')).resolves.toEqual({
      version: 1,
      reason: 'declined',
    });
  });

  it('returns null for other pending actions', async () => {
    axios.get.mockResolvedValueOnce({
      data: { action: 'chainsyncrequest', payload: '{}' },
    });
    await expect(fetchChainSyncRejection('wkid')).resolves.toBeNull();
  });

  it('returns null when nothing is pending (404)', async () => {
    axios.get.mockRejectedValueOnce(new Error('404'));
    await expect(fetchChainSyncRejection('wkid')).resolves.toBeNull();
  });
});
