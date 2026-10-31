// RA-2 (client side): relay write requests are never sent unauthenticated.
import { describe, it, expect, vi } from 'vitest';
import {
  attachRequiredWkAuth,
  RelayAuthUnavailableError,
} from '../../src/lib/relayRequestAuth';

const auth = {
  signature: 'c2ln',
  message: '{"action":"action"}',
  publicKey: '02' + 'a'.repeat(64),
  witnessScript: '5221',
};

describe('attachRequiredWkAuth', () => {
  it('signs the body WITHOUT auth fields and appends auth after the body keys', async () => {
    const createAuth = vi.fn(async () => auth);
    const body = {
      action: 'tx',
      payload: 'p',
      chain: 'btc',
      wkIdentity: 'bc1q',
    };
    const signed = await attachRequiredWkAuth(body, 'bc1q', createAuth);
    expect(createAuth).toHaveBeenCalledWith('action', 'bc1q', body);
    // Relay hashes JSON.stringify(body minus auth fields) in insertion order.
    expect(Object.keys(signed)).toEqual([
      'action',
      'payload',
      'chain',
      'wkIdentity',
      'signature',
      'message',
      'publicKey',
      'witnessScript',
    ]);
    expect(body).not.toHaveProperty('signature'); // input not mutated
  });

  it('throws instead of returning an unsigned body', async () => {
    await expect(
      attachRequiredWkAuth({ a: 1 }, 'bc1q', async () => null),
    ).rejects.toBeInstanceOf(RelayAuthUnavailableError);
    await expect(
      attachRequiredWkAuth({ a: 1 }, 'bc1q', async () => {
        throw new Error('locked');
      }),
    ).rejects.toBeInstanceOf(RelayAuthUnavailableError);
    await expect(
      attachRequiredWkAuth({ a: 1 }, 'bc1q', async () => ({
        ...auth,
        signature: '',
      })),
    ).rejects.toBeInstanceOf(RelayAuthUnavailableError);
    await expect(
      attachRequiredWkAuth({ a: 1 }, '', async () => auth),
    ).rejects.toBeInstanceOf(RelayAuthUnavailableError);
  });
});
