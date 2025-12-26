/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';

import {
  fetchNodesUtxos,
  getNodesOnNetwork,
  fetchDOSFlux,
  fetchStartFlux,
} from '../../src/lib/nodes';

describe('Nodes Lib', () => {
  describe('Verifies nodes', () => {
    it('should return fetchNodesUtxos data when value is valid', async () => {
      const res = await fetchNodesUtxos(
        't3ZQQsd8hJNw6UQKYLwfofdL3ntPmgkwofH',
        'flux',
      );
      expect(res[0]).not.toBeNull();
      expect(res[0]).toBeDefined();
      expect(res[0].txid).not.toBeNull();
      expect(res[0].txid).toBeDefined();
      expect(res[0].vout).not.toBeNull();
      expect(res[0].vout).toBeDefined();
      expect(res[0].scriptPubKey).not.toBeNull();
      expect(res[0].scriptPubKey).toBeDefined();
      expect(res[0].satoshis).not.toBeNull();
      expect(res[0].satoshis).toBeDefined();
      expect(res[0].confirmations).not.toBeNull();
      expect(res[0].confirmations).toBeDefined();
      expect(res[0].coinbase).toBe(false);
    });

    it('should return getNodesOnNetwork data when value is valid', async () => {
      const res = await getNodesOnNetwork(
        't3ZQQsd8hJNw6UQKYLwfofdL3ntPmgkwofH',
        'flux',
      );
      expect(res[0]).not.toBeNull();
      expect(res[0]).toBeDefined();
      expect(res[0].collateral).not.toBeNull();
      expect(res[0].collateral).toBeDefined();
      expect(res[0].txhash).not.toBeNull();
      expect(res[0].txhash).toBeDefined();
      expect(+res[0].outidx).toBeGreaterThanOrEqual(0);
      expect(res[0].ip).not.toBeNull();
      expect(res[0].ip).toBeDefined();
      expect(res[0].network).toBe('ipv4');
      expect(res[0].added_height).not.toBeNull();
      expect(res[0].added_height).toBeDefined();
      expect(res[0].confirmed_height).not.toBeNull();
      expect(res[0].confirmed_height).toBeDefined();
      expect(res[0].last_confirmed_height).not.toBeNull();
      expect(res[0].last_confirmed_height).toBeDefined();
      expect(res[0].last_paid_height).not.toBeNull();
      expect(res[0].last_paid_height).toBeDefined();
      expect(res[0].tier).not.toBeNull();
      expect(res[0].tier).toBeDefined();
      expect(res[0].payment_address).not.toBeNull();
      expect(res[0].payment_address).toBeDefined();
      expect(res[0].pubkey).not.toBeNull();
      expect(res[0].pubkey).toBeDefined();
      expect(res[0].activesince).not.toBeNull();
      expect(res[0].activesince).toBeDefined();
      expect(res[0].lastpaid).not.toBeNull();
      expect(res[0].lastpaid).toBeDefined();
      expect(res[0].amount).not.toBeNull();
      expect(res[0].amount).toBeDefined();
      expect(res[0].rank).not.toBeNull();
      expect(res[0].rank).toBeDefined();
    });

    it('should return fetchDOSFlux data when value is flux', async () => {
      const res = await fetchDOSFlux('flux');
      expect(Array.isArray(res)).toBe(true);
      // Array may be empty if no nodes are in DOS state
      if (res.length > 0) {
        expect(res[0]).not.toBeNull();
        expect(res[0]).toBeDefined();
        expect(res[0].collateral).not.toBeNull();
        expect(res[0].collateral).toBeDefined();
        expect(res[0].added_height).not.toBeNull();
        expect(res[0].added_height).toBeDefined();
        expect(res[0].payment_address).not.toBeNull();
        expect(res[0].payment_address).toBeDefined();
        expect(res[0].eligible_in).not.toBeNull();
        expect(res[0].eligible_in).toBeDefined();
        expect(res[0].amount).not.toBeNull();
        expect(res[0].amount).toBeDefined();
      }
    });

    it('should return fetchStartFlux data when value is flux', async () => {
      const res = await fetchStartFlux('flux');
      expect(Array.isArray(res)).toBe(true);
      // Array may be empty if no nodes are in start state
      if (res.length > 0) {
        expect(res[0]).not.toBeNull();
        expect(res[0]).toBeDefined();
        expect(res[0].collateral).not.toBeNull();
        expect(res[0].collateral).toBeDefined();
        expect(res[0].added_height).not.toBeNull();
        expect(res[0].added_height).toBeDefined();
        expect(res[0].payment_address).not.toBeNull();
        expect(res[0].payment_address).toBeDefined();
        expect(res[0].expires_in).not.toBeNull();
        expect(res[0].expires_in).toBeDefined();
        expect(res[0].amount).not.toBeNull();
        expect(res[0].amount).toBeDefined();
      }
    });
  });
});
