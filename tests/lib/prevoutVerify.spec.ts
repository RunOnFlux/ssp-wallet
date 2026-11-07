// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
//
// UTXO-5 regression, built from
// ssp-security-review-2026-10-12/poc/poc_sighash_amounts.js: DOGE/RVN legacy
// signatures do not commit to input amounts, so a backend that under-reports
// an input turns the difference into a silent miner fee. The wallet now
// verifies every input amount from the hash-checked previous transaction.
import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import axios from 'axios';
import utxolib from '@runonflux/utxo-lib';
import wif from 'wif';

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}));

import {
  sighashOmitsInputAmounts,
  verifiedOutputValue,
  verifyUtxoInputValues,
} from '../../src/lib/prevoutVerify';
import { verifyPickedUtxoValues } from '../../src/lib/constructTx';
import { blockchains } from '@storage/blockchains';

const DOGE = utxolib.networks.dogecoin;

/** A previous DOGE transaction paying `value` to a P2SH output at vout 1. */
function prevTx(value: number) {
  const txb = new utxolib.TransactionBuilder(DOGE);
  txb.addInput(crypto.randomBytes(32).toString('hex'), 0);
  txb.addOutput(
    utxolib.script.scriptHash.output.encode(crypto.randomBytes(20)),
    1234,
  );
  txb.addOutput(
    utxolib.script.scriptHash.output.encode(crypto.randomBytes(20)),
    value,
  );
  const tx = txb.buildIncomplete();
  return { hex: tx.toHex(), txid: tx.getId() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sighashOmitsInputAmounts', () => {
  it('is true for exactly the legacy-sighash chains (doge, rvn)', () => {
    const flagged = Object.keys(blockchains).filter((c) =>
      sighashOmitsInputAmounts(c),
    );
    expect(flagged.sort()).toEqual(['doge', 'rvn']);
  });

  it('premise (PoC): a DOGE signature is identical for different claimed amounts', () => {
    const k = (s) =>
      utxolib.ECPair.fromWIF(
        wif.encode(
          DOGE.wif,
          crypto.createHash('sha256').update(s).digest(),
          true,
        ),
        DOGE,
      );
    const a = k('a');
    const b = k('b');
    const ms = utxolib.script.multisig.output.encode(
      2,
      [a.getPublicKeyBuffer(), b.getPublicKeyBuffer()].sort(Buffer.compare),
    );
    const sigFor = (amount) => {
      const txb = new utxolib.TransactionBuilder(DOGE);
      txb.addInput('11'.repeat(32), 0);
      txb.addOutput(
        utxolib.script.scriptHash.output.encode(utxolib.crypto.hash160(ms)),
        1000,
      );
      txb.sign(0, a, ms, 0x01, amount);
      return txb.inputs[0].signatures.find(Boolean).toString('hex');
    };
    expect(sigFor(1_000_000_000_000)).toBe(sigFor(500_000_000));
  });
});

describe('verifiedOutputValue', () => {
  it('reads the value of a hash-verified previous transaction', () => {
    const { hex, txid } = prevTx(1_000_000_000_000);
    expect(verifiedOutputValue(hex, txid, 1, 'doge')).toBe('1000000000000');
  });

  it('rejects hex that does not hash to the txid being spent', () => {
    const { hex } = prevTx(500);
    const other = prevTx(500);
    expect(() => verifiedOutputValue(hex, other.txid, 1, 'doge')).toThrow(
      /does not hash/,
    );
  });

  it('rejects a missing output and non-hex data', () => {
    const { hex, txid } = prevTx(500);
    expect(() => verifiedOutputValue(hex, txid, 5, 'doge')).toThrow(
      /does not exist/,
    );
    expect(() => verifiedOutputValue('zz', txid, 0, 'doge')).toThrow();
  });
});

describe('verifyUtxoInputValues', () => {
  it('PoC: a backend reporting a 10,000 DOGE input as 5 DOGE is refused', async () => {
    const { hex, txid } = prevTx(10_000 * 1e8);
    const fetchHex = vi.fn(async () => hex);
    await expect(
      verifyUtxoInputValues(
        'doge',
        [{ txid, vout: 1, satoshis: String(5 * 1e8) }],
        fetchHex,
      ),
    ).rejects.toThrow(/does not match the verified amount/);
  });

  it('returns verified values when the claims are honest (one fetch per txid)', async () => {
    const { hex, txid } = prevTx(777);
    const fetchHex = vi.fn(async () => hex);
    const res = await verifyUtxoInputValues(
      'doge',
      [
        { txid, vout: 1, satoshis: '777' },
        { txid, vout: 0, satoshis: '1234' },
      ],
      fetchHex,
    );
    expect(res.get(`${txid}:1`)).toBe('777');
    expect(res.get(`${txid}:0`)).toBe('1234');
    expect(fetchHex).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the backend cannot supply the previous transaction', async () => {
    const { txid } = prevTx(1);
    await expect(
      verifyUtxoInputValues('doge', [{ txid, vout: 1 }], async () => {
        throw new Error('backend down');
      }),
    ).rejects.toThrow(/backend down/);
  });
});

describe('verifyPickedUtxoValues (consumer construct path)', () => {
  it('uses verified values on doge and refuses a lying backend', async () => {
    const honest = prevTx(2_000_000);
    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { hex: honest.hex } });
    const picked = [
      {
        txid: honest.txid,
        vout: 1,
        scriptPubKey: '',
        satoshis: '2000000',
        confirmations: 3,
        coinbase: false,
      },
    ];
    const verified = await verifyPickedUtxoValues('doge', picked);
    expect(verified[0].satoshis).toBe('2000000');
    expect(getSpy.mock.calls[0][0]).toContain(`/api/v2/tx/${honest.txid}`);

    await expect(
      verifyPickedUtxoValues('doge', [{ ...picked[0], satoshis: '1000' }]),
    ).rejects.toThrow(/does not match/);
  });

  it('leaves amount-committing chains untouched (no network)', async () => {
    const getSpy = vi.spyOn(axios, 'get');
    const picked = [
      {
        txid: '11'.repeat(32),
        vout: 0,
        scriptPubKey: '',
        satoshis: '5',
        confirmations: 1,
        coinbase: false,
      },
    ];
    expect(await verifyPickedUtxoValues('btc', picked)).toBe(picked);
    expect(getSpy).not.toHaveBeenCalled();
  });
});
