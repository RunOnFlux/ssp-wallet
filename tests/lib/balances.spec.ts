// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../src/lib/balances';

describe('Balances Lib', () => {
  describe('Verifies balances', () => {
    it('should return fetchAddressBalance data when value is flux', async () => {
      const res = await fetchAddressBalance(
        't3ZQQsd8hJNw6UQKYLwfofdL3ntPmgkwofH',
        'flux',
      );
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
      expect(res.unconfirmed).not.toBeNull();
      expect(res.unconfirmed).toBeDefined();
      expect(res.totalTransactions).not.toBeNull();
      expect(res.totalTransactions).toBeDefined();
      expect(res.address).toBe('t3ZQQsd8hJNw6UQKYLwfofdL3ntPmgkwofH');
    });

    it('should return fetchAddressBalance data when value is blockbook type', async () => {
      const res = await fetchAddressBalance(
        'bitcoincash:qzq4ehw7h3jgcx5tx687zyunfk6pm9hcrys4u3tvhl',
        'bch',
      );
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
      expect(res.unconfirmed).not.toBeNull();
      expect(res.unconfirmed).toBeDefined();
      expect(res.totalTransactions).not.toBeNull();
      expect(res.totalTransactions).toBeDefined();
      expect(res.address).toBe(
        'bitcoincash:qzq4ehw7h3jgcx5tx687zyunfk6pm9hcrys4u3tvhl',
      );
    });

    it('should return fetchAddressBalance data when value is evm type', async () => {
      const res = await fetchAddressBalance(
        '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
        'sepolia',
      );
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
      expect(res.unconfirmed).not.toBeNull();
      expect(res.unconfirmed).toBeDefined();
      expect(res.confirmed).not.toBeNull();
      expect(res.confirmed).toBeDefined();
      expect(res.address).toBe('0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1');
    });

    it('should return fetchAddressTokenBalances data when value is invalid', async () => {
      await expect(
        fetchAddressTokenBalances(
          't3ZQQsd8hJNw6UQKYLwfofdL3ntPmgkwofH',
          'flux',
          [],
        ),
      ).rejects.toThrow('Only EVM and Solana chains support token balances');
    });

    it('should return fetchAddressTokenBalances data when value is evm type', async () => {
      const res = await fetchAddressTokenBalances(
        '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
        'sepolia',
        ['0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1'],
      );
      expect(res[0]).not.toBeNull();
      expect(res[0]).toBeDefined();
      expect(res[0].contract).not.toBeNull();
      expect(res[0].contract).toBeDefined();
      expect(res[0].balance).not.toBeNull();
      expect(res[0].balance).toBeDefined();
    });
  });
});

describe('Balances Lib — Kaspa (mocked kaspa-rest-server)', () => {
  const address =
    'kaspa:prfu8rp4ek453lkhcewmn7w9acdqms9q2pegav5vhx6zscu73xh4ux2mdv2wp';
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ address, balance: 1234567890123 }),
        };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the sompi balance from kaspa-rest', async () => {
    const res = await fetchAddressBalance(address, 'kas');
    expect(res).toEqual({
      confirmed: '1234567890123',
      unconfirmed: '0',
      address,
    });
    expect(calls).toEqual([
      `https://api-kaspa.sspwallet.io/addresses/${encodeURIComponent(address)}/balance`,
    ]);
  });

  it('token balances are empty for kas (KRC-20 out of scope) and never throw', async () => {
    await expect(
      fetchAddressTokenBalances(address, 'kas', ['0xabc']),
    ).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
