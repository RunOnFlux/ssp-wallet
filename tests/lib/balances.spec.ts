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
      ).rejects.toThrow(
        'Only EVM, Solana and TRON chains support token balances',
      );
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

describe('Balances Lib — TRON (mocked full node)', () => {
  const vault = 'TWq9eJbomJDmkME7ahC4renGL2BXacL2vd';
  const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const bodies: { url: string; body: Record<string, unknown> }[] = [];
  let account: Record<string, unknown> = {};
  beforeEach(() => {
    bodies.length = 0;
    account = { address: vault, balance: 12345678 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        bodies.push({ url, body });
        if (url.endsWith('/wallet/getaccount')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(account),
          };
        }
        // triggerconstantcontract balanceOf → 25 USDT
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              result: { result: true },
              energy_used: 1000,
              constant_result: [
                '00000000000000000000000000000000000000000000000000000000017d7840',
              ],
              transaction: { ret: [{}] },
            }),
        };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('TRX balance in sun from /wallet/getaccount', async () => {
    const res = await fetchAddressBalance(vault, 'tron');
    expect(res).toEqual({
      confirmed: '12345678',
      unconfirmed: '0',
      address: vault,
    });
    expect(bodies[0]).toEqual({
      url: 'https://node-tron.sspwallet.io/wallet/getaccount',
      body: { address: vault, visible: true },
    });
  });

  it('a never-activated vault ({}) has 0 TRX', async () => {
    account = {};
    const res = await fetchAddressBalance(vault, 'tron');
    expect(res.confirmed).toBe('0');
  });

  it('TRC-20 balanceOf via triggerconstantcontract, base58 kept exact', async () => {
    const res = await fetchAddressTokenBalances(vault, 'tron', [
      USDT,
      '',
      '0xabc',
    ]);
    expect(res).toEqual([{ contract: USDT, balance: '25000000' }]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].url).toBe(
      'https://node-tron.sspwallet.io/wallet/triggerconstantcontract',
    );
    expect(bodies[0].body).toMatchObject({
      contract_address: USDT,
      visible: true,
    });
    expect(String(bodies[0].body.data)).toMatch(/^70a08231/);
  });
});
