/**
 * Zcash NU7 (activated on mainnet 2026-11-05, block 3,543,405) made v4
 * transactions invalid (ZIP 2003): ZEC is sent as v5 transactions (ZIP 225
 * encoding, ZIP 244 signature digest).
 *
 * A ZIP 244 signature commits to the value AND scriptPubKey of the coin spent
 * by EVERY transparent input, not only the input being signed, so the
 * transaction builder must be given all of them (setPrevouts) before the
 * first sign() call. Flux keeps v4 and is not affected.
 */
import utxolib from '@runonflux/utxo-lib';
import type { txBuilder, TX } from '@runonflux/utxo-lib';
import { Buffer } from 'buffer';
import { blockchains } from '@storage/blockchains';
import type { cryptos } from '../types';

export const ZCASH_V5_VERSION = 5;
export const ZCASH_V5_VERSION_GROUP_ID = 0x26a7270a;

export interface ZcashV5Spend {
  /** Value of the spent coin in base units. */
  value: number;
  /** P2SH redeemScript of the spent coin (P2SH and P2SH-P2WSH). */
  redeemScript?: Buffer;
  /** Witness script of the spent coin (P2WSH and P2SH-P2WSH). */
  witnessScript?: Buffer;
}

/**
 * scriptPubKey of the coin spent with these scripts: the P2SH output script
 * when a redeemScript is present (never the redeemScript itself), otherwise
 * the P2WSH output script.
 */
export function spentScriptPubKey(
  redeemScript?: Buffer,
  witnessScript?: Buffer,
): Buffer {
  if (redeemScript && redeemScript.length) {
    return Buffer.from(
      utxolib.script.scriptHash.output.encode(
        utxolib.crypto.hash160(redeemScript),
      ),
    );
  }
  if (witnessScript && witnessScript.length) {
    return Buffer.from(
      utxolib.script.witnessScriptHash.output.encode(
        utxolib.crypto.sha256(witnessScript),
      ),
    );
  }
  throw new Error('Cannot derive the spent scriptPubKey without a script');
}

/** True when the transaction is a Zcash v5 (ZIP 225) transaction. */
export function isZcashV5Tx(tx: TX | txBuilder['tx']): boolean {
  return typeof tx.isZcashV5 === 'function' && tx.isZcashV5();
}

/**
 * Refuse to sign a transaction for a chain that requires v5 (ZEC since NU7)
 * when it is not v5: the network rejects it, so a signature over it is
 * useless at best.
 */
export function assertChainTxVersion(
  chain: keyof cryptos,
  tx: TX | txBuilder['tx'],
): void {
  const required = blockchains[chain]?.txVersion;
  if (required === ZCASH_V5_VERSION && tx.version !== ZCASH_V5_VERSION) {
    throw new Error(
      `${blockchains[chain].symbol} transactions must be version ${ZCASH_V5_VERSION} (got version ${tx.version})`,
    );
  }
}

/**
 * Give a Zcash v5 transaction builder the value and scriptPubKey of every
 * input (in input order) so ZIP 244 signature hashes can be computed. No-op
 * for any other transaction (Flux v4, BTC, ...).
 */
export function applyZcashV5Prevouts(
  txb: txBuilder,
  spends: ZcashV5Spend[],
): void {
  if (!isZcashV5Tx(txb.tx)) return;
  if (spends.length !== txb.tx.ins.length) {
    throw new Error(
      `Expected ${txb.tx.ins.length} input values and scripts, got ${spends.length}`,
    );
  }
  txb.setPrevouts(
    spends.map((spend, i) => {
      if (!Number.isSafeInteger(spend.value) || spend.value <= 0) {
        throw new Error(`Input ${i} has no valid amount`);
      }
      return {
        value: spend.value,
        script: spentScriptPubKey(spend.redeemScript, spend.witnessScript),
      };
    }),
  );
}
