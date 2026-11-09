// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
/**
 * Zcash NU7: ZEC is built and signed as v5 (ZIP 225 / ZIP 244) with the NU7
 * consensus branch id; Flux stays v4. Fully offline.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  },
}));

import utxolib from '@runonflux/utxo-lib';
import {
  buildUnsignedRawTx,
  signTransaction,
  getSizeOfRawTransaction,
} from '../../src/lib/constructTx';
import {
  decodeTransactionForApproval,
  decodeVaultTransaction,
} from '../../src/lib/transactions';
import {
  applyZcashV5Prevouts,
  assertChainTxVersion,
  spentScriptPubKey,
} from '../../src/lib/zcashV5';
import { blockchains } from '../../src/storage/blockchains';

const zecNetwork = utxolib.networks.zcash;
const fluxNetwork = utxolib.networks.flux;
const SIGHASH_ALL = utxolib.Transaction.SIGHASH_ALL;

// version 5 | overwintered, versionGroupId 0x26A7270A, branch id 0x77190AD9
const ZEC_V5_HEADER = '050000800a27a726d90a1977';
const FLUX_V4_HEADER = '0400008085202f89';

// Deterministic private keys 0x11..11, 0x22..22, ...
const WIFS = [0x11, 0x22, 0x33, 0x44];

function keyFrom(seedByte, network) {
  return utxolib.ECPair.makeRandom({
    network,
    rng: () => Buffer.alloc(32, seedByte),
  });
}

function multisig(network, seedA, seedB) {
  const keyA = keyFrom(seedA, network);
  const keyB = keyFrom(seedB, network);
  const redeemScript = utxolib.script.multisig.output.encode(
    2,
    [keyA.getPublicKeyBuffer(), keyB.getPublicKeyBuffer()].sort(Buffer.compare),
  );
  const scriptPubKey = utxolib.script.scriptHash.output.encode(
    utxolib.crypto.hash160(redeemScript),
  );
  return {
    keyA,
    keyB,
    redeemScript,
    scriptPubKey,
    address: utxolib.address.fromOutputScript(scriptPubKey, network),
  };
}

const zecMs = multisig(zecNetwork, WIFS[0], WIFS[1]);
const zecRecipient = multisig(zecNetwork, WIFS[2], WIFS[3]).address;

const utxoA = {
  txid: '9649b8ddc0e69237606bea21b886696bb90d7fa2afca1f318490054e69c5af2f',
  vout: 1,
  scriptPubKey: '',
  satoshis: '60000000',
  confirmations: 200,
  coinbase: false,
};
const utxoB = {
  txid: '1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a7988',
  vout: 0,
  scriptPubKey: '',
  satoshis: '50000000',
  confirmations: 200,
  coinbase: false,
};

/** First real signature in input `vin`'s scriptSig (skips OP_0 placeholders). */
function firstSig(tx, vin) {
  const chunks = utxolib.script.decompile(tx.ins[vin].script);
  return chunks.slice(1, -1).find((c) => Buffer.isBuffer(c) && c.length);
}

/** Every non-empty signature in input `vin` must verify under ZIP 244. */
function verifyInputSignatures(txHex, network, prevouts, vin, keys) {
  const tx = utxolib.Transaction.fromHex(txHex, network);
  tx.setZip244Prevouts(prevouts);
  const chunks = utxolib.script.decompile(tx.ins[vin].script);
  const sigs = chunks
    .slice(1, -1)
    .filter((c) => Buffer.isBuffer(c) && c.length);
  expect(sigs.length).toBeGreaterThan(0);
  for (const sig of sigs) {
    const { signature, hashType } =
      utxolib.ECSignature.parseScriptSignature(sig);
    expect(hashType).toBe(SIGHASH_ALL);
    // the script argument is ignored for v5
    const hash = tx.hashForZcashSignature(
      vin,
      Buffer.alloc(0),
      prevouts[vin].value,
      hashType,
    );
    expect(keys.some((k) => k.verify(hash, signature))).toBe(true);
  }
  return sigs.length;
}

