/**
 * UTXO-5: independent verification of input amounts for chains whose legacy
 * sighash does NOT commit to the amount being spent (DOGE, RVN).
 *
 * On those chains a signature over a transaction stays valid whatever amount
 * the signer believed each input carried, so a lying chain backend (consumer
 * sends) or relay (enterprise vault proposals) can under-report an input and
 * turn the difference into a silent miner fee. The hardware-wallet
 * "non-segwit input" rule closes that: for every input, fetch the FULL
 * previous transaction, check that its double-SHA256 equals the txid being
 * spent, and read `outs[vout].value` locally. Only those verified values may
 * feed the fee computation, the absurd-fee check and the display.
 *
 * Fails closed: any fetch/parse/hash/amount discrepancy throws.
 */
import axios from 'axios';
import utxolib from '@runonflux/utxo-lib';
import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';
import type { cryptos } from '../types';

export interface UtxoInputRef {
  txid: string;
  vout: number;
  /** Amount (base units) claimed by the backend / relay, if any. */
  satoshis?: string | number;
}

export type FetchRawTxHex = (
  txid: string,
  chain: keyof cryptos,
) => Promise<string>;

/**
 * True for UTXO chains whose signature hash omits the input amounts:
 * legacy (non-BIP143) P2SH chains without the BCH forkid and without the
 * Zcash/Flux ZIP-243 (tx version >= 4) sighash. Today: doge and rvn.
 */
export function sighashOmitsInputAmounts(chain: keyof cryptos): boolean {
  const config = blockchains[chain];
  if (!config) return false;
  if (config.chainType === 'evm' || config.chainType === 'sol') return false;
  if (config.scriptType === 'p2wsh') return false; // BIP143 commits amounts
  if (config.hashType) return false; // BCH SIGHASH_FORKID (BIP143-style)
  if (config.txVersion && config.txVersion >= 4) return false; // ZIP-243
  return true;
}

const TXID_RE = /^[0-9a-fA-F]{64}$/;

/** Fetch the full serialized previous transaction from the chain backend. */
export async function fetchRawTransactionHex(
  txid: string,
  chain: keyof cryptos,
): Promise<string> {
  if (!TXID_RE.test(txid)) {
    throw new Error('Invalid txid');
  }
  const backendConfig = backends()[chain];
  if (blockchains[chain].backend === 'blockbook') {
    const { data } = await axios.get<{ hex?: unknown }>(
      `https://${backendConfig.node}/api/v2/tx/${txid}`,
      { timeout: 30000 },
    );
    if (data && typeof data.hex === 'string' && data.hex) {
      return data.hex;
    }
    const specific = await axios.get<{ hex?: unknown }>(
      `https://${backendConfig.node}/api/v2/tx-specific/${txid}`,
      { timeout: 30000 },
    );
    if (specific.data && typeof specific.data.hex === 'string') {
      return specific.data.hex;
    }
    throw new Error(`Backend returned no raw transaction for ${txid}`);
  }
  const { data } = await axios.get<{ rawtx?: unknown }>(
    `https://${backendConfig.node}/api/rawtx/${txid}`,
    { timeout: 30000 },
  );
  if (data && typeof data.rawtx === 'string' && data.rawtx) {
    return data.rawtx;
  }
  throw new Error(`Backend returned no raw transaction for ${txid}`);
}

/**
 * Parse `rawHex`, require hash256(rawHex) == txid, and return the value of
 * output `vout` in base units (as a decimal string).
 */
export function verifiedOutputValue(
  rawHex: string,
  txid: string,
  vout: number,
  chain: keyof cryptos,
): string {
  if (typeof rawHex !== 'string' || !/^([0-9a-fA-F]{2})+$/.test(rawHex)) {
    throw new Error(`Previous transaction ${txid} is not valid hex`);
  }
  const network = utxolib.networks[blockchains[chain].libid];
  // The ambient utxolib typings omit getId/outs; both exist on Transaction.
  const tx = utxolib.Transaction.fromHex(rawHex, network) as unknown as {
    getId(): string;
    outs: Array<{ value: number }>;
  };
  // getId() = byte-reversed double-SHA256 of the serialization: the txid.
  if (tx.getId().toLowerCase() !== txid.toLowerCase()) {
    throw new Error(
      `Previous transaction does not hash to ${txid} — backend data rejected`,
    );
  }
  if (!Number.isInteger(vout) || vout < 0 || vout >= tx.outs.length) {
    throw new Error(`Output ${txid}:${vout} does not exist`);
  }
  const value = tx.outs[vout].value;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Output ${txid}:${vout} has an invalid value`);
  }
  return String(value);
}

/**
 * Verify every input's amount from its previous transaction. Returns a map
 * `txid:vout -> verified base-unit amount`. Throws when any claimed amount
 * differs from the verified one (the backend/relay lied) or when any input
 * cannot be verified.
 */
export async function verifyUtxoInputValues(
  chain: keyof cryptos,
  inputs: UtxoInputRef[],
  fetchHex: FetchRawTxHex = fetchRawTransactionHex,
): Promise<Map<string, string>> {
  const verified = new Map<string, string>();
  const hexCache = new Map<string, string>();
  for (const input of inputs) {
    const txid = String(input.txid).toLowerCase();
    if (!TXID_RE.test(txid)) {
      throw new Error('Invalid input txid');
    }
    let rawHex = hexCache.get(txid);
    if (rawHex === undefined) {
      rawHex = await fetchHex(txid, chain);
      hexCache.set(txid, rawHex);
    }
    const value = verifiedOutputValue(rawHex, txid, input.vout, chain);
    if (input.satoshis !== undefined && input.satoshis !== null) {
      const claimed = String(input.satoshis);
      if (!/^\d+$/.test(claimed) || BigInt(claimed) !== BigInt(value)) {
        throw new Error(
          `Input ${txid}:${input.vout} amount ${claimed} does not match the verified amount ${value} — refusing to sign`,
        );
      }
    }
    verified.set(`${txid}:${input.vout}`, value);
  }
  return verified;
}
