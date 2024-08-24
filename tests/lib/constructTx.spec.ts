/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import sinon from 'sinon';
import httpMocks from 'node-mocks-http';
import axios from 'axios';
import utxolib from '@runonflux/utxo-lib';

import { 
    getLibId,
    clearUtxoCache,
    fetchUtxos,
    finaliseTransaction,
    signTransaction,
    buildUnsignedRawTx,
    getSizeOfRawTransaction,
    getTransactionSize,
    constructAndSignTransaction,
    broadcastTx,
    estimateGas,
    constructAndSignEVMTransaction
} from '../../src/lib/constructTx';

const { expect, assert } = chai;

const rawTxFlux = "0400008085202f89016bf2b6449710be3300c3cc4a9ad2d4db7e88cea56168c46a16278b496e3415eb0000000092000047304402204d287d270c0d35e7c65f2b0f02b2ba8ca75e04934051691445115beb729beb54022060f01fcbf92957eb17d8a221a7d062a1fe5c86114deaf69bec99b65edafb82f201475221022a316c22acf16a9108b57f48802143cc0c0ac4b8fc360a87568e1794e51558752103749c957461154dfca921d0872ba3c9ac85d98c92e4a34fdac32bd03597fbd2f252aeffffffff02608501000000000017a914c9a895ceb2368f39686f8c77f6bc8c148ae6d54e870000000000000000136a1174657374207061796d656e74206e6f746500000000f7071a000000000000000000000000";

const rawTxSepolia = {
    "id": "0x8b18236447c918b3b217da857a787a7561313b730374430596eaa6f9c2d0ee16",
    "opHash": "0xc195efc3bf3541c0e4b75591c0a8bf36484fef6ef6feb85f501ed1b4daa4ba68",
    "userOpRequest": {
        "sender": "0xd447BA08b0d395fCAd6e480d270529c932289Ce1",
        "nonce": "0x14",
        "initCode": "0x",
        "callData": "0xb61d27f600000000000000000000000066324ee406ccccdddad7f510a61af22dec391606000000000000000000000000000000000000000000000000016345785d8a000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        "callGasLimit": "0x6a02",
        "verificationGasLimit": "0x13d5a",
        "preVerificationGas": "0xfa5c",
        "maxFeePerGas": "0x7309fdd1",
        "maxPriorityFeePerGas": "0x59682f00",
        "paymasterAndData": "0x",
        "signature": "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
    },
    "combinedPubKey": "03b0177e3dbfa2d2460721bc1f32c80576b7adfd7ab4a899c0065879ef95296acb",
    "publicKeys": {
        "0x300429d8ef26b7264fab66d9368958d0e99e3f1f": "02e10148f9606cfc52d5a3a5d61fb3640d5f135266f32ac0b3dceff438c3f0bd52",
        "0x24c752b40767088059fc4d4be4fe4f52facbac57": "032f320a64727d2d23ccd6caa40af5f2700dc3265143d275beaf04194166b6756e"
    },
    "publicNonces": {
        "0x300429d8ef26b7264fab66d9368958d0e99e3f1f": {
            "kPublic": "022f8178611318387a91b287a5942278fb2f66942dfa72f2fdae5a2de4ba2a5e62",
            "kTwoPublic": "037a0ba8f0d247907508520ba7df81a31c3f084eb2648f566c8ad902af7a798d63"
        },
        "0x24c752b40767088059fc4d4be4fe4f52facbac57": {
            "kPublic": "03d0976461943725f33309ff56605784ad7c8d3e2b7a82c45c5df6151d9aed1149",
            "kTwoPublic": "03d4f0e6406c080882c5574297c01ffd26aed8ca3f0cad34258592acf74d314650"
        }
    },
    "signatures": {
        "0x300429d8ef26b7264fab66d9368958d0e99e3f1f": {
            "finalPublicNonce": "037cde1f949b8c62d815da75d6082718538d0ef68b3819bdde4b7ec3afd5c26c91",
            "challenge": "659c5592db35c0b52ec11487d92feb627d7b51d1f0a8fe1451f148726e59871d",
            "signature": "e1f70aa45833fdd10fe3b254d9e5b173988c1c9c4e91c8b6220ad9314a39621e"
        }
    }
};