describe('Zcash NU7 v5 transactions', () => {
  it('ZEC is configured for v5, Flux stays v4', () => {
    expect(blockchains.zec.txVersion).toBe(5);
    expect(blockchains.zec.txGroupID).toBe(0x26a7270a);
    expect(blockchains.zec.txExpiryHeight).toBe(144);
    expect(blockchains.flux.txVersion).toBe(4);
    expect(blockchains.flux.txGroupID).toBe(0x892f2085);
    expect(blockchains.fluxTestnet.txVersion).toBe(4);
    expect(blockchains.fluxTestnet.txGroupID).toBe(0x892f2085);
    expect(zecNetwork.consensusBranchId[5]).toBe(0x77190ad9);
  });

  it('builds an unsigned ZEC tx as v5 with the NU7 branch id', () => {
    const raw = buildUnsignedRawTx(
      'zec',
      [utxoA, utxoB],
      zecRecipient,
      '70000000',
      '20000',
      zecMs.address,
      'memo',
      '10000000',
      false,
      3600000,
    );
    expect(raw.startsWith(ZEC_V5_HEADER)).toBe(true);
    const tx = utxolib.Transaction.fromHex(raw, zecNetwork);
    expect(tx.version).toBe(5);
    expect(tx.versionGroupId).toBe(0x26a7270a);
    expect(tx.consensusBranchId).toBe(0x77190ad9);
    expect(tx.expiryHeight).toBe(3600000);
    expect(tx.ins.length).toBe(2);
    // 2 recipients + OP_RETURN
    expect(tx.outs.length).toBe(3);
    expect(tx.toHex()).toBe(raw);
  });

  it('wallet signs every input of a ZEC v5 tx, Key co-signs, all signatures verify (ZIP 244)', () => {
    const raw = buildUnsignedRawTx(
      'zec',
      [utxoA, utxoB],
      zecRecipient,
      '70000000',
      '20000',
      zecMs.address,
      '',
      '10000000',
      false,
      3600000,
    );
    const signed = signTransaction(
      raw,
      'zec',
      zecMs.keyA.toWIF(),
      zecMs.redeemScript.toString('hex'),
      '',
      [utxoB, utxoA], // order of the utxo list does not matter
    );
    expect(signed.startsWith(ZEC_V5_HEADER)).toBe(true);
    expect(signed).toContain(zecMs.redeemScript.toString('hex'));

    const prevouts = [
      { value: 60000000, script: zecMs.scriptPubKey },
      { value: 50000000, script: zecMs.scriptPubKey },
    ];
    for (let vin = 0; vin < 2; vin++) {
      expect(
        verifyInputSignatures(signed, zecNetwork, prevouts, vin, [zecMs.keyA]),
      ).toBe(1);
    }

    // A signature commits to the value of the OTHER inputs too.
    const tx = utxolib.Transaction.fromHex(signed, zecNetwork);
    tx.setZip244Prevouts([prevouts[0], { ...prevouts[1], value: 50000001 }]);
    const sig0 = utxolib.ECSignature.parseScriptSignature(firstSig(tx, 0));
    const tamperedHash = tx.hashForZcashSignature(
      0,
      Buffer.alloc(0),
      60000000,
      SIGHASH_ALL,
    );
    expect(zecMs.keyA.verify(tamperedHash, sig0.signature)).toBe(false);

    // What SSP Key does: re-parse, give the same prevouts, add 2nd signature.
    const txb = utxolib.TransactionBuilder.fromTransaction(
      utxolib.Transaction.fromHex(signed, zecNetwork),
      zecNetwork,
    );
    txb.setPrevouts(prevouts);
    txb.sign(0, zecMs.keyB, zecMs.redeemScript, SIGHASH_ALL, 60000000);
    txb.sign(1, zecMs.keyB, zecMs.redeemScript, SIGHASH_ALL, 50000000);
    const final = txb.build().toHex();
    expect(final.startsWith(ZEC_V5_HEADER)).toBe(true);
    for (let vin = 0; vin < 2; vin++) {
      expect(
        verifyInputSignatures(final, zecNetwork, prevouts, vin, [
          zecMs.keyA,
          zecMs.keyB,
        ]),
      ).toBe(2);
    }
  });

  it('refuses to sign when a utxo value is missing', () => {
    const raw = buildUnsignedRawTx(
      'zec',
      [utxoA, utxoB],
      zecRecipient,
      '70000000',
      '20000',
      zecMs.address,
      '',
      '10000000',
      false,
      3600000,
    );
    expect(() =>
      signTransaction(
        raw,
        'zec',
        zecMs.keyA.toWIF(),
        zecMs.redeemScript.toString('hex'),
        '',
        [utxoA],
      ),
    ).toThrow(/Could not find value/);
  });

  it('refuses to sign a ZEC v4 transaction (invalid since NU7)', () => {
    const txb = new utxolib.TransactionBuilder(zecNetwork);
    txb.setVersion(4);
    txb.setVersionGroupId(0x892f2085);
    txb.setExpiryHeight(3600000);
    txb.addInput(utxoA.txid, utxoA.vout);
    txb.addOutput(zecRecipient, 59980000);
    const v4 = txb.buildIncomplete().toHex();
    expect(() =>
      signTransaction(
        v4,
        'zec',
        zecMs.keyA.toWIF(),
        zecMs.redeemScript.toString('hex'),
        '',
        [utxoA],
      ),
    ).toThrow(/must be version 5/);
  });

  it('size of a signed ZEC v5 tx is measured from its v5 serialization', () => {
    const raw = buildUnsignedRawTx(
      'zec',
      [utxoA],
      zecRecipient,
      '50000000',
      '20000',
      zecMs.address,
      '',
      '10000000',
      false,
      3600000,
    );
    const signed = signTransaction(
      raw,
      'zec',
      zecMs.keyA.toWIF(),
      zecMs.redeemScript.toString('hex'),
      '',
      [utxoA],
    );
    expect(getSizeOfRawTransaction(raw, 'zec')).toBe(raw.length / 2);
    expect(getSizeOfRawTransaction(signed, 'zec')).toBe(signed.length / 2);
  });

  it('decodes a partially signed ZEC v5 tx for approval and vault display', () => {
    const raw = buildUnsignedRawTx(
      'zec',
      [utxoA],
      zecRecipient,
      '50000000',
      '20000',
      zecMs.address,
      '',
      '10000000',
      false,
      3600000,
    );
    const signed = signTransaction(
      raw,
      'zec',
      zecMs.keyA.toWIF(),
      zecMs.redeemScript.toString('hex'),
      '',
      [utxoA],
    );
    const decoded = decodeTransactionForApproval(signed, 'zec');
    expect(decoded.sender).toBe(zecMs.address);
    expect(decoded.receiver).toBe(zecRecipient);
    expect(decoded.amount).toBe('0.5');

    const vault = decodeVaultTransaction(raw, 'zec', ['60000000'], [], {
      redeemScript: zecMs.redeemScript.toString('hex'),
    });
    expect(vault.error).toBeUndefined();
    expect(vault.sender).toBe(zecMs.address);
  });

  it('enterprise: inputs from different vault addresses get their own scriptPubKey', () => {
    // Two vault addresses (different redeem scripts), one input each — the
    // same per-input prevout sourcing EnterpriseVaultSignTx uses.
    const addr0 = zecMs;
    const addr1 = multisig(zecNetwork, WIFS[2], WIFS[3]);
    const txb = new utxolib.TransactionBuilder(zecNetwork);
    txb.setVersion(blockchains.zec.txVersion);
    txb.setVersionGroupId(blockchains.zec.txGroupID);
    txb.setExpiryHeight(3600000);
    txb.addInput(utxoA.txid, utxoA.vout);
    txb.addInput(utxoB.txid, utxoB.vout);
    txb.addOutput(zecRecipient, 109980000);
    const unsigned = txb.buildIncomplete().toHex();
    expect(unsigned.startsWith(ZEC_V5_HEADER)).toBe(true);

    const inputDetails = [
      {
        addressIndex: 0,
        amount: '60000000',
        redeemScript: addr0.redeemScript.toString('hex'),
      },
      {
        addressIndex: 1,
        amount: '50000000',
        redeemScript: addr1.redeemScript.toString('hex'),
      },
    ];
    const keysByInput = [addr0.keyA, addr1.keyA];

    const signer = utxolib.TransactionBuilder.fromTransaction(
      utxolib.Transaction.fromHex(unsigned, zecNetwork),
      zecNetwork,
    );
    assertChainTxVersion('zec', signer.tx);
    applyZcashV5Prevouts(
      signer,
      inputDetails.map((d) => ({
        value: Number(d.amount),
        redeemScript: Buffer.from(d.redeemScript, 'hex'),
      })),
    );
    inputDetails.forEach((d, i) =>
      signer.sign(
        i,
        keysByInput[i],
        Buffer.from(d.redeemScript, 'hex'),
        SIGHASH_ALL,
        Number(d.amount),
      ),
    );
    const partial = signer.buildIncomplete().toHex();

    const prevouts = [
      { value: 60000000, script: addr0.scriptPubKey },
      { value: 50000000, script: addr1.scriptPubKey },
    ];
    expect(
      spentScriptPubKey(addr1.redeemScript).equals(addr1.scriptPubKey),
    ).toBe(true);
    verifyInputSignatures(partial, zecNetwork, prevouts, 0, [addr0.keyA]);
    verifyInputSignatures(partial, zecNetwork, prevouts, 1, [addr1.keyA]);
  });

  it('enterprise: a wrong amount in the input details is refused before signing', () => {
    const txb = new utxolib.TransactionBuilder(zecNetwork);
    txb.setVersion(5);
    txb.setExpiryHeight(3600000);
    txb.addInput(utxoA.txid, utxoA.vout);
    txb.addOutput(zecRecipient, 59980000);
    const signer = utxolib.TransactionBuilder.fromTransaction(
      utxolib.Transaction.fromHex(txb.buildIncomplete().toHex(), zecNetwork),
      zecNetwork,
    );
    expect(() =>
      applyZcashV5Prevouts(signer, [
        { value: 0, redeemScript: zecMs.redeemScript },
      ]),
    ).toThrow(/no valid amount/);
    expect(() => applyZcashV5Prevouts(signer, [])).toThrow(/Expected 1/);
    // sign() itself refuses a value that disagrees with the prevouts
    applyZcashV5Prevouts(signer, [
      { value: 60000000, redeemScript: zecMs.redeemScript },
    ]);
    expect(() =>
      signer.sign(0, zecMs.keyA, zecMs.redeemScript, SIGHASH_ALL, 60000001),
    ).toThrow(/value does not match/);
  });

  it('Flux still builds and signs v4 (no prevouts needed)', () => {
    const fluxMs = multisig(fluxNetwork, WIFS[0], WIFS[1]);
    const fluxUtxo = {
      ...utxoA,
      scriptPubKey: fluxMs.scriptPubKey.toString('hex'),
    };
    const raw = buildUnsignedRawTx(
      'flux',
      [fluxUtxo],
      fluxMs.address,
      '50000000',
      '10000',
      fluxMs.address,
      '',
      '1000000000',
      false,
      1500030,
    );
    expect(raw.startsWith(FLUX_V4_HEADER)).toBe(true);
    const signed = signTransaction(
      raw,
      'flux',
      fluxMs.keyA.toWIF(),
      fluxMs.redeemScript.toString('hex'),
      '',
      [fluxUtxo],
    );
    expect(signed.startsWith(FLUX_V4_HEADER)).toBe(true);
    const tx = utxolib.Transaction.fromHex(signed, fluxNetwork);
    expect(tx.version).toBe(4);
    expect(tx.isZcashV5()).toBe(false);
    // the v4 (ZIP 243) signature verifies with the redeemScript
    const sig = utxolib.ECSignature.parseScriptSignature(firstSig(tx, 0));
    const hash = tx.hashForZcashSignature(
      0,
      fluxMs.redeemScript,
      60000000,
      SIGHASH_ALL,
    );
    expect(fluxMs.keyA.verify(hash, sig.signature)).toBe(true);
  });
});
