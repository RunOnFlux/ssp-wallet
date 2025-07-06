// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';

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
      ).rejects.toThrow('Only EVM chains support token balances');
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
