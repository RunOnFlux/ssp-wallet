/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import sinon from 'sinon';
import httpMocks from 'node-mocks-http';
import axios from 'axios';

import { 
    fetchNodesUtxos,
    getNodesOnNetwork,
    fetchDOSFlux,
    fetchStartFlux
} from '../../src/lib/nodes';

const { expect, assert } = chai;

describe('Nodes Lib', () => {
  describe('Verifies nodes', () => {
    afterEach(function() {
      sinon.restore();
    });

    it('should return fetchNodesUtxos data when value is valid', async () => {
        const res = await fetchNodesUtxos('t1ex3ZyD2gYqztumQpgG6uPDGK5iHFY6aEd','flux');
        expect(res[0]).to.not.be.null;
        expect(res[0]).to.not.be.undefined;
        expect(res[0].txid).to.not.be.null;
        expect(res[0].txid).to.not.be.undefined;
        expect(res[0].vout).to.not.be.null;
        expect(res[0].vout).to.not.be.undefined;
        expect(res[0].scriptPubKey).to.not.be.null;
        expect(res[0].scriptPubKey).to.not.be.undefined;
        expect(res[0].satoshis).to.not.be.null;
        expect(res[0].satoshis).to.not.be.undefined;
        expect(res[0].confirmations).to.not.be.null;
        expect(res[0].confirmations).to.not.be.undefined;
        assert.equal(res[0].coinbase, false);
    });

    it('should return getNodesOnNetwork data when value is valid', async () => {
      const res = await getNodesOnNetwork('t1ex3ZyD2gYqztumQpgG6uPDGK5iHFY6aEd','flux');
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].collateral).to.not.be.null;
      expect(res[0].collateral).to.not.be.undefined;
      expect(res[0].txhash).to.not.be.null;
      expect(res[0].txhash).to.not.be.undefined;
      assert.equal(res[0].outidx, 0);
      expect(res[0].ip).to.not.be.null;
      expect(res[0].ip).to.not.be.undefined;
      assert.equal(res[0].network, 'ipv4');
      expect(res[0].added_height).to.not.be.null;
      expect(res[0].added_height).to.not.be.undefined;
      expect(res[0].confirmed_height).to.not.be.null;
      expect(res[0].confirmed_height).to.not.be.undefined;
      expect(res[0].last_confirmed_height).to.not.be.null;
      expect(res[0].last_confirmed_height).to.not.be.undefined;
      expect(res[0].last_paid_height).to.not.be.null;
      expect(res[0].last_paid_height).to.not.be.undefined;
      expect(res[0].tier).to.not.be.null;
      expect(res[0].tier).to.not.be.undefined;
      expect(res[0].payment_address).to.not.be.null;
      expect(res[0].payment_address).to.not.be.undefined;
      expect(res[0].pubkey).to.not.be.null;
      expect(res[0].pubkey).to.not.be.undefined;
      expect(res[0].activesince).to.not.be.null;
      expect(res[0].activesince).to.not.be.undefined;
      expect(res[0].lastpaid).to.not.be.null;
      expect(res[0].lastpaid).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
      expect(res[0].rank).to.not.be.null;
      expect(res[0].rank).to.not.be.undefined;
    });

    it('should return fetchDOSFlux data when value is flux', async () => {
      const res = await fetchDOSFlux('flux');
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].collateral).to.not.be.null;
      expect(res[0].collateral).to.not.be.undefined;
      expect(res[0].added_height).to.not.be.null;
      expect(res[0].added_height).to.not.be.undefined;
      expect(res[0].payment_address).to.not.be.null;
      expect(res[0].payment_address).to.not.be.undefined;
      expect(res[0].eligible_in).to.not.be.null;
      expect(res[0].eligible_in).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
    });

    it('should return fetchStartFlux data when value is flux', async () => {
      const res = await fetchStartFlux('flux');
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].collateral).to.not.be.null;
      expect(res[0].collateral).to.not.be.undefined;
      expect(res[0].added_height).to.not.be.null;
      expect(res[0].added_height).to.not.be.undefined;
      expect(res[0].payment_address).to.not.be.null;
      expect(res[0].payment_address).to.not.be.undefined;
      expect(res[0].expires_in).to.not.be.null;
      expect(res[0].expires_in).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
    });

  });
});