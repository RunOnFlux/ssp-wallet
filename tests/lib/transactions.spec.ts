/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import { describe, it } from 'mocha';

import {
  processTransactionInternalScan,
  processTransactionsInternalScan,
  processTransactionExternalScan,
  processTransactionsExternalScan,
  fetchAddressTransactions,
  fetchAllAddressTransactions,
  decodeTransactionForApproval,
  decodeEVMTransactionForApproval,
} from '../../src/lib/transactions';

const { expect, assert } = chai;

const rawTxSepolia = JSON.stringify({
  id: '0x8b18236447c918b3b217da857a787a7561313b730374430596eaa6f9c2d0ee16',
  opHash: '0xc195efc3bf3541c0e4b75591c0a8bf36484fef6ef6feb85f501ed1b4daa4ba68',
  userOpRequest: {
    sender: '0xd447BA08b0d395fCAd6e480d270529c932289Ce1',
    nonce: '0x14',
    initCode: '0x',
    callData:
      '0xb61d27f600000000000000000000000066324ee406ccccdddad7f510a61af22dec391606000000000000000000000000000000000000000000000000016345785d8a000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000',
    callGasLimit: '0x6a02',
    verificationGasLimit: '0x13d5a',
    preVerificationGas: '0xfa5c',
    maxFeePerGas: '0x7309fdd1',
    maxPriorityFeePerGas: '0x59682f00',
    paymasterAndData: '0x',
    signature:
      '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c',
  },
  combinedPubKey:
    '03b0177e3dbfa2d2460721bc1f32c80576b7adfd7ab4a899c0065879ef95296acb',
  publicKeys: {
    '0x300429d8ef26b7264fab66d9368958d0e99e3f1f':
      '02e10148f9606cfc52d5a3a5d61fb3640d5f135266f32ac0b3dceff438c3f0bd52',
    '0x24c752b40767088059fc4d4be4fe4f52facbac57':
      '032f320a64727d2d23ccd6caa40af5f2700dc3265143d275beaf04194166b6756e',
  },
  publicNonces: {
    '0x300429d8ef26b7264fab66d9368958d0e99e3f1f': {
      kPublic:
        '022f8178611318387a91b287a5942278fb2f66942dfa72f2fdae5a2de4ba2a5e62',
      kTwoPublic:
        '037a0ba8f0d247907508520ba7df81a31c3f084eb2648f566c8ad902af7a798d63',
    },
    '0x24c752b40767088059fc4d4be4fe4f52facbac57': {
      kPublic:
        '03d0976461943725f33309ff56605784ad7c8d3e2b7a82c45c5df6151d9aed1149',
      kTwoPublic:
        '03d4f0e6406c080882c5574297c01ffd26aed8ca3f0cad34258592acf74d314650',
    },
  },
  signatures: {
    '0x300429d8ef26b7264fab66d9368958d0e99e3f1f': {
      finalPublicNonce:
        '037cde1f949b8c62d815da75d6082718538d0ef68b3819bdde4b7ec3afd5c26c91',
      challenge:
        '659c5592db35c0b52ec11487d92feb627d7b51d1f0a8fe1451f148726e59871d',
      signature:
        'e1f70aa45833fdd10fe3b254d9e5b173988c1c9c4e91c8b6220ad9314a39621e',
    },
  },
});

const rawTxFlux =
  '0400008085202f89016bf2b6449710be3300c3cc4a9ad2d4db7e88cea56168c46a16278b496e3415eb0000000092000047304402204d287d270c0d35e7c65f2b0f02b2ba8ca75e04934051691445115beb729beb54022060f01fcbf92957eb17d8a221a7d062a1fe5c86114deaf69bec99b65edafb82f201475221022a316c22acf16a9108b57f48802143cc0c0ac4b8fc360a87568e1794e51558752103749c957461154dfca921d0872ba3c9ac85d98c92e4a34fdac32bd03597fbd2f252aeffffffff02608501000000000017a914c9a895ceb2368f39686f8c77f6bc8c148ae6d54e870000000000000000136a1174657374207061796d656e74206e6f746500000000f7071a000000000000000000000000';

