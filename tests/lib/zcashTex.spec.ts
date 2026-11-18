// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
/**
 * Zcash TEX addresses (ZIP 320): Bech32m re-encoding of a P2PKH key hash.
 * Sending to one must validate and must pay exactly the P2PKH script of the
 * decoded key hash. Fully offline.
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
  decodeBech32m,
  decodeTexKeyHash,
  texToTransparentAddress,
} from '../../src/lib/zcashTex';
import {
  isValidUtxoAddress,
  validateReceiverAddress,
} from '../../src/lib/addressValidation';
import { buildUnsignedRawTx, signTransaction } from '../../src/lib/constructTx';
import { decodeTransactionForApproval } from '../../src/lib/transactions';

// The example in ZIP 320 itself ("Reference implementation" section).
const ZIP320_T1 = 't1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yC';
const ZIP320_TEX = 'tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte';
const ZIP320_KEY_HASH = '8286bf790866805397e3a947640b77a43f0b43a5';

// Same key hash, other encodings / networks (generated offline, cross-checked
// against @scure/base bech32m and utxo-lib).
const TESTNET_TEX = 'textest1s2rt77ggv6q989lr49rkgzmh5slsksa90ej7wz';
const TESTNET_TM = 'tmMcWbZU8t39htCR1fQRfRSHtkW4p3Ax5Se';
// Bech32 (BIP-173) checksum instead of Bech32m — ZIP 320 forbids it.
const TEX_WITH_BECH32_CHECKSUM = 'tex1s2rt77ggv6q989lr49rkgzmh5slsksa9rtaywm';
// Valid Bech32m, wrong payload length.
const TEX_32_BYTES =
  'tex1qurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qursd9am6a';
const TEX_19_BYTES = 'tex1s2rt77ggv6q989lr49rkgzmh5slskscxv8q42';

const zecNetwork = utxolib.networks.zcash;

describe('Bech32m decoding (BIP-350 test vectors)', () => {
  it.each([
    'A1LQFN3A',
    'a1lqfn3a',
    'an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6',
    'abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx',
    '11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8',
    'split1checkupstagehandshakeupstreamerranterredcaperredlc445v',
    '?1v759aa',
  ])('accepts valid %s', (input) => {
    expect(decodeBech32m(input)).not.toBeNull();
  });

  it.each([
    '\x201xj0phk', // HRP character out of range
    '\x7f1g6xzxy', // HRP character out of range
    '\x801vctc34', // HRP character out of range
    'an84characterslonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11d6pts4', // too long
    'qyrz8wqd2c9m', // no separator
    '1qyrz8wqd2c9m', // empty HRP
    'y1b0jsk6g', // invalid data character
    'lt1igcx5c0', // invalid data character
    'in1muywd', // too short checksum
    'mm1crxm3i', // invalid character in checksum
    'au1s5cgom', // invalid character in checksum
    'M1VUXWEZ', // checksum calculated with uppercase HRP
    '16plkw9', // empty HRP
    '1p2gdwpf', // empty HRP
    'A1lqfn3a', // mixed case
  ])('rejects invalid %j', (input) => {
    expect(decodeBech32m(input)).toBeNull();
  });
});

describe('Zcash TEX addresses (ZIP 320)', () => {
  it('decodes the ZIP 320 example to its key hash and t1 address', () => {
    expect(
      Buffer.from(decodeTexKeyHash(ZIP320_TEX, 'zcash')).toString('hex'),
    ).toBe(ZIP320_KEY_HASH);
    expect(texToTransparentAddress(ZIP320_TEX, 'zcash')).toBe(ZIP320_T1);
  });

  it('accepts an all-uppercase TEX address and surrounding whitespace', () => {
    expect(texToTransparentAddress(ZIP320_TEX.toUpperCase(), 'zcash')).toBe(
      ZIP320_T1,
    );
    expect(texToTransparentAddress(`  ${ZIP320_TEX}\n`, 'zcash')).toBe(
      ZIP320_T1,
    );
  });

  it('resolves testnet TEX (textest) only on zcash testnet', () => {
    expect(texToTransparentAddress(TESTNET_TEX, 'zcashTest')).toBe(TESTNET_TM);
    expect(texToTransparentAddress(TESTNET_TEX, 'zcash')).toBeNull();
    expect(texToTransparentAddress(ZIP320_TEX, 'zcashTest')).toBeNull();
  });

  it('is zcash-only', () => {
    for (const libid of ['bitcoin', 'litecoin', 'flux', 'bitcoincash']) {
      expect(texToTransparentAddress(ZIP320_TEX, libid)).toBeNull();
    }
  });

  it('rejects a Bech32 (not Bech32m) checksum, a corrupted checksum and wrong lengths', () => {
    expect(
      texToTransparentAddress(TEX_WITH_BECH32_CHECKSUM, 'zcash'),
    ).toBeNull();
    expect(
      texToTransparentAddress(ZIP320_TEX.slice(0, -1) + 'q', 'zcash'),
    ).toBeNull();
    expect(texToTransparentAddress(TEX_32_BYTES, 'zcash')).toBeNull();
    expect(texToTransparentAddress(TEX_19_BYTES, 'zcash')).toBeNull();
    expect(texToTransparentAddress('A1LQFN3A', 'zcash')).toBeNull();
  });

  it('leaves non-TEX addresses alone', () => {
    expect(texToTransparentAddress(ZIP320_T1, 'zcash')).toBeNull();
    expect(
      texToTransparentAddress('t3WTnCGUB3Gxaq7v17mnWzPz5J3Gi8q95vs', 'zcash'),
    ).toBeNull();
    expect(texToTransparentAddress('', 'zcash')).toBeNull();
  });
});

describe('receiver validation accepts TEX on ZEC', () => {
  it('validates the ZIP 320 TEX address for zec', () => {
    expect(isValidUtxoAddress(ZIP320_TEX, 'zec')).toBe(true);
    expect(validateReceiverAddress(ZIP320_TEX, 'zec')).toEqual({ valid: true });
    // THORChain's ZEC inbound address on 2026-11-18 (from the report).
    expect(
      validateReceiverAddress(
        'tex1dr0ssmsgglm66nx2k2sfhz8mxy7rmvzuwl3w4l',
        'zec',
      ).valid,
    ).toBe(true);
  });

  it('still rejects malformed TEX and TEX on other chains', () => {
    expect(validateReceiverAddress(TEX_WITH_BECH32_CHECKSUM, 'zec').valid).toBe(
      false,
    );
    expect(validateReceiverAddress(TEX_32_BYTES, 'zec').valid).toBe(false);
    expect(validateReceiverAddress(ZIP320_TEX, 'btc').valid).toBe(false);
    expect(validateReceiverAddress(ZIP320_TEX, 'flux').valid).toBe(false);
  });

  it('keeps accepting regular t1/t3 addresses', () => {
    expect(validateReceiverAddress(ZIP320_T1, 'zec').valid).toBe(true);
    expect(
      validateReceiverAddress('t3WTnCGUB3Gxaq7v17mnWzPz5J3Gi8q95vs', 'zec')
        .valid,
    ).toBe(true);
  });
});

describe('sending ZEC to a TEX address', () => {
  const keyA = utxolib.ECPair.makeRandom({
    network: zecNetwork,
    rng: () => Buffer.alloc(32, 0x11),
  });
  const keyB = utxolib.ECPair.makeRandom({
    network: zecNetwork,
    rng: () => Buffer.alloc(32, 0x22),
  });
  const redeemScript = utxolib.script.multisig.output.encode(
    2,
    [keyA.getPublicKeyBuffer(), keyB.getPublicKeyBuffer()].sort(Buffer.compare),
  );
  const sender = utxolib.address.fromOutputScript(
    utxolib.script.scriptHash.output.encode(
      utxolib.crypto.hash160(redeemScript),
    ),
    zecNetwork,
  );
  const utxo = {
    txid: '9649b8ddc0e69237606bea21b886696bb90d7fa2afca1f318490054e69c5af2f',
    vout: 1,
    scriptPubKey: '',
    satoshis: '60000000',
    confirmations: 200,
    coinbase: false,
  };
  const build = (receiver: string) =>
    buildUnsignedRawTx(
      'zec',
      [utxo],
      receiver,
      '50000000',
      '20000',
      sender,
      '',
      '10000000',
      false,
      3600000,
    );

  it('pays the P2PKH script of the TEX key hash — identical to sending to its t1 form', () => {
    const viaTex = build(ZIP320_TEX);
    expect(viaTex).toBe(build(ZIP320_T1));

    const tx = utxolib.Transaction.fromHex(viaTex, zecNetwork);
    expect(Buffer.from(tx.outs[0].script).toString('hex')).toBe(
      `76a914${ZIP320_KEY_HASH}88ac`,
    );
    expect(tx.outs[0].value).toBe(50000000);
    // every input is a transparent UTXO (ZIP 320 sender requirement)
    expect(tx.ins).toHaveLength(1);
  });

  it('SSP Key decodes the output as the t1 form of the TEX address', () => {
    const signed = signTransaction(
      build(ZIP320_TEX),
      'zec',
      keyA.toWIF(),
      redeemScript.toString('hex'),
      '',
      [utxo],
    );
    const decoded = decodeTransactionForApproval(signed, 'zec');
    expect(decoded.receiver).toBe(ZIP320_T1);
    expect(decoded.receiver).toBe(texToTransparentAddress(ZIP320_TEX, 'zcash'));
  });
});