describe('ConstructTx Lib', () => {
  describe('Verifies constructTx', () => {
    afterEach(function() {
      sinon.restore();
    });

    it('should return getLibId data when value is flux', async () => {
        const res = await getLibId('flux');
        assert.equal(res,'flux');
    });

    it('should return getLibId data when value is evm', async () => {
        const res = await getLibId('sepolia');
        assert.equal(res,'sepolia');
    });

    it('should return getLibId data when value is blockbook', async () => {
        const res = await getLibId('bch');
        assert.equal(res,'bitcoincash');
    });

    it('should return clearUtxoCache data when value is valid', async () => {
        await clearUtxoCache();
    });

    it('should return fetchUtxos data when value is valid blockbook', async () => {
        const res = await fetchUtxos("bitcoincash:qrq0l3x9mqy6cjzxz85q5avj2gu5wj359ygc8kqmtm","bch");
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

    it('should return fetchUtxos data when value is valid flux', async () => {
        const res = await fetchUtxos("t1cwbdvsWGHjeG3sd2esrjbchSrzW62w3GY","flux");
        console.log(res[0])
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

    it('should return finaliseTransaction data when value is valid', async () => {
        const res = await finaliseTransaction(rawTxFlux,"flux");
        assert.equal(res, "0400008085202f89016bf2b6449710be3300c3cc4a9ad2d4db7e88cea56168c46a16278b496e3415eb00000000910047304402204d287d270c0d35e7c65f2b0f02b2ba8ca75e04934051691445115beb729beb54022060f01fcbf92957eb17d8a221a7d062a1fe5c86114deaf69bec99b65edafb82f201475221022a316c22acf16a9108b57f48802143cc0c0ac4b8fc360a87568e1794e51558752103749c957461154dfca921d0872ba3c9ac85d98c92e4a34fdac32bd03597fbd2f252aeffffffff02608501000000000017a914c9a895ceb2368f39686f8c77f6bc8c148ae6d54e870000000000000000136a1174657374207061796d656e74206e6f746500000000f7071a000000000000000000000000");
    });

    it.skip('should return signTransaction data when value is valid', async () => {
        const res = await signTransaction(rawTxFlux, "flux", '0x29c6fbfe8f749d4d122a3a8422e63977aaf943fb3674a927fb88f1a2833a53ad', "test", "test", 
          {
            txid: '9649b8ddc0e69237606bea21b886696bb90d7fa2afca1f318490054e69c5af2f',
            vout: 1,
            scriptPubKey: '76a914d12bbee355284f735f8d55e809fee9134c21acf088ac',
            satoshis: '281250000',
            confirmations: 5803,
            coinbase: false
          });
    });

    it.skip('should return buildUnsignedRawTx data when value is valid', async () => {
        const res = await buildUnsignedRawTx(
          "flux",
          [{
            txid: '8d14e4cf670c0c68e9289fc89dbec80a128b9536342b6af31f2fc3b07ba87178',
            vout: 1,
            scriptPubKey: '76a914d12bbee355284f735f8d55e809fee9134c21acf088ac',
            satoshis: '281250000',
            confirmations: 5881,
            coinbase: false
          }],
          "",
          "0",
          "0",
          "",
          "test",
          "1",
          true,
          0,
        );
    });

    it('should return getSizeOfRawTransaction data when value is valid', async () => {
        const res = await getSizeOfRawTransaction(rawTxFlux,"flux");
        assert.equal(res, 276);
    });

    it.skip('should return getTransactionSize data when value is valid', async () => {
        const res = await getTransactionSize(
            "flux",
            "t3aBF8ML2AJgXuW93Gp9MUs3YcQ8DkFQ2B5",
            "100",
            "1",
            "t3aBF8ML2AJgXuW93Gp9MUs3YcQ8DkFQ2B5",
            "",
            "",
            "0x29c6fbfe8f749d4d122a3a8422e63977aaf943fb3674a927fb88f1a2833a53ad",
            "52210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da52ae",
            "52210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da52ae",
            "1",
        );
    });

    it.skip('should return constructAndSignTransaction data when value is valid', async () => {
        const res = await constructAndSignTransaction(
            "flux",
            "t3aBF8ML2AJgXuW93Gp9MUs3YcQ8DkFQ2B5",
            "100.00",
            "10.00",
            "t3aBF8ML2AJgXuW93Gp9MUs3YcQ8DkFQ2B5",
            "",
            "",
            "0x29c6fbfe8f749d4d122a3a8422e63977aaf943fb3674a927fb88f1a2833a53ad",
            "52210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da52ae",
            "52210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da52ae",
            "10.00",
        );
    });

    it.skip('should return broadcastTx data when value is valid', async () => {
        const res = await broadcastTx(rawTxSepolia,"sepolia");
        console.log(res)
    });

    it('should return estimateGas data when value is valid', async () => {
        const res = await estimateGas("sepolia","0xd447BA08b0d395fCAd6e480d270529c932289Ce1","sepolia");
        assert.equal(res, 271832);
    });

    it.skip('should return constructAndSignEVMTransaction data when value is valid', async () => {
        const res = await constructAndSignEVMTransaction("sepolia","0xd447BA08b0d395fCAd6e480d270529c932289Ce1","sepolia");
    });

  });
});