describe('Transactions Lib', function () {
  describe('Verifies transactions', function () {
    it('should return processTransactionInternalScan data when value is valid', function () {
      const res = processTransactionInternalScan(
        [
          {
            hash: '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
            blockNumber: 20597003,
            timeStamp: 1724488730,
          },
        ],
        '0xE6F30E1B28C67d787Bf8Bd21bA8E9756707E4713',
        'ETH',
      );
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
      assert.equal(res.type, 'evm');
      assert.equal(
        res.txid,
        '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
      );
      assert.equal(res.blockheight, 20597003);
      assert.equal(res.timestamp, 1724488730000);
      assert.equal(res.message, '');
      assert.equal(res.isError, false);
      assert.equal(res.receiver, '');
      assert.equal(res.fee, 0);
      assert.equal(res.amount, 0);
    });

    it('should return processTransactionsInternalScan data when value is valid', function () {
      const res = processTransactionsInternalScan(
        [
          {
            hash: '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
            blockNumber: 20597003,
            timeStamp: 1724488730,
          },
        ],
        '0xE6F30E1B28C67d787Bf8Bd21bA8E9756707E4713',
        'ETH',
      );
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      assert.equal(res[0].type, 'evm');
      assert.equal(
        res[0].txid,
        '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
      );
      assert.equal(res[0].blockheight, 20597003);
      assert.equal(res[0].timestamp, 1724488730000);
      assert.equal(res[0].message, '');
      assert.equal(res[0].isError, false);
      assert.equal(res[0].receiver, '');
      assert.equal(res[0].fee, 0);
      assert.equal(res[0].amount, 0);
    });

    it('should return processTransactionExternalScan data when value is valid', function () {
      const res = processTransactionExternalScan(
        {
          hash: '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
          blockNumber: 20597003,
          timeStamp: 1724488730,
          value: 0,
          to: '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
        },
        '0xE6F30E1B28C67d787Bf8Bd21bA8E9756707E4713',
        'ETH',
      );
      expect(res).to.not.be.null;
      expect(res).to.not.be.undefined;
      expect(res.fee).to.not.be.null;
      expect(res.fee).to.not.be.undefined;
      expect(res.amount).to.not.be.null;
      expect(res.amount).to.not.be.undefined;
      assert.equal(res.type, 'evm');
      assert.equal(
        res.txid,
        '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
      );
      assert.equal(res.blockheight, 20597003);
      assert.equal(res.timestamp, 1724488730000);
      assert.equal(res.message, '');
      assert.equal(res.isError, false);
      assert.equal(res.receiver, '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1');
    });

    it('should return processTransactionsExternalScan data when value is valid', function () {
      const res = processTransactionsExternalScan(
        [
          {
            hash: '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
            blockNumber: 20597003,
            timeStamp: 1724488730,
            value: 0,
            to: '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
          },
        ],
        '0xE6F30E1B28C67d787Bf8Bd21bA8E9756707E4713',
        'ETH',
      );
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].fee).to.not.be.null;
      expect(res[0].fee).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
      assert.equal(res[0].type, 'evm');
      assert.equal(
        res[0].txid,
        '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
      );
      assert.equal(res[0].blockheight, 20597003);
      assert.equal(res[0].timestamp, 1724488730000);
      assert.equal(res[0].message, '');
      assert.equal(res[0].isError, false);
      assert.equal(
        res[0].receiver,
        '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
      );
    });

    it('should return fetchAllAddressTransactions data when value is evm', async function () {
      const res = await fetchAllAddressTransactions(
        '0xa23702e9349fbf9939864da1245f5b358e7ef30b',
        'eth',
      );
      expect(res.length).to.be.greaterThan(55);
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].fee).to.not.be.null;
      expect(res[0].fee).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
      assert.equal(res[0].type, 'evm');
      expect(res[0].txid).to.not.be.null;
      expect(res[0].txid).to.not.be.undefined;
      expect(res[0].blockheight).to.not.be.null;
      expect(res[0].blockheight).to.not.be.undefined;
      expect(res[0].timestamp).to.not.be.null;
      expect(res[0].timestamp).to.not.be.undefined;
      assert.equal(res[0].message, '');
      expect(res[0].receiver).to.not.be.null;
      expect(res[0].receiver).to.not.be.undefined;
    }).timeout(5000);

    it('should return fetchAllAddressTransactions data when value is utxo insight', async function () {
      const res = await fetchAllAddressTransactions(
        't1cjcLaDHkNcuXh6uoyNL7u1jx7GxvzfYAN',
        'flux',
      );
      expect(res.length).to.be.greaterThan(200);
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].fee).to.not.be.null;
      expect(res[0].fee).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
      expect(res[0].txid).to.not.be.null;
      expect(res[0].txid).to.not.be.undefined;
      expect(res[0].blockheight).to.not.be.null;
      expect(res[0].blockheight).to.not.be.undefined;
      expect(res[0].timestamp).to.not.be.null;
      expect(res[0].timestamp).to.not.be.undefined;
      expect(res[0].receiver).to.not.be.null;
      expect(res[0].receiver).to.not.be.undefined;
    }).timeout(25000);

    it('should return fetchAllAddressTransactions data when value is utxo blockbook', async function () {
      const res = await fetchAllAddressTransactions(
        'bc1pv537rf60ayvhdj2ysdy70vl2w9sqtq2taqp2zx8y6smyj38m4spsr8d3uq',
        'btc',
      );
      expect(res.length).to.be.greaterThan(60);
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].fee).to.not.be.null;
      expect(res[0].fee).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
      expect(res[0].txid).to.not.be.null;
      expect(res[0].txid).to.not.be.undefined;
      expect(res[0].blockheight).to.not.be.null;
      expect(res[0].blockheight).to.not.be.undefined;
      expect(res[0].timestamp).to.not.be.null;
      expect(res[0].timestamp).to.not.be.undefined;
      assert.equal(res[0].message, '');
      expect(res[0].receiver).to.not.be.null;
      expect(res[0].receiver).to.not.be.undefined;
    }).timeout(25000);

    it('should return fetchAddressTransactions data when value is evm', async function () {
      const res = await fetchAddressTransactions(
        '0xE6F30E1B28C67d787Bf8Bd21bA8E9756707E4713',
        'eth',
        1,
        2,
      );
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].fee).to.not.be.null;
      expect(res[0].fee).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
      assert.equal(res[0].type, 'evm');
      expect(res[0].txid).to.not.be.null;
      expect(res[0].txid).to.not.be.undefined;
      expect(res[0].blockheight).to.not.be.null;
      expect(res[0].blockheight).to.not.be.undefined;
      expect(res[0].timestamp).to.not.be.null;
      expect(res[0].timestamp).to.not.be.undefined;
      assert.equal(res[0].message, '');
      expect(res[0].receiver).to.not.be.null;
      expect(res[0].receiver).to.not.be.undefined;
    }).timeout(5000);

    it('should return fetchAddressTransactions data when value is flux', async function () {
      const res = await fetchAddressTransactions(
        't1cwbdvsWGHjeG3sd2esrjbchSrzW62w3GY',
        'flux',
        1,
        2,
      );
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].fee).to.not.be.null;
      expect(res[0].fee).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
      expect(res[0].txid).to.not.be.null;
      expect(res[0].txid).to.not.be.undefined;
      expect(res[0].blockheight).to.not.be.null;
      expect(res[0].blockheight).to.not.be.undefined;
      expect(res[0].timestamp).to.not.be.null;
      expect(res[0].timestamp).to.not.be.undefined;
      assert.equal(res[0].message, '');
      expect(res[0].receiver).to.not.be.null;
      expect(res[0].receiver).to.not.be.undefined;
    });

    it('should return fetchAddressTransactions data when value is blockbook', async function () {
      const res = await fetchAddressTransactions(
        'bitcoincash:qrq0l3x9mqy6cjzxz85q5avj2gu5wj359ygc8kqmtm',
        'bch',
        1,
        2,
      );
      expect(res[0]).to.not.be.null;
      expect(res[0]).to.not.be.undefined;
      expect(res[0].fee).to.not.be.null;
      expect(res[0].fee).to.not.be.undefined;
      expect(res[0].amount).to.not.be.null;
      expect(res[0].amount).to.not.be.undefined;
      expect(res[0].txid).to.not.be.null;
      expect(res[0].txid).to.not.be.undefined;
      expect(res[0].blockheight).to.not.be.null;
      expect(res[0].blockheight).to.not.be.undefined;
      expect(res[0].timestamp).to.not.be.null;
      expect(res[0].timestamp).to.not.be.undefined;
      expect(res[0].message).to.not.be.null;
      expect(res[0].message).to.not.be.undefined;
      expect(res[0].size).to.not.be.null;
      expect(res[0].size).to.not.be.undefined;
      expect(res[0].receiver).to.not.be.null;
      expect(res[0].receiver).to.not.be.undefined;
    });

    it('should return decodeTransactionForApproval data when value is invalid', function () {
      const res = decodeTransactionForApproval('{}', 'sepolia');
      assert.deepEqual(res, {
        sender: 'decodingError',
        receiver: 'decodingError',
        amount: 'decodingError',
        fee: 'decodingError',
        token: 'decodingError',
      });
    });

    it('should return decodeTransactionForApproval data when value is invalid rawTx', function () {
      const res = decodeTransactionForApproval(rawTxSepolia, 'flux');
      assert.deepEqual(res, {
        sender: 'decodingError',
        receiver: 'decodingError',
        amount: 'decodingError',
      });
    });

    it('should return decodeTransactionForApproval data when value is valid', function () {
      const res = decodeTransactionForApproval(rawTxFlux, 'flux');
      assert.deepEqual(res, {
        sender: 't3VhYxSXapJEq2mH1z5MmFUcVLYvrYNfqbv',
        receiver: 't3cwthwVvGg7WKkxhzw87xnDDsdb9kS92x3',
        amount: '0.0009968',
      });
    });

    it('should return decodeEVMTransactionForApproval data when value is valid', function () {
      const res = decodeEVMTransactionForApproval(rawTxSepolia, 'sepolia');
      assert.deepEqual(res, {
        sender: '0xd447BA08b0d395fCAd6e480d270529c932289Ce1',
        receiver: '0x66324EE406cCccdDdAd7f510a61Af22DeC391606',
        amount: '0.1',
        fee: '591584934602552',
        token: '',
      });
    });

    it('should return decodeEVMTransactionForApproval data when value is invalid', function () {
      const res = decodeEVMTransactionForApproval('{}', 'sepolia');
      assert.deepEqual(res, {
        sender: 'decodingError',
        receiver: 'decodingError',
        amount: 'decodingError',
        fee: 'decodingError',
        token: 'decodingError',
      });
    });
  });
});
