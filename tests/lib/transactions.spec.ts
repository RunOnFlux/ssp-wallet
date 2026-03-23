/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';

import {
  processTransactionInternalScan,
  processTransactionsInternalScan,
  processTransactionExternalScan,
  processTransactionsExternalScan,
  fetchAddressTransactions,
  fetchAllAddressTransactions,
  decodeTransactionForApproval,
  decodeEVMTransactionForApproval,
  decodeVaultTransaction,
} from '../../src/lib/transactions';
import utxolib from '@runonflux/utxo-lib';
import { encodeFunctionData, erc20Abi } from 'viem';
import * as abi from '@runonflux/aa-schnorr-multisig-sdk/dist/abi';

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

describe('Transactions Lib', () => {
  describe('Verifies transactions', () => {
    it('should return processTransactionInternalScan data when value is valid', () => {
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
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
      expect(res.type).toBe('evm');
      expect(res.txid).toBe(
        '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
      );
      expect(res.blockheight).toBe(20597003);
      expect(res.timestamp).toBe(1724488730000);
      expect(res.message).toBe('');
      expect(res.isError).toBe(false);
      expect(res.receiver).toBe('');
      expect(res.fee).toBe('0');
      expect(res.amount).toBe('0');
    });

    it('should return processTransactionsInternalScan data when value is valid', () => {
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
      expect(res[0]).not.toBeNull();
      expect(res[0]).toBeDefined();
      expect(res[0].type).toBe('evm');
      expect(res[0].txid).toBe(
        '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
      );
      expect(res[0].blockheight).toBe(20597003);
      expect(res[0].timestamp).toBe(1724488730000);
      expect(res[0].message).toBe('');
      expect(res[0].isError).toBe(false);
      expect(res[0].receiver).toBe('');
      expect(res[0].fee).toBe('0');
      expect(res[0].amount).toBe('0');
    });

    it('should return processTransactionExternalScan data when value is valid', () => {
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
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
      expect(res.fee).not.toBeNull();
      expect(res.fee).toBeDefined();
      expect(res.amount).not.toBeNull();
      expect(res.amount).toBeDefined();
      expect(res.type).toBe('evm');
      expect(res.txid).toBe(
        '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
      );
      expect(res.blockheight).toBe(20597003);
      expect(res.timestamp).toBe(1724488730000);
      expect(res.message).toBe('');
      expect(res.isError).toBe(false);
      expect(res.receiver).toBe('0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1');
    });

    it('should return processTransactionsExternalScan data when value is valid', () => {
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
      expect(res[0]).not.toBeNull();
      expect(res[0]).toBeDefined();
      expect(res[0].fee).not.toBeNull();
      expect(res[0].fee).toBeDefined();
      expect(res[0].amount).not.toBeNull();
      expect(res[0].amount).toBeDefined();
      expect(res[0].type).toBe('evm');
      expect(res[0].txid).toBe(
        '0xee2d88632242c178707e6ed3577548041e0efa761035a84151c59364e8ba76f3',
      );
      expect(res[0].blockheight).toBe(20597003);
      expect(res[0].timestamp).toBe(1724488730000);
      expect(res[0].message).toBe('');
      expect(res[0].isError).toBe(false);
      expect(res[0].receiver).toBe(
        '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
      );
    });

    it('should return fetchAllAddressTransactions data when value is evm', async () => {
      const res = await fetchAllAddressTransactions(
        '0xa23702e9349fbf9939864da1245f5b358e7ef30b',
        'sepolia',
      );
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
    });

    it('should return fetchAllAddressTransactions data when value is flux', async () => {
      const res = await fetchAllAddressTransactions(
        't3ThbWogDoAjGuS6DEnmN1GWJBRbVjSUK4T',
        'flux',
      );
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
    });

    it('should return fetchAddressTransactions data when value is flux', async () => {
      const res = await fetchAddressTransactions(
        't3ThbWogDoAjGuS6DEnmN1GWJBRbVjSUK4T',
        'flux',
        0,
        0,
        '',
      );
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
    });

    it('should return fetchAddressTransactions data when value is evm', async () => {
      const res = await fetchAddressTransactions(
        '0xa23702e9349fbf9939864da1245f5b358e7ef30b',
        'sepolia',
        0,
        0,
        '',
      );
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
    });

    it('should return decodeTransactionForApproval data when value is valid (legacy)', () => {
      const res = decodeTransactionForApproval(rawTxFlux, 'flux');
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
      expect(res.sender).toBe('t3VhYxSXapJEq2mH1z5MmFUcVLYvrYNfqbv');
      expect(res.receiver).toBe('t3cwthwVvGg7WKkxhzw87xnDDsdb9kS92x3');
      expect(res.amount).toBe('0.0009968');
    });

    it('should return decodeEVMTransactionForApproval data when value is valid', () => {
      const res = decodeEVMTransactionForApproval(rawTxSepolia, 'sepolia');
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
      expect(res.sender).toBe('0xd447BA08b0d395fCAd6e480d270529c932289Ce1');
      expect(res.receiver).toBe('0x66324EE406cCccdDdAd7f510a61Af22DeC391606');
      expect(res.amount).toBe('0.1');
      expect(res.fee).toBe('591584934602552');
      expect(res.token).toBe('');
      expect(res.tokenSymbol).toBe('TEST-ETH');
      expect(res.decimals).toBe(18);
    });
  });

  // ─── Vault decode: UTXO helpers ──────────────────────────────────────────

  const fluxNetwork = utxolib.networks.flux;

  // Deterministic keypairs for reproducible 2-of-2 multisig
  const utxoKey1 = utxolib.ECPair.fromWIF(
    'L1TnU2zbNaAqMoVh65Cyvmcjzbrj41Gs9iTLcWbpJCMynXuap6UN',
    fluxNetwork,
  );
  const utxoKey2 = utxolib.ECPair.fromWIF(
    'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn',
    fluxNetwork,
  );
  const utxoPubkeys = [
    utxoKey1.getPublicKeyBuffer(),
    utxoKey2.getPublicKeyBuffer(),
  ].sort(Buffer.compare);
  const multisigRedeemScript = utxolib.script.multisig.output.encode(
    2,
    utxoPubkeys,
  );
  const multisigScriptPubKey = utxolib.script.scriptHash.output.encode(
    utxolib.crypto.hash160(multisigRedeemScript),
  );
  const senderAddress = utxolib.address.fromOutputScript(
    multisigScriptPubKey,
    fluxNetwork,
  );

  const recipientA = 't3cwthwVvGg7WKkxhzw87xnDDsdb9kS92x3';
  const recipientB = 't3VhYxSXapJEq2mH1z5MmFUcVLYvrYNfqbv';

  function buildFluxTx(outputs, inputCount = 1) {
    const txb = new utxolib.TransactionBuilder(fluxNetwork);
    txb.setVersion(4);
    txb.setVersionGroupId(0x892f2085);

    for (let i = 0; i < inputCount; i++) {
      const prevTxId = Buffer.alloc(32, 0);
      prevTxId[0] = 0xaa + i;
      txb.addInput(prevTxId, i);
    }

    for (const out of outputs) {
      if (out.opReturn) {
        const script = utxolib.script.nullData.output.encode(
          Buffer.from(out.opReturn),
        );
        txb.addOutput(script, 0);
      } else {
        const script =
          out.address === 'SENDER'
            ? multisigScriptPubKey
            : utxolib.address.toOutputScript(out.address, fluxNetwork);
        txb.addOutput(script, out.value);
      }
    }

    for (let i = 0; i < inputCount; i++) {
      txb.sign(
        i,
        utxoKey1,
        multisigRedeemScript,
        utxolib.Transaction.SIGHASH_ALL,
        100000,
      );
    }

    return txb.buildIncomplete().toHex();
  }

  // ─── Vault decode: EVM helpers ───────────────────────────────────────────

  function buildUserOp(params) {
    return JSON.stringify({
      userOpRequest: {
        sender: params.sender,
        nonce: '0x1',
        initCode: '0x',
        callData: params.callData,
        callGasLimit: params.callGasLimit || '0x10000',
        verificationGasLimit: params.verificationGasLimit || '0x10000',
        preVerificationGas: params.preVerificationGas || '0x10000',
        maxFeePerGas: params.maxFeePerGas || '0x3B9ACA00',
        maxPriorityFeePerGas: params.maxPriorityFeePerGas || '0x3B9ACA00',
        paymasterAndData: '0x',
        signature: '0x',
      },
    });
  }

  function encodeExecute(dest, value, func = '0x') {
    return encodeFunctionData({
      abi: abi.MultiSigSmartAccount_abi,
      functionName: 'execute',
      args: [dest, BigInt(value), func],
    });
  }

  function encodeErc20Transfer(to, amount) {
    return encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, BigInt(amount)],
    });
  }

  // ─── Vault decode: UTXO round-trip ───────────────────────────────────────

  describe('decodeVaultTransaction — UTXO round-trip', () => {
    it('single recipient + change: decode matches construction', () => {
      const rawHex = buildFluxTx([
        { address: recipientA, value: 50000 },
        { address: 'SENDER', value: 49500 },
      ]);

      const res = decodeVaultTransaction(rawHex, 'flux', ['100000']);

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe(senderAddress);
      expect(res.recipients).toHaveLength(1);
      expect(res.recipients[0].address).toBe(recipientA);
      expect(res.recipients[0].amount).toBe('50000');
      expect(res.fee).toBe('500');
    });

    it('two recipients + change: decode finds both recipients', () => {
      const rawHex = buildFluxTx(
        [
          { address: recipientA, value: 80000 },
          { address: recipientB, value: 30000 },
          { address: 'SENDER', value: 85000 },
        ],
        2,
      );

      const res = decodeVaultTransaction(rawHex, 'flux', ['100000', '100000']);

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe(senderAddress);
      expect(res.recipients).toHaveLength(2);
      expect(res.recipients[0].address).toBe(recipientA);
      expect(res.recipients[0].amount).toBe('80000');
      expect(res.recipients[1].address).toBe(recipientB);
      expect(res.recipients[1].amount).toBe('30000');
      expect(res.fee).toBe('5000');
    });

    it('OP_RETURN memo output is skipped (value 0)', () => {
      const rawHex = buildFluxTx([
        { address: recipientA, value: 75000 },
        { address: 'SENDER', value: 24500 },
        { opReturn: 'vault payment #42' },
      ]);

      const res = decodeVaultTransaction(rawHex, 'flux', ['100000']);

      expect(res.error).toBeUndefined();
      expect(res.recipients).toHaveLength(1);
      expect(res.recipients[0].address).toBe(recipientA);
      expect(res.recipients[0].amount).toBe('75000');
      expect(res.fee).toBe('500');
    });

    it('all outputs to sender = no recipients (consolidation tx)', () => {
      const rawHex = buildFluxTx([{ address: 'SENDER', value: 99500 }]);

      const res = decodeVaultTransaction(rawHex, 'flux', ['100000']);

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe(senderAddress);
      expect(res.recipients).toHaveLength(0);
      expect(res.fee).toBe('500');
    });

    it('no change output = entire amount to recipients', () => {
      const rawHex = buildFluxTx([{ address: recipientA, value: 99500 }]);

      const res = decodeVaultTransaction(rawHex, 'flux', ['100000']);

      expect(res.error).toBeUndefined();
      expect(res.recipients).toHaveLength(1);
      expect(res.recipients[0].amount).toBe('99500');
      expect(res.fee).toBe('500');
    });

    it('multiple inputs sum correctly for fee', () => {
      const rawHex = buildFluxTx(
        [
          { address: recipientA, value: 200000 },
          { address: 'SENDER', value: 90000 },
        ],
        3,
      );

      const res = decodeVaultTransaction(rawHex, 'flux', [
        '120000',
        '95000',
        '80000',
      ]);

      expect(res.error).toBeUndefined();
      expect(res.fee).toBe('5000');
    });

    it('fee is 0 when no input amounts provided', () => {
      const rawHex = buildFluxTx([
        { address: recipientA, value: 50000 },
        { address: 'SENDER', value: 49500 },
      ]);

      const res = decodeVaultTransaction(rawHex, 'flux', []);
      expect(res.fee).toBe('0');
    });
  });

  // ─── Vault decode: UTXO real transaction ─────────────────────────────────

  describe('decodeVaultTransaction — UTXO real transaction', () => {
    it('should decode real Flux P2SH multisig TX', () => {
      const res = decodeVaultTransaction(rawTxFlux, 'flux', []);

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe('t3VhYxSXapJEq2mH1z5MmFUcVLYvrYNfqbv');
      expect(res.recipients).toHaveLength(1);
      expect(res.recipients[0].address).toBe(recipientA);
      expect(res.recipients[0].amount).toBe('99680');
    });

    it('should calculate fee correctly for real Flux TX', () => {
      const res = decodeVaultTransaction(rawTxFlux, 'flux', ['100000']);
      expect(res.fee).toBe('320');
    });
  });

  // ─── Vault decode: EVM native transfer round-trip ────────────────────────

  describe('decodeVaultTransaction — EVM native transfer round-trip', () => {
    it('should decode 0.5 ETH native transfer', () => {
      const recipient = '0x3333333333333333333333333333333333333333';
      const sender = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const amountWei = '500000000000000000';

      const callData = encodeExecute(recipient, amountWei);
      const rawTx = buildUserOp({
        sender,
        callData,
        callGasLimit: '0xC350',
        verificationGasLimit: '0xC350',
        preVerificationGas: '0xC350',
        maxFeePerGas: '0x2540BE400',
        maxPriorityFeePerGas: '0x77359400',
      });

      const res = decodeVaultTransaction(rawTx, 'eth');

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe(sender);
      expect(res.recipients).toHaveLength(1);
      expect(res.recipients[0].address).toBe(recipient);
      expect(res.recipients[0].amount).toBe(amountWei);
      expect(res.tokenSymbol).toBe('ETH');
      expect(res.tokenContract).toBeUndefined();
      expect(res.fee).toBe('1800000000000000');
    });

    it('should decode real Sepolia 0.1 TEST-ETH transfer', () => {
      const res = decodeVaultTransaction(rawTxSepolia, 'sepolia');

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe('0xd447BA08b0d395fCAd6e480d270529c932289Ce1');
      expect(res.recipients[0].address).toBe(
        '0x66324EE406cCccdDdAd7f510a61Af22DeC391606',
      );
      expect(res.recipients[0].amount).toBe('100000000000000000');
      expect(res.tokenSymbol).toBe('TEST-ETH');
      expect(res.fee).toBe('591584934602552');
    });

    it('should decode real Sepolia vault proposal (evmUserOp wrapped)', () => {
      // Real evmUserOp from a production vault proposal — this is how wallet/key
      // reconstruct the decodable JSON from the evmUserOp field
      const evmUserOp = {
        sender: '0x015A90244c718c454d503ac67212f88F00D16d87',
        nonce:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        initCode: '0x',
        callData:
          '0xb61d27f600000000000000000000000074bf2d5a93e3f1cd91b1e3e5039269c9829a4d0600000000000000000000000000000000000000000000000000005af3107a400000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000',
        callGasLimit: '0x524a',
        verificationGasLimit: '0x1181a',
        preVerificationGas: '0xcfbb',
        maxFeePerGas: '0x4aa00100',
        maxPriorityFeePerGas: '0x4a817c80',
        paymasterAndData: '0x',
        signature: '0x',
      };
      const decodableJson = JSON.stringify({ userOpRequest: evmUserOp });

      const res = decodeVaultTransaction(decodableJson, 'sepolia');

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe('0x015A90244c718c454d503ac67212f88F00D16d87');
      expect(res.recipients).toHaveLength(1);
      expect(res.recipients[0].address.toLowerCase()).toBe(
        '0x74bf2d5a93e3f1cd91b1e3e5039269c9829a4d06',
      );
      expect(res.recipients[0].amount).toBe('100000000000000');
      expect(res.tokenSymbol).toBe('TEST-ETH');
      // fee = (0x524a + 0x1181a + 0xcfbb) * (0x4aa00100 + 0x4a817c80) = 365169402000000
      expect(res.fee).toBe('365169402000000');
    });

    it('should decode a very small native transfer (1 wei)', () => {
      const recipient = '0x5555555555555555555555555555555555555555';
      const sender = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

      const callData = encodeExecute(recipient, '1');
      const rawTx = buildUserOp({ sender, callData });

      const res = decodeVaultTransaction(rawTx, 'sepolia');

      expect(res.error).toBeUndefined();
      expect(res.recipients[0].amount).toBe('1');
      expect(res.tokenSymbol).toBe('TEST-ETH');
    });

    it('should decode a large native transfer (1000 ETH)', () => {
      const recipient = '0x6666666666666666666666666666666666666666';
      const sender = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
      const thousandEth = '1000000000000000000000';

      const callData = encodeExecute(recipient, thousandEth);
      const rawTx = buildUserOp({ sender, callData });

      const res = decodeVaultTransaction(rawTx, 'eth');

      expect(res.error).toBeUndefined();
      expect(res.recipients[0].amount).toBe(thousandEth);
    });
  });

  // ─── Vault decode: EVM ERC-20 round-trip ─────────────────────────────────

  describe('decodeVaultTransaction — EVM ERC-20 round-trip', () => {
    const USDC_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const USDT_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

    it('should decode 1 USDC transfer with token metadata', () => {
      const recipient = '0x1111111111111111111111111111111111111111';
      const sender = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
      const amount = '1000000';

      const innerTransfer = encodeErc20Transfer(recipient, amount);
      const callData = encodeExecute(USDC_CONTRACT, '0', innerTransfer);
      const rawTx = buildUserOp({ sender, callData });

      const res = decodeVaultTransaction(rawTx, 'eth');

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe(sender);
      expect(res.recipients).toHaveLength(1);
      expect(res.recipients[0].address).toBe(recipient);
      expect(res.recipients[0].amount).toBe(amount);
      expect(res.tokenContract).toBe(USDC_CONTRACT);
      expect(res.tokenSymbol).toBe('USDC');
      expect(res.tokenDecimals).toBe(6);
    });

    it('should decode 5000 USDT transfer with token metadata', () => {
      const recipient = '0x7777777777777777777777777777777777777777';
      const sender = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
      const amount = '5000000000';

      const innerTransfer = encodeErc20Transfer(recipient, amount);
      const callData = encodeExecute(USDT_CONTRACT, '0', innerTransfer);
      const rawTx = buildUserOp({ sender, callData });

      const res = decodeVaultTransaction(rawTx, 'eth');

      expect(res.error).toBeUndefined();
      expect(res.recipients[0].address).toBe(recipient);
      expect(res.recipients[0].amount).toBe(amount);
      expect(res.tokenContract).toBe(USDT_CONTRACT);
      expect(res.tokenSymbol).toBe('USDT');
      expect(res.tokenDecimals).toBe(6);
    });

    it('should decode unknown token transfer (no metadata)', () => {
      const unknownToken = '0x9999999999999999999999999999999999999999';
      const recipient = '0x8888888888888888888888888888888888888888';
      const sender = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
      const amount = '999999';

      const innerTransfer = encodeErc20Transfer(recipient, amount);
      const callData = encodeExecute(unknownToken, '0', innerTransfer);
      const rawTx = buildUserOp({ sender, callData });

      const res = decodeVaultTransaction(rawTx, 'eth');

      expect(res.error).toBeUndefined();
      expect(res.recipients[0].address).toBe(recipient);
      expect(res.recipients[0].amount).toBe(amount);
      expect(res.tokenContract).toBe(unknownToken);
      expect(res.tokenSymbol).toBeUndefined();
      expect(res.tokenDecimals).toBeUndefined();
    });

    it('should resolve imported token metadata', () => {
      const customToken = '0x4444444444444444444444444444444444444444';
      const recipient = '0x2222222222222222222222222222222222222222';
      const sender = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const amount = '50000000';

      const innerTransfer = encodeErc20Transfer(recipient, amount);
      const callData = encodeExecute(customToken, '0', innerTransfer);
      const rawTx = buildUserOp({ sender, callData });

      const res = decodeVaultTransaction(
        rawTx,
        'eth',
        [],
        [
          {
            symbol: 'CUSTOM',
            name: 'Custom Token',
            contract: customToken,
            decimals: 8,
            chain: 'eth',
          },
        ],
      );

      expect(res.error).toBeUndefined();
      expect(res.recipients[0].address).toBe(recipient);
      expect(res.recipients[0].amount).toBe(amount);
      expect(res.tokenContract).toBe(customToken);
      expect(res.tokenSymbol).toBe('CUSTOM');
      expect(res.tokenDecimals).toBe(8);
    });

    it('should handle non-standard contract call (not ERC-20 transfer)', () => {
      const contractAddr = '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd';
      const sender = '0x1234123412341234123412341234123412341234';
      const callData = encodeExecute(contractAddr, '0', '0xdeadbeef');
      const rawTx = buildUserOp({ sender, callData });

      const res = decodeVaultTransaction(rawTx, 'eth');

      expect(res.error).toBeUndefined();
      expect(res.sender).toBe(sender);
      expect(res.recipients).toHaveLength(1);
      expect(res.recipients[0].address.toLowerCase()).toBe(contractAddr);
      expect(res.recipients[0].amount).toBe('0');
      expect(res.tokenContract?.toLowerCase()).toBe(contractAddr);
    });
  });

  // ─── Vault decode: EVM fee calculation ───────────────────────────────────

  describe('decodeVaultTransaction — EVM fee calculation', () => {
    it('fee = totalGas * totalMaxFeePerGas (exact math)', () => {
      const callData = encodeExecute(
        '0x0000000000000000000000000000000000000001',
        '1',
      );

      const rawTx = buildUserOp({
        sender: '0x0000000000000000000000000000000000000001',
        callData,
        callGasLimit: '0x1',
        verificationGasLimit: '0x2',
        preVerificationGas: '0x3',
        maxFeePerGas: '0xA',
        maxPriorityFeePerGas: '0x5',
      });

      const res = decodeVaultTransaction(rawTx, 'sepolia');
      expect(res.fee).toBe('90');
    });

    it('fee with large gas values does not lose precision', () => {
      const callData = encodeExecute(
        '0x0000000000000000000000000000000000000001',
        '1',
      );

      const rawTx = buildUserOp({
        sender: '0x0000000000000000000000000000000000000001',
        callData,
        callGasLimit: '0xF4240',
        verificationGasLimit: '0xF4240',
        preVerificationGas: '0xF4240',
        maxFeePerGas: '0x2540BE400',
        maxPriorityFeePerGas: '0x12A05F200',
      });

      const res = decodeVaultTransaction(rawTx, 'eth');
      expect(res.fee).toBe('45000000000000000');
    });
  });

  // ─── Vault decode: error handling ────────────────────────────────────────

  describe('decodeVaultTransaction — error handling', () => {
    it('empty JSON on EVM chain', () => {
      const res = decodeVaultTransaction('{}', 'sepolia');
      expect(res.error).toBe(
        'Invalid transaction format: missing userOpRequest',
      );
      expect(res.sender).toBe('');
      expect(res.recipients).toEqual([]);
      expect(res.fee).toBe('0');
    });

    it('non-JSON string on EVM chain', () => {
      const res = decodeVaultTransaction('not json at all', 'sepolia');
      expect(res.error).toBeDefined();
    });

    it('invalid UTXO hex', () => {
      const res = decodeVaultTransaction('deadbeef', 'flux', []);
      expect(res.error).toBeDefined();
      expect(res.sender).toBe('');
      expect(res.recipients).toEqual([]);
    });

    it('empty string on UTXO chain', () => {
      const res = decodeVaultTransaction('', 'flux', []);
      expect(res.error).toBeDefined();
    });

    it('EVM JSON passed to UTXO chain', () => {
      const res = decodeVaultTransaction(rawTxSepolia, 'flux', []);
      expect(res.error).toBeDefined();
    });

    it('UTXO hex passed to EVM chain', () => {
      const res = decodeVaultTransaction(rawTxFlux, 'sepolia');
      expect(res.error).toBeDefined();
    });

    it('UserOp with invalid callData (not execute())', () => {
      const rawTx = buildUserOp({
        sender: '0x0000000000000000000000000000000000000001',
        callData: '0xdeadbeef',
      });
      const res = decodeVaultTransaction(rawTx, 'sepolia');
      expect(res.error).toBeDefined();
    });

    it('error result always has consistent shape', () => {
      const res = decodeVaultTransaction('garbage data', 'flux', []);
      expect(res).toHaveProperty('sender', '');
      expect(res).toHaveProperty('recipients');
      expect(res).toHaveProperty('fee', '0');
      expect(res).toHaveProperty('error');
      expect(Array.isArray(res.recipients)).toBe(true);
      expect(res.recipients).toHaveLength(0);
    });
  });
});
