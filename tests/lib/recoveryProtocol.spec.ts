// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createECDH, randomBytes } from 'crypto';
import { Buffer } from 'buffer';

// -------------------------------------------------------------------------
// Hoisted mocks: factories may reference these.
// -------------------------------------------------------------------------
const { mockAxiosPost, mockSocket, mockIoFactory } = vi.hoisted(() => {
  const listeners = new Map();
  const mockSocket = {
    _listeners: listeners,
    on: vi.fn((event, handler) => {
      listeners.set(event, handler);
      return mockSocket;
    }),
    emit: vi.fn(),
    removeAllListeners: vi.fn(() => listeners.clear()),
    disconnect: vi.fn(),
    fire: (event, ...args) => {
      const h = listeners.get(event);
      if (h) h(...args);
    },
  };
  return {
    mockAxiosPost: vi.fn(),
    mockSocket,
    mockIoFactory: vi.fn(() => mockSocket),
  };
});

vi.mock('axios', () => ({
  default: { post: mockAxiosPost },
  post: mockAxiosPost,
}));

vi.mock('socket.io-client', () => ({
  io: mockIoFactory,
}));

import { requestRecovery, RecoveryError } from '../../src/lib/recoveryProtocol';
import { wrapSkRForTransit } from '../../src/lib/recoveryCrypto';

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------
function genKeypair() {
  const dh = createECDH('secp256k1');
  dh.generateKeys();
  return {
    priv: dh.getPrivateKey(),
    pub: dh.getPublicKey(null, 'compressed'),
  };
}

function captureRequestPayload() {
  const call = mockAxiosPost.mock.calls.at(-1);
  expect(call).toBeTruthy();
  const body = call[1];
  expect(body.action).toBe('recoveryrequest');
  return JSON.parse(body.payload);
}

function captureRequestBody() {
  const call = mockAxiosPost.mock.calls.at(-1);
  expect(call).toBeTruthy();
  return call[1];
}

