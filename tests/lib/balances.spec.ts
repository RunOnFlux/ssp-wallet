/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import { describe, it } from 'mocha';

import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../src/lib/balances';

const { expect, assert } = chai;

describe('Balances Lib', function () {
  describe('Verifies balances', function () {
    it('should return fetchAddressBalance data when value is flux', async function () {
      const res = await fetchAddressBalance(
        't1ex3ZyD2gYqztumQpgG6uPDGK5iHFY6aEd',
        'flux',
      );
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
      expect(res.unconfirmed).to.not.be.null;
      expect(res.unconfirmed).to.not.be.undefined;
      expect(res.totalTransactions).to.not.be.null;
      expect(res.totalTransactions).to.not.be.undefined;
      assert.equal(res.address, 't1ex3ZyD2gYqztumQpgG6uPDGK5iHFY6aEd');
    });

    it('should return fetchAddressBalance data when value is blockbook type', async function () {
      const res = await fetchAddressBalance(
        'bitcoincash:qzq4ehw7h3jgcx5tx687zyunfk6pm9hcrys4u3tvhl',
        'bch',
      );
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
      expect(res.unconfirmed).to.not.be.null;
      expect(res.unconfirmed).to.not.be.undefined;
      expect(res.totalTransactions).to.not.be.null;
      expect(res.totalTransactions).to.not.be.undefined;
      assert.equal(
        res.address,
        'bitcoincash:qzq4ehw7h3jgcx5tx687zyunfk6pm9hcrys4u3tvhl',
      );
    });

    it('should return fetchAddressBalance data when value is evm type', async function () {
      const res = await fetchAddressBalance(
        '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
        'sepolia',
      );
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
      expect(res.unconfirmed).to.not.be.null;
      expect(res.unconfirmed).to.not.be.undefined;
      expect(res.confirmed).to.not.be.null;
      expect(res.confirmed).to.not.be.undefined;
      assert.equal(res.address, '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1');
    });

    it('should return fetchAddressTokenBalances data when value is invalid', async function () {
      await fetchAddressTokenBalances(
        't1ex3ZyD2gYqztumQpgG6uPDGK5iHFY6aEd',
        'flux',
        [],
      ).catch((r) => {
        assert.equal(r, 'Error: Only EVM chains support token balances');
      });
    });

    it('should return fetchAddressTokenBalances data when value is evm type', async function () {
      const res = await fetchAddressTokenBalances(
        '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
        'sepolia',
        ['0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1'],
      );
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].contract).to.not.be.null;
      expect(res[0].contract).to.not.be.undefined;
      expect(res[0].balance).to.not.be.null;
      expect(res[0].balance).to.not.be.undefined;
    });
  });
});