// Simulate the ssp-key side: take the wallet's request pkEph, wrap a sk_r
// using the real crypto, and emit a recoveryresponse socket event.
function simulateSspKeyResponse(params) {
  const { sspKeyPriv, skR, wkIdentity, overrideNonce, overrideTransit } =
    params;
  const req = captureRequestPayload();
  const pkEph = Buffer.from(req.pkEph, 'hex');
  const transit = overrideTransit ?? wrapSkRForTransit(sspKeyPriv, pkEph, skR);
  const responsePayload = {
    transit,
    nonce: overrideNonce ?? req.nonce,
    timestamp: req.timestamp,
  };
  mockSocket.fire('recoveryresponse', {
    wkIdentity,
    payload: JSON.stringify(responsePayload),
  });
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------
describe('recoveryProtocol.requestRecovery', () => {
  beforeEach(() => {
    mockAxiosPost.mockReset();
    mockSocket._listeners.clear();
    mockSocket.on.mockClear();
    mockSocket.emit.mockClear();
    mockSocket.removeAllListeners.mockClear();
    mockSocket.disconnect.mockClear();
    mockIoFactory.mockClear();
    mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns sk_r on successful round trip', async () => {
    const sspKey = genKeypair();
    const skR = randomBytes(32);

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });

    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();
    simulateSspKeyResponse({
      sspKeyPriv: sspKey.priv,
      skR,
      wkIdentity: 'bc1qwkid',
    });

    const result = await promise;
    expect(result.equals(skR)).toBe(true);
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('POSTs all fields the relay validator requires (chain, path, wkIdentity, action, payload)', async () => {
    const sspKey = genKeypair();

    const promise = requestRecovery({
      wkIdentity: 'bc1qvalidate',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });
    const caught = promise.catch((e) => e);

    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();

    const body = captureRequestBody();
    // Matches ssp-relay's actionApi validator: chain, wkIdentity, action
    // are required non-empty strings; path is a string (empty is allowed).
    expect(body).toMatchObject({
      action: 'recoveryrequest',
      chain: 'btc',
      wkIdentity: 'bc1qvalidate',
      path: '',
    });
    expect(typeof body.payload).toBe('string');
    expect(body.payload.length).toBeGreaterThan(0);

    simulateSspKeyResponse({
      sspKeyPriv: sspKey.priv,
      skR: randomBytes(32),
      wkIdentity: 'bc1qvalidate',
    });
    await caught;
  });

  it('emits an unauthenticated join on connect', async () => {
    const sspKey = genKeypair();
    const skR = randomBytes(32);

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });

    await Promise.resolve();
    mockSocket.fire('connect');
    expect(mockSocket.emit).toHaveBeenCalledWith('join', {
      wkIdentity: 'bc1qwkid',
    });

    await Promise.resolve();
    simulateSspKeyResponse({
      sspKeyPriv: sspKey.priv,
      skR,
      wkIdentity: 'bc1qwkid',
    });
    await promise;
  });

  it('rejects with denied when ssp-key sends recoverydenied', async () => {
    const sspKey = genKeypair();

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });

    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();
    mockSocket.fire('recoverydenied', { wkIdentity: 'bc1qwkid' });

    await expect(promise).rejects.toBeInstanceOf(RecoveryError);
    try {
      await promise;
    } catch (e) {
      expect(e.code).toBe('denied');
    }
  });

  it('rejects with nonce_mismatch when response nonce differs', async () => {
    const sspKey = genKeypair();
    const skR = randomBytes(32);

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });

    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();
    simulateSspKeyResponse({
      sspKeyPriv: sspKey.priv,
      skR,
      wkIdentity: 'bc1qwkid',
      overrideNonce: 'ff'.repeat(16),
    });

    await expect(promise).rejects.toMatchObject({ code: 'nonce_mismatch' });
  });

  it('rejects with malformed_response on non-JSON payload', async () => {
    const sspKey = genKeypair();

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });

    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();
    mockSocket.fire('recoveryresponse', {
      wkIdentity: 'bc1qwkid',
      payload: 'not-json',
    });

    await expect(promise).rejects.toMatchObject({ code: 'malformed_response' });
  });

  it('rejects with malformed_response on missing fields', async () => {
    const sspKey = genKeypair();

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });

    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();
    mockSocket.fire('recoveryresponse', {
      wkIdentity: 'bc1qwkid',
      payload: JSON.stringify({ transit: 'aa' }),
    });

    await expect(promise).rejects.toMatchObject({ code: 'malformed_response' });
  });

  it('rejects with decrypt_failed on bogus transit ciphertext', async () => {
    const sspKey = genKeypair();

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });

    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();

    const bogus = Buffer.concat([
      Buffer.from([0x01]),
      randomBytes(12),
      randomBytes(32),
      randomBytes(16),
    ]).toString('hex');

    simulateSspKeyResponse({
      sspKeyPriv: sspKey.priv,
      skR: Buffer.alloc(32),
      wkIdentity: 'bc1qwkid',
      overrideTransit: bogus,
    });

    await expect(promise).rejects.toMatchObject({ code: 'decrypt_failed' });
  });

  it('rejects with post_failed when axios POST fails', async () => {
    const sspKey = genKeypair();
    mockAxiosPost.mockRejectedValueOnce(new Error('network down'));

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });

    await Promise.resolve();
    mockSocket.fire('connect');

    await expect(promise).rejects.toMatchObject({ code: 'post_failed' });
  });

  it('rejects with timeout if no response arrives in time', async () => {
    const sspKey = genKeypair();

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
      timeoutMs: 50,
    });
    const caught = promise.catch((e) => e);

    const err = await caught;
    expect(err).toBeInstanceOf(RecoveryError);
    expect(err.code).toBe('timeout');
  });

  it('ignores events for a different wkIdentity', async () => {
    const sspKey = genKeypair();

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
      timeoutMs: 50,
    });
    const caught = promise.catch((e) => e);

    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();

    mockSocket.fire('recoveryresponse', {
      wkIdentity: 'someoneelse',
      payload: JSON.stringify({
        transit: 'aa',
        nonce: 'bb',
        timestamp: 1,
      }),
    });
    mockSocket.fire('recoverydenied', { wkIdentity: 'alsowrong' });

    const err = await caught;
    expect(err).toBeInstanceOf(RecoveryError);
    expect(err.code).toBe('timeout');
  });

  it('cleans up socket on success', async () => {
    const sspKey = genKeypair();
    const skR = randomBytes(32);

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });
    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();
    simulateSspKeyResponse({
      sspKeyPriv: sspKey.priv,
      skR,
      wkIdentity: 'bc1qwkid',
    });
    await promise;

    expect(mockSocket.removeAllListeners).toHaveBeenCalled();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('cleans up socket on error', async () => {
    const sspKey = genKeypair();

    const promise = requestRecovery({
      wkIdentity: 'bc1qwkid',
      keyIdentityPubKeyHex: sspKey.pub.toString('hex'),
      chain: 'btc',
      relay: 'relay.test.io',
    });
    await Promise.resolve();
    mockSocket.fire('connect');
    await Promise.resolve();
    mockSocket.fire('recoverydenied', { wkIdentity: 'bc1qwkid' });

    await expect(promise).rejects.toThrow();
    expect(mockSocket.removeAllListeners).toHaveBeenCalled();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
