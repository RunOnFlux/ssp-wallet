import utxolib from '@runonflux/utxo-lib';
import { Buffer } from 'buffer';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { toLegacyAddress } from 'bchaddrjs';
import {
  http as viemHttp,
  parseUnits,
  encodeFunctionData,
  erc20Abi,
} from 'viem';
import * as viemChains from 'viem/chains';
import * as accountAbstraction from '@runonflux/aa-schnorr-multisig-sdk';
import {
  getEntryPoint,
  createSmartAccountClient,
  deepHexlify,
  UserOperationRequest_v6,
} from '@alchemy/aa-core';
import {
  blockbookUtxo,
  utxo,
  blockbookBroadcastTxResult,
  broadcastTxResult,
  cryptos,
  txIdentifier,
  eth_evm,
} from '../types';

import { backends } from '@storage/backends';
import { blockchains, Token } from '@storage/blockchains';

import { LRUCache } from 'lru-cache';

import { getBlockheight } from './blockheight.ts';

const utxoCache = new LRUCache({
  max: 1000,
  ttl: 1 * 60 * 60 * 1000, // 1 hour, just as precaution here, not really needed
});

// SPL Memo v2 program — standard on Solana for attaching arbitrary UTF-8
// payloads to a tx, indexed by explorers and parsed by getTransaction.
const MEMO_PROGRAM_ID_BASE58 = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export function getLibId(chain: keyof cryptos): string {
  return blockchains[chain].libid;
}

type utxoCache = Record<string, utxo[]>;

let fetchUtxosRunning = false;

export function clearUtxoCache() {
  utxoCache.clear();
}

// on enter send section fetch this
export async function fetchUtxos(
  address: string,
  chain: string,
  confirmationMode = 0, // use confirmed utxos if replace by fee is wanted. unconfirmed if standard tx, both for ssp key for fetching all utxps
  onlyConfirmed = true, // must have > 0 confirmations
): Promise<utxo[]> {
  try {
    while (fetchUtxosRunning) {
      // wait if previous request is running
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const cachedUtxos = utxoCache.get(
      `${chain}_${address}_${confirmationMode}`,
    ); // "value"
    if (cachedUtxos) {
      // should always be cached when doing fee estimation, tx construction
      return cachedUtxos as utxo[];
    }
    fetchUtxosRunning = true;
    const backendConfig = backends()[chain];
    if (blockchains[chain].backend === 'blockbook') {
      if (confirmationMode === 1) {
        const url = `https://${backendConfig.node}/api/v2/utxo/${address}?confirmed=true`;
        const { data } = await axios.get<blockbookUtxo[]>(url);
        const fetchedUtxos = data.filter((x) =>
          onlyConfirmed ? x.confirmations > 0 : true,
        );
        const utxos = fetchedUtxos.map((x) => ({
          txid: x.txid,
          vout: x.vout,
          scriptPubKey: '', // that is fine, not needed
          satoshis: x.value,
          confirmations: x.confirmations,
          coinbase: x.coinbase || false,
        }));
        utxoCache.set(`${chain}_${address}_${confirmationMode}`, utxos);
        return utxos;
      } else if (confirmationMode === 2) {
        const url = `https://${backendConfig.node}/api/v2/utxo/${address}?confirmed=true`;
        const urlB = `https://${backendConfig.node}/api/v2/utxo/${address}`;
        const { data } = await axios.get<blockbookUtxo[]>(url);
        const responseB = await axios.get<blockbookUtxo[]>(urlB);
        const dataB = responseB.data.filter((x) =>
          onlyConfirmed ? x.confirmations > 0 : true,
        );
        const confirmedUtxos = data.filter((x) =>
          onlyConfirmed ? x.confirmations > 0 : true,
        );
        // Deduplicate: dataB may contain the same confirmed UTXOs
        const confirmedSet = new Set(
          confirmedUtxos.map((x) => `${x.txid}:${x.vout}`),
        );
        const unconfirmedOnly = dataB.filter(
          (x) => !confirmedSet.has(`${x.txid}:${x.vout}`),
        );
        const fetchedUtxos = confirmedUtxos.concat(unconfirmedOnly);
        const utxos = fetchedUtxos.map((x) => ({
          txid: x.txid,
          vout: x.vout,
          scriptPubKey: '', // that is fine, not needed
          satoshis: x.value,
          confirmations: x.confirmations,
          coinbase: x.coinbase || false,
        }));
        utxoCache.set(`${chain}_${address}_${confirmationMode}`, utxos);
        return utxos;
      } else {
        const url = `https://${backendConfig.node}/api/v2/utxo/${address}`;
        const { data } = await axios.get<blockbookUtxo[]>(url);
        const fetchedUtxos = data.filter((x) =>
          onlyConfirmed ? x.confirmations > 0 : true,
        );
        const utxos = fetchedUtxos.map((x) => ({
          txid: x.txid,
          vout: x.vout,
          scriptPubKey: '', // that is fine, not needed
          satoshis: x.value,
          confirmations: x.confirmations,
          coinbase: x.coinbase || false,
        }));
        utxoCache.set(`${chain}_${address}_${confirmationMode}`, utxos);
        return utxos;
      }
    } else {
      if (confirmationMode === 1) {
        const url = `https://${backendConfig.node}/api/addrs/${address}/unspent`;
        const { data } = await axios.get<utxo[]>(url);
        const fetchedUtxos = data.filter((x) =>
          onlyConfirmed ? x.confirmations > 0 : true,
        );
        const utxos = fetchedUtxos.map((x) => ({
          txid: x.txid,
          vout: x.vout,
          scriptPubKey: x.scriptPubKey,
          satoshis: x.satoshis.toString(),
          confirmations: x.confirmations,
          coinbase: x.coinbase || false,
        }));
        utxoCache.set(`${chain}_${address}_${confirmationMode}`, utxos);
        return utxos;
      } else if (confirmationMode === 2) {
        const url = `https://${backendConfig.node}/api/addrs/${address}/unspent`;
        const urlB = `https://${backendConfig.node}/api/addrs/${address}/utxo`;
        const { data } = await axios.get<utxo[]>(url);
        const responseB = await axios.get<utxo[]>(urlB);
        const dataB = responseB.data.filter((x) =>
          onlyConfirmed ? x.confirmations > 0 : true,
        );
        const confirmedUtxos = data.filter((x) =>
          onlyConfirmed ? x.confirmations > 0 : true,
        );
        // Deduplicate: dataB may contain the same confirmed UTXOs
        const confirmedSet = new Set(
          confirmedUtxos.map((x) => `${x.txid}:${x.vout}`),
        );
        const unconfirmedOnly = dataB.filter(
          (x) => !confirmedSet.has(`${x.txid}:${x.vout}`),
        );
        const fetchedUtxos = confirmedUtxos.concat(unconfirmedOnly);
        const utxos = fetchedUtxos.map((x) => ({
          txid: x.txid,
          vout: x.vout,
          scriptPubKey: x.scriptPubKey,
          satoshis: x.satoshis.toString(),
          confirmations: x.confirmations,
          coinbase: x.coinbase || false,
        }));
        utxoCache.set(`${chain}_${address}_${confirmationMode}`, utxos);
        return utxos;
      } else {
        const url = `https://${backendConfig.node}/api/addrs/${address}/utxo`;
        const { data } = await axios.get<utxo[]>(url);
        const fetchedUtxos = data.filter((x) =>
          onlyConfirmed ? x.confirmations > 0 : true,
        );
        const utxos = fetchedUtxos.map((x) => ({
          txid: x.txid,
          vout: x.vout,
          scriptPubKey: x.scriptPubKey,
          satoshis: x.satoshis.toString(),
          confirmations: x.confirmations,
          coinbase: x.coinbase || false,
        }));
        utxoCache.set(`${chain}_${address}_${confirmationMode}`, utxos);
        return utxos;
      }
    }
  } catch (e) {
    console.log(e);
    return [];
  } finally {
    fetchUtxosRunning = false;
  }
}

export function finaliseTransaction(
  rawTx: string,
  chain: keyof cryptos,
): string {
  try {
    const libID = getLibId(chain);
    const network = utxolib.networks[libID];
    const txhex = rawTx;
    const txb = utxolib.TransactionBuilder.fromTransaction(
      utxolib.Transaction.fromHex(txhex, network),
      network,
    );
    const tx = txb.build();
    const finalisedTx = tx.toHex();
    return finalisedTx;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

function getValueHexBuffer(hex: string) {
  const buf = Buffer.from(hex, 'hex').reverse();
  return buf.toString('hex');
}

export function signTransaction(
  rawTx: string,
  chain: keyof cryptos,
  privateKey: string,
  redeemScript: string,
  witnessScript: string,
  utxos: utxo[], // same or bi gger set than was used to construct the tx
): string {
  try {
    const libID = getLibId(chain);
    const network = utxolib.networks[libID];
    const txhex = rawTx;
    let hashType = utxolib.Transaction.SIGHASH_ALL;
    if (blockchains[chain].hashType) {
      // only for BCH
      hashType =
        utxolib.Transaction.SIGHASH_ALL |
        utxolib.Transaction.SIGHASH_BITCOINCASHBIP143;
    }
    const keyPair = utxolib.ECPair.fromWIF(privateKey, network);
    const txb = utxolib.TransactionBuilder.fromTransaction(
      utxolib.Transaction.fromHex(txhex, network),
      network,
    );
    for (let i = 0; i < txb.inputs.length; i += 1) {
      const hashHex = txb.tx.ins[i].hash.toString('hex');
      const hash = getValueHexBuffer(hashHex);
      const { index } = txb.tx.ins[i];
      const utxoFound = utxos.find((x) => x.txid === hash && x.vout === index);
      if (!utxoFound) {
        throw new Error(`Could not find value for input ${hash}:${index}`);
      }
      let redeemScriptForSign;
      let witnessScriptForSign;
      if (redeemScript) {
        redeemScriptForSign = Buffer.from(redeemScript, 'hex');
      }
      if (witnessScript) {
        witnessScriptForSign = Buffer.from(witnessScript, 'hex');
      }
      txb.sign(
        i,
        keyPair,
        redeemScriptForSign,
        hashType,
        new BigNumber(utxoFound.satoshis).toNumber(),
        witnessScriptForSign,
      );
    }
    const tx = txb.buildIncomplete();
    const signedTx = tx.toHex();
    return signedTx;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

// entire utxo set will be used to construct the tx, amount, fee is in satoshi represented as string
export function buildUnsignedRawTx(
  chain: keyof cryptos,
  utxos: utxo[],
  receiver: string,
  amount: string,
  fee: string,
  change: string,
  message: string,
  maxFee: string,
  isRBF = true,
  expiryHeight?: number,
): string {
  try {
    const libID = getLibId(chain);
    const network = utxolib.networks[libID];
    const cashAddrPrefix = blockchains[chain].cashaddr;
    const txb = new utxolib.TransactionBuilder(network, fee);
    if (blockchains[chain].txVersion) {
      txb.setVersion(blockchains[chain].txVersion);
    }
    if (blockchains[chain].txGroupID) {
      txb.setVersionGroupId(blockchains[chain].txGroupID);
    }
    if (expiryHeight && blockchains[chain].txExpiryHeight) {
      txb.setExpiryHeight(expiryHeight);
    }
    if (isRBF) {
      const RBFsequence = 0xffffffff - 2;
      utxos.forEach((x) => txb.addInput(x.txid, x.vout, RBFsequence));
    } else {
      utxos.forEach((x) => txb.addInput(x.txid, x.vout));
    }
    if (cashAddrPrefix) {
      receiver = toLegacyAddress(receiver);
      change = toLegacyAddress(change);
    }
    const recipients = [
      {
        address: receiver,
        satoshis: amount,
      },
    ];
    let totalUtxoValue = new BigNumber(0);
    utxos.forEach((x) => {
      totalUtxoValue = totalUtxoValue.plus(new BigNumber(x.satoshis));
    });

    // if fee + amount is bigger than all our utxo satoshi combined, add our change address output
    const amountToSend = new BigNumber(amount);
    const feeToSend = new BigNumber(fee);
    const totalAmountOutgoing = amountToSend.plus(feeToSend);
    if (totalUtxoValue.isGreaterThan(totalAmountOutgoing)) {
      // we do have a change, add it to the recipients
      // must be bigger than blockchains[chain].dustLimit satoshis, otherwise it will be rejected by the network
      if (
        totalUtxoValue
          .minus(totalAmountOutgoing)
          .isGreaterThanOrEqualTo(new BigNumber(blockchains[chain].dustLimit)) // if not it is additional fee
      ) {
        recipients.push({
          address: change,
          satoshis: totalUtxoValue.minus(totalAmountOutgoing).toFixed(),
        });
      }
    }

    // library accepts it as integer. BN is capped with max safe integer, throws otherwise
    let recipientsAmount = new BigNumber(0);
    for (const x of recipients) {
      txb.addOutput(x.address, new BigNumber(x.satoshis).toNumber());
      recipientsAmount = recipientsAmount.plus(new BigNumber(x.satoshis));
    }

    if (message) {
      const data = Buffer.from(message, 'utf8');
      const dataScript = utxolib.script.nullData.output.encode(data);
      txb.addOutput(dataScript, 0);
    }

    const actualTxFee = totalUtxoValue.minus(recipientsAmount);
    if (
      actualTxFee.isEqualTo(feeToSend) ||
      actualTxFee.isLessThanOrEqualTo(
        feeToSend.plus(new BigNumber(blockchains[chain].dustLimit)),
      )
    ) {
      console.log(actualTxFee, feeToSend);
    } else {
      throw new Error(`Invalid fee ${actualTxFee.toFixed()}`);
    }

    // absurd fee check, we define absurd fee as 100 USD sspConfig().maxTxFeeUSD in send.tsx
    if (actualTxFee.isGreaterThan(new BigNumber(maxFee))) {
      throw new Error(`Fee is absurdly too high ${actualTxFee.toFixed()}`);
    }

    const tx = txb.buildIncomplete();
    const txhex = tx.toHex();
    return txhex;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

// our new tx must have higher absolute fee and higher fee rate as per BIP125. Transaction pinning edge case disregarded.
// SSP has one sender, one receiver - usually known to sender. We can ensure higher overall fee by spending all the mandatory utxos in a case where fee rate is higher.
// in normal scenario automatic fee would solve vast majority of cases.
// use all utxos that are selected mandatory in pick, add another if not sufficient
// Calculate max UTXO inputs based on chain's maxTxSize and scriptType
// Uses the same size formulas as estimateUtxoTxSize (2-of-2 multisig, 2 outputs)
function getMaxUtxoInputs(maxTxSize: number, scriptType: string): number {
  if (scriptType === 'p2wsh') {
    // weight = (11 + 68*N + 43*2)*4 + 150*N → vSize ≈ 97 + 105.5*N, +18*N for 2nd sig
    const overhead = 97;
    const perInput = 123.5;
    return Math.floor((maxTxSize - overhead) / perInput);
  }
  // P2SH: 10 + 180*N + 34*2 + 72*N = 78 + 252*N bytes
  const overhead = 78;
  const perInput = 252;
  return Math.floor((maxTxSize - overhead) / perInput);
}

function pickUtxos(
  utxos: utxo[],
  amount: BigNumber,
  mandatoryUtxos?: txIdentifier[],
  maxInputs?: number,
): utxo[] {
  const inputLimit = maxInputs ?? 670;
  let selectedUtxos: utxo[] = [];
  // sorted utxos by satoshis, smallest first
  const sortedUtxos = utxos.sort((a, b) => {
    const aSatoshis = new BigNumber(a.satoshis);
    const bSatoshis = new BigNumber(b.satoshis);
    if (aSatoshis.isLessThan(bSatoshis)) {
      return -1;
    }
    if (aSatoshis.isGreaterThan(bSatoshis)) {
      return 1;
    }
    return 0;
  });

  if (mandatoryUtxos?.length) {
    const fullManadtoryUtxos: utxo[] = [];
    mandatoryUtxos.forEach((ux) => {
      const utxoExists = utxos.find(
        (u) => u.txid === ux.txid && u.vout === ux.vout,
      );
      if (utxoExists) {
        fullManadtoryUtxos.push(utxoExists);
      }
    });
    const differentUtxos: utxo[] = [];
    utxos.forEach((ux) => {
      const alreadyInUse = fullManadtoryUtxos.find(
        (u) => u.txid === ux.txid && u.vout === ux.vout,
      );
      if (!alreadyInUse) {
        differentUtxos.push(ux);
      }
    });
    if (!fullManadtoryUtxos.length) {
      // RBF not possible
      throw new Error('Replacement by Fee not possible.');
    }
    let totalAmount = new BigNumber(0);
    for (const utxoX of fullManadtoryUtxos) {
      totalAmount = totalAmount.plus(new BigNumber(utxoX.satoshis));
    }
    if (totalAmount.isGreaterThanOrEqualTo(amount)) {
      return fullManadtoryUtxos;
    }
    // if we do not have sufficient utxos. Add another non used utxo by simple selection only.
    for (const utxoX of differentUtxos) {
      totalAmount = totalAmount.plus(new BigNumber(utxoX.satoshis));
      fullManadtoryUtxos.push(utxoX);
      if (totalAmount.isGreaterThanOrEqualTo(amount)) {
        return fullManadtoryUtxos;
      }
    }
    if (totalAmount.isLessThan(amount)) {
      // RBF not possible
      throw new Error(
        'Transaction can not be constructed. Replacement by Fee not possible. Try lowering the amount.',
      );
    }
  }

  // case one. Find if we have a utxo with exact amount
  sortedUtxos.forEach((utxoX) => {
    const utxoAmount = new BigNumber(utxoX.satoshis);
    if (utxoAmount.isEqualTo(amount)) {
      selectedUtxos = [utxoX];
    }
  });
  if (selectedUtxos.length && selectedUtxos.length <= inputLimit) {
    return selectedUtxos;
  }

  // case two
  // If the "sum of all your UTXO smaller than the Target" happens to match the Target, they will be used. (This is the case if you sweep a complete wallet.)
  const utxosSmallerThanTarget = sortedUtxos.filter((utxoX) => {
    const utxoAmount = new BigNumber(utxoX.satoshis);
    return utxoAmount.isLessThan(amount);
  });
  let totalAmountSmallerUtxos = new BigNumber(0);
  utxosSmallerThanTarget.forEach((utxoX) => {
    const utxoAmount = new BigNumber(utxoX.satoshis);
    totalAmountSmallerUtxos = totalAmountSmallerUtxos.plus(utxoAmount);
  });
  if (totalAmountSmallerUtxos.isEqualTo(amount)) {
    selectedUtxos = utxosSmallerThanTarget;
  }
  if (selectedUtxos.length && selectedUtxos.length <= inputLimit) {
    return selectedUtxos;
  }

  // case three
  // If the "sum of all your UTXO smaller than the Target" doesn't surpass the target, the smallest UTXO greater than your Target will be used.
  const utxosBiggestThanTarget = sortedUtxos.filter((utxoX) => {
    const utxoAmount = new BigNumber(utxoX.satoshis);
    return utxoAmount.isGreaterThanOrEqualTo(amount);
  });
  if (totalAmountSmallerUtxos.isLessThan(amount)) {
    if (utxosBiggestThanTarget.length) {
      selectedUtxos = [utxosBiggestThanTarget[0]];
    }
  }
  if (selectedUtxos.length && selectedUtxos.length <= inputLimit) {
    return selectedUtxos;
  }

  // case 4
  // If the "sum of all your UTXO smaller than the Target" surpasses the Target, try using the smallest UTXO first and add more UTXO until you reach the Target.
  if (totalAmountSmallerUtxos.isGreaterThanOrEqualTo(amount)) {
    let totalAmount = new BigNumber(0);
    const preselectedUtxos = [];
    for (const utxoX of utxosSmallerThanTarget) {
      totalAmount = totalAmount.plus(new BigNumber(utxoX.satoshis));
      preselectedUtxos.push(utxoX);
      if (totalAmount.isGreaterThanOrEqualTo(amount)) {
        selectedUtxos = preselectedUtxos;
        break;
      }
    }
    if (selectedUtxos.length && selectedUtxos.length <= inputLimit) {
      return selectedUtxos;
    }
  }

  // case 5
  // If the "sum of all your UTXO smaller than the Target" surpasses the Target, try using the biggest UTXO first and add more UTXO until you reach the Target.
  if (totalAmountSmallerUtxos.isGreaterThanOrEqualTo(amount)) {
    let totalAmount = new BigNumber(0);
    const preselectedUtxos = [];
    for (const utxoX of utxosSmallerThanTarget.reverse()) {
      totalAmount = totalAmount.plus(new BigNumber(utxoX.satoshis));
      preselectedUtxos.push(utxoX);
      if (totalAmount.isGreaterThanOrEqualTo(amount)) {
        selectedUtxos = preselectedUtxos;
        break;
      }
    }
    if (selectedUtxos.length && selectedUtxos.length <= inputLimit) {
      return selectedUtxos;
    }
  }

  // case 6, use utxo bigger than target
  if (utxosBiggestThanTarget.length) {
    selectedUtxos = [utxosBiggestThanTarget[0]];
  }
  if (selectedUtxos.length && selectedUtxos.length <= inputLimit) {
    return selectedUtxos;
  }

  // case 7, transaction can't be constructed, tx size would exceed 100kb. This is a limitation of the blockchain. Fallback to case 5
  if (totalAmountSmallerUtxos.isGreaterThanOrEqualTo(amount)) {
    let totalAmount = new BigNumber(0);
    const preselectedUtxos = [];
    for (const utxoX of utxosSmallerThanTarget.reverse()) {
      totalAmount = totalAmount.plus(new BigNumber(utxoX.satoshis));
      preselectedUtxos.push(utxoX);
      if (totalAmount.isGreaterThanOrEqualTo(amount)) {
        selectedUtxos = preselectedUtxos;
        break;
      }
    }
  }
  if (selectedUtxos.length && selectedUtxos.length <= inputLimit) {
    return selectedUtxos;
  }
  throw new Error(
    'Transaction can not be constructed. Try changing the amount.',
  );
}

export function getSizeOfRawTransaction(
  rawTx: string,
  chain: keyof cryptos,
): number {
  try {
    const libID = getLibId(chain);
    const network = utxolib.networks[libID];
    const txRaw = utxolib.Transaction.fromHex(rawTx, network);
    const virtualRawSize = txRaw.virtualSize();
    return virtualRawSize;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function getTransactionSize(
  chain: keyof cryptos,
  receiver: string,
  amount: string,
  fee: string,
  sender: string,
  change: string,
  message: string,
  privateKey: string,
  redeemScript: string,
  witnessScript: string,
  maxFee: string,
  forbiddenUtxos?: txIdentifier[],
  mandatoryUtxos?: txIdentifier[],
): Promise<number> {
  try {
    const libID = getLibId(chain);
    const blockchainConfig = blockchains[chain];
    const network = utxolib.networks[libID];
    const utxos = await fetchUtxos(
      sender,
      chain,
      mandatoryUtxos?.length ? 1 : 0,
    ); // however we do have it correctly cached already. Indicate RBF
    const utxosNonCoinbase = utxos.filter(
      (x) =>
        x.coinbase !== true ||
        (x.coinbase === true && x.confirmations && x.confirmations > 100),
    );
    let utxosFiltered: utxo[] = [];
    if (forbiddenUtxos?.length) {
      utxosNonCoinbase.forEach((utxo) => {
        const found = forbiddenUtxos.find(
          (x) => x.txid === utxo.txid && x.vout === utxo.vout,
        );
        if (!found) {
          utxosFiltered.push(utxo);
        }
      });
    } else {
      utxosFiltered = utxosNonCoinbase;
    }
    const amountToSend = new BigNumber(amount).plus(new BigNumber(fee));
    const maxInputs = getMaxUtxoInputs(
      blockchainConfig.maxTxSize,
      blockchainConfig.scriptType,
    );
    const pickedUtxos = pickUtxos(
      utxosFiltered,
      amountToSend,
      mandatoryUtxos,
      maxInputs,
    );
    if (mandatoryUtxos?.length) {
      console.log('RBF TX');
    }
    const rbf = blockchains[chain].rbf ?? false;
    let expiryHeight;
    if (blockchains[chain].txExpiryHeight) {
      // fetch current blockheight
      const currentBlockheight = await getBlockheight(chain);
      expiryHeight = currentBlockheight + blockchains[chain].txExpiryHeight;
    }
    const rawTx = buildUnsignedRawTx(
      chain,
      pickedUtxos,
      receiver,
      amount,
      fee,
      change,
      message,
      maxFee,
      rbf,
      expiryHeight,
    );
    if (!rawTx) {
      throw new Error('Could not construct raw tx');
    }
    const rawTxSize = rawTx.length;
    console.log(rawTxSize);
    const txRaw = utxolib.Transaction.fromHex(rawTx, network);
    const virtualRawSize = txRaw.virtualSize();
    console.log(virtualRawSize);
    const signedTx = signTransaction(
      rawTx,
      chain,
      privateKey,
      redeemScript,
      witnessScript,
      utxos,
    );
    const txRawSigned = utxolib.Transaction.fromHex(signedTx, network);
    const virtualTxSignedSize = txRawSigned.virtualSize();
    console.log(virtualTxSignedSize); // check inputs
    console.log(txRawSigned);
    if (blockchainConfig.scriptType === 'p2wsh') {
      // p2wsh adds about 18 vBytes per signature. We can use number of inputs * 18
      const numberOfInputs = txRawSigned.ins.length; // get numberOfInputs
      const secondSignaturesSize = 18 * numberOfInputs;
      const totalVirtualSize =
        virtualTxSignedSize + Math.ceil(secondSignaturesSize); // as ssp-key is adding second signature.
      console.log(totalVirtualSize);
      return totalVirtualSize; // in vBytes. https://en.bitcoin.it/wiki/Weight_units
    } else if (blockchainConfig.scriptType === 'p2sh') {
      // in bytes
      // p2sh adds 72 bytes for signature
      const numberOfInputs = txRawSigned.ins.length; // get numberOfInputs
      const secondSignaturesSize = 72 * numberOfInputs;
      const totalVirtualSize =
        virtualTxSignedSize + Math.ceil(secondSignaturesSize); // as ssp-key is adding second signature.
      console.log(totalVirtualSize);
      return totalVirtualSize; // in vBytes. https://en.bitcoin.it/wiki/Weight_units
    }
    const numberOfInputs = txRawSigned.ins.length; // get numberOfInputs
    const virtualSignatureSize = virtualTxSignedSize - virtualRawSize; // signature size is virtualSignatureSize +
    const multiplier = numberOfInputs / (numberOfInputs + 1); // additional signed data account roughly for the same size increase as per increase of tx input signature
    const secondSignaturesSize = virtualSignatureSize * multiplier;
    const totalVirtualSize =
      virtualTxSignedSize + Math.ceil(secondSignaturesSize); // as ssp-key is adding second signature.
    console.log(totalVirtualSize);
    return totalVirtualSize; // in vBytes. https://en.bitcoin.it/wiki/Weight_units
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function estimateUtxoTxSize(
  chain: keyof cryptos,
  sender: string,
  amount: string,
  useAllUtxos = false,
  excludeUtxos: txIdentifier[] = [],
): Promise<number> {
  try {
    const blockchainConfig = blockchains[chain];
    const utxos = await fetchUtxos(sender, chain, 0);
    let utxosNonCoinbase = utxos.filter(
      (x) =>
        x.coinbase !== true ||
        (x.coinbase === true && x.confirmations && x.confirmations > 100),
    );

    if (excludeUtxos.length > 0) {
      utxosNonCoinbase = utxosNonCoinbase.filter(
        (utxo) =>
          !excludeUtxos.some(
            (ex) => ex.txid === utxo.txid && ex.vout === utxo.vout,
          ),
      );
    }

    if (utxosNonCoinbase.length === 0) {
      return 250;
    }

    let inputCount: number;

    if (useAllUtxos) {
      inputCount = utxosNonCoinbase.length;
    } else {
      const amountSatoshis = new BigNumber(amount).multipliedBy(
        10 ** blockchainConfig.decimals,
      );

      let totalAmount = new BigNumber(0);
      inputCount = 0;

      const sortedUtxos = utxosNonCoinbase.sort((a, b) => {
        const aSatoshis = new BigNumber(a.satoshis);
        const bSatoshis = new BigNumber(b.satoshis);
        if (aSatoshis.isLessThan(bSatoshis)) {
          return -1;
        }
        if (aSatoshis.isGreaterThan(bSatoshis)) {
          return 1;
        }
        return 0;
      });

      for (const utxo of sortedUtxos) {
        totalAmount = totalAmount.plus(new BigNumber(utxo.satoshis));
        inputCount++;
        if (totalAmount.isGreaterThanOrEqualTo(amountSatoshis)) {
          break;
        }
      }

      if (inputCount === 0) {
        inputCount = 1;
      }
    }

    const outputCount = useAllUtxos ? 1 : 2;
    let baseSize: number;
    let inputSize: number;
    let outputSize: number;

    if (blockchainConfig.scriptType === 'p2wsh') {
      baseSize = 11;
      inputSize = 68;
      outputSize = 43;
      const witnessSize = 150 * inputCount;
      const weight =
        (baseSize + inputSize * inputCount + outputSize * outputCount) * 4 +
        witnessSize;
      const vSize = Math.ceil(weight / 4);
      const secondSigSize = 18 * inputCount;
      return vSize + secondSigSize;
    } else if (blockchainConfig.scriptType === 'p2sh') {
      baseSize = 10;
      inputSize = 180;
      outputSize = 34;
      const txSize =
        baseSize + inputSize * inputCount + outputSize * outputCount;
      const secondSigSize = 72 * inputCount;
      return txSize + secondSigSize;
    } else {
      baseSize = 10;
      inputSize = 148;
      outputSize = 34;
      const txSize =
        baseSize + inputSize * inputCount + outputSize * outputCount;
      return txSize;
    }
  } catch (error) {
    console.log(error);
    return 500;
  }
}

interface constructedTxInfo {
  signedTx: string;
  utxos: utxo[];
}

export async function constructAndSignTransaction(
  chain: keyof cryptos,
  receiver: string,
  amount: string,
  fee: string,
  sender: string,
  change: string,
  message: string,
  privateKey: string,
  redeemScript: string,
  witnessScript: string,
  maxFee: string,
  forbiddenUtxos?: txIdentifier[],
  mandatoryUtxos?: txIdentifier[],
): Promise<constructedTxInfo> {
  try {
    const utxos = await fetchUtxos(
      sender,
      chain,
      mandatoryUtxos?.length ? 1 : 0,
    ); // however we do have it correctly cached already. Indicate RBF
    const utxosNonCoinbase = utxos.filter(
      (x) =>
        x.coinbase !== true ||
        (x.coinbase === true && x.confirmations && x.confirmations > 100),
    );
    let utxosFiltered: utxo[] = [];
    if (forbiddenUtxos?.length) {
      utxosNonCoinbase.forEach((utxo) => {
        const found = forbiddenUtxos.find(
          (x) => x.txid === utxo.txid && x.vout === utxo.vout,
        );
        if (!found) {
          utxosFiltered.push(utxo);
        }
      });
    } else {
      utxosFiltered = utxosNonCoinbase;
    }
    const amountToSend = new BigNumber(amount).plus(new BigNumber(fee));
    const maxInputs = getMaxUtxoInputs(
      blockchains[chain].maxTxSize,
      blockchains[chain].scriptType,
    );
    const pickedUtxos = pickUtxos(
      utxosFiltered,
      amountToSend,
      mandatoryUtxos,
      maxInputs,
    );
    if (mandatoryUtxos?.length) {
      console.log('RBF TX');
    }
    const rbf = blockchains[chain].rbf ?? false;
    let expiryHeight;
    if (blockchains[chain].txExpiryHeight) {
      // fetch current blockheight
      const currentBlockheight = await getBlockheight(chain);
      expiryHeight = currentBlockheight + blockchains[chain].txExpiryHeight;
    }
    const rawTx = buildUnsignedRawTx(
      chain,
      pickedUtxos,
      receiver,
      amount,
      fee,
      change,
      message,
      maxFee,
      rbf,
      expiryHeight,
    );
    if (!rawTx) {
      throw new Error('Could not construct raw tx');
    }
    const signedTx = signTransaction(
      rawTx,
      chain,
      privateKey,
      redeemScript,
      witnessScript,
      utxos,
    );
    if (!signedTx) {
      throw new Error('Could not sign tx');
    }
    // wallet is NOT finalising the transaction, the KEY is finalising the transaction
    const txInfo = {
      signedTx,
      utxos: pickedUtxos,
    };
    return txInfo;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function broadcastTx(
  txHex: string,
  chain: keyof cryptos,
): Promise<string> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].backend === 'blockbook') {
      const url = `https://${backendConfig.node}/api/v2/sendtx/`; // NB: the '/' symbol at the end is mandatory.
      const response = await axios.post<blockbookBroadcastTxResult>(url, txHex);
      return response.data.result;
    } else {
      const url = `https://${backendConfig.node}/api/tx/send`;
      const response = await axios.post<broadcastTxResult>(url, {
        rawtx: txHex,
      });
      return response.data.txid;
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}

const nonceCache = {} as Record<string, string>;

interface GasEstimate {
  preVerificationGas: string;
  callGasLimit: string;
  verificationGasLimit: string;
}

export async function estimateGas(
  chain: keyof cryptos,
  sender: string,
  token: string,
  customData?: string, // Add customData parameter to estimate dynamic gas
): Promise<GasEstimate> {
  const backendConfig = backends()[chain];
  const url = `https://${backendConfig.node}`;

  // TODO: Implement real-time gas estimation using eth_estimateUserOperationGas
  // Currently using hardcoded values based on historical Alchemy responses

  /* Gas estimation values derived from Alchemy eth_estimateUserOperationGas responses:
   *
   * Account Creation (nonce = 0):
   * - Native: preVerificationGas: 64277, callGasLimit: 63544, verificationGasLimit: 393421
   * - Token: preVerificationGas: 65235, callGasLimit: 63544, verificationGasLimit: 393861
   *
   * Account Exists (nonce > 0):
   * - Native: preVerificationGas: 62076, callGasLimit: 27138, verificationGasLimit: 81242
   * - Token: preVerificationGas: 63000, callGasLimit: 55810, verificationGasLimit: 81492
   *
   * CRITICAL: Account existence dramatically affects gas costs!
   * - verificationGasLimit drops from ~393k to ~81k (80% reduction!)
   * - callGasLimit varies significantly for native transfers
   *
   * All values multiplied by 1.2x safety buffer for conservative estimation
   */

  // Get account nonce to determine if account exists (for future real estimation)
  let accountNonce = nonceCache[sender];
  if (!accountNonce) {
    const data = {
      id: new Date().getTime(),
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [sender, 'latest'],
    };
    const response = await axios.post<eth_evm>(url, data);
    console.log(response.data);
    nonceCache[sender] = response.data.result;
    accountNonce = nonceCache[sender];
  }

  // Determine if account exists based on nonce
  const accountExists = accountNonce !== '0x0';

  // Select base gas estimates based on account existence and token type
  let preVerificationGas: number;
  let callGasLimit: number;
  let verificationGasLimit: number;

  if (accountExists) {
    // Account already exists - much lower gas requirements
    if (token) {
      // ERC-20 transfer on existing account
      preVerificationGas = Math.ceil(63000 * 1.2);
      callGasLimit = Math.ceil(55810 * 1.2);
      verificationGasLimit = Math.ceil(81492 * 1.2);
    } else {
      // Native transfer on existing account
      preVerificationGas = Math.ceil(62076 * 1.2);
      callGasLimit = Math.ceil(55810 * 1.2);
      verificationGasLimit = Math.ceil(81242 * 1.2);
    }
  } else {
    // Account creation required - higher gas requirements
    if (token) {
      // ERC-20 transfer with account creation
      preVerificationGas = Math.ceil(65235 * 1.2);
      callGasLimit = Math.ceil(63544 * 1.2);
      verificationGasLimit = Math.ceil(393861 * 1.2);
    } else {
      // Native transfer with account creation
      preVerificationGas = Math.ceil(64277 * 1.2);
      callGasLimit = Math.ceil(63544 * 1.2);
      verificationGasLimit = Math.ceil(393421 * 1.2);
    }
  }

  console.log(
    `💰 GAS BASE ESTIMATION (Account ${accountExists ? 'EXISTS' : 'CREATION'}):`,
    {
      accountNonce,
      isToken: !!token,
      preVerificationGas,
      callGasLimit,
      verificationGasLimit,
      baseTotal: preVerificationGas + callGasLimit + verificationGasLimit,
    },
  );

  // Dynamic gas scaling for complex DeFi operations
  if (customData && customData !== '0x') {
    const dataLength = customData.length;
    if (dataLength > 1000) {
      // Complex DeFi operations
      console.log('💰 GAS ESTIMATE: Applying complex DeFi scaling');
      // preVerificationGas = Math.ceil(preVerificationGas * 1.5); // +50%
      callGasLimit = Math.ceil(callGasLimit * 2.0); // +100%
    } else if (dataLength > 100) {
      // Moderate complexity
      console.log('💰 GAS ESTIMATE: Applying moderate complexity scaling');
      // preVerificationGas = Math.ceil(preVerificationGas * 1.2); // +20%
      callGasLimit = Math.ceil(callGasLimit * 1.5); // +50%
    }
  }

  // Calculate total gas requirement
  const totalGasRequired =
    preVerificationGas + callGasLimit + verificationGasLimit;

  console.log('💰 GAS ESTIMATE BREAKDOWN:', {
    accountExists: accountExists,
    isToken: !!token,
    hasCustomData: !!(customData && customData !== '0x'),
    preVerificationGas,
    callGasLimit,
    verificationGasLimit,
    totalRequired: totalGasRequired,
    customDataLength: customData?.length || 0,
  });

  return {
    preVerificationGas: preVerificationGas.toString(),
    callGasLimit: callGasLimit.toString(),
    verificationGasLimit: verificationGasLimit.toString(),
  };
}

interface publicNonces {
  kPublic: string;
  kTwoPublic: string;
}

// return stringified multisig user operation
export async function constructAndSignEVMTransaction(
  chain: keyof cryptos,
  receiver: `0x${string}`,
  amount: string,
  privateKey: `0x${string}`, // ssp
  // publicKey1 is generated here. ssp wallet
  publicKey2HEX: string,
  // publicNonces1 is generated here. ssp wallet
  publicNonces2: publicNonces, // ssp key public nonces
  baseGasPrice: string,
  priorityGasPrice: string,
  // Individual gas components - always required
  preVerificationGas: string,
  callGasLimit: string,
  verificationGasLimit: string,
  token?: `0x${string}` | '',
  importedTokens: Token[] = [],
  customData?: string, // For WalletConnect and custom contract calls
): Promise<string> {
  try {
    const blockchainConfig = blockchains[chain];
    const backendConfig = backends()[chain];
    const accountSalt = blockchainConfig.accountSalt;
    const schnorrSigner1 =
      accountAbstraction.helpers.SchnorrHelpers.createSchnorrSigner(privateKey);
    const publicKey1 = schnorrSigner1.getPubKey();
    const publicKey2 = new accountAbstraction.types.Key(
      Buffer.from(publicKey2HEX, 'hex'),
    );

    const publicNonces1 = schnorrSigner1.generatePubNonces();
    const publicNoncesKey: accountAbstraction.types.PublicNonces = {
      kPublic: new accountAbstraction.types.Key(
        Buffer.from(publicNonces2.kPublic, 'hex'),
      ),
      kTwoPublic: new accountAbstraction.types.Key(
        Buffer.from(publicNonces2.kTwoPublic, 'hex'),
      ),
    };
    const publicKeys = [publicKey1, publicKey2];
    const combinedAddresses =
      accountAbstraction.helpers.SchnorrHelpers.getAllCombinedAddrFromKeys(
        publicKeys,
        2,
      );

    const rpcUrl = `https://${backendConfig.node}`;

    const transport = viemHttp(rpcUrl);
    const CHAIN = viemChains[blockchainConfig.libid as keyof typeof viemChains];
    const multiSigSmartAccount =
      await accountAbstraction.accountAbstraction.createMultiSigSmartAccount({
        transport,
        chain: CHAIN,
        combinedAddress: combinedAddresses,
        salt: accountAbstraction.helpers.create2Helpers.saltToHex(accountSalt),
        entryPoint: getEntryPoint(CHAIN),
      });

    // Use the provided gas values directly
    const gasPreVerification = Number(preVerificationGas);
    const gasCallLimit = Number(callGasLimit);
    const gasVerificationLimit = Number(verificationGasLimit);

    console.log('💻 USING PROVIDED GAS VALUES:', {
      preVerificationGas: gasPreVerification,
      callGasLimit: gasCallLimit,
      verificationGasLimit: gasVerificationLimit,
      total: gasPreVerification + gasCallLimit + gasVerificationLimit,
    });

    let priorityGas = new BigNumber(priorityGasPrice)
      .multipliedBy(10 ** 9)
      .toFixed(0);
    const baseGas = new BigNumber(baseGasPrice)
      .multipliedBy(10 ** 9)
      .toFixed(0);

    console.log('💰 BASE GAS:', baseGas);
    console.log('💰 PRIORITY GAS:', priorityGas);

    // Calculate total max fee per gas (base + priority)
    // Special handling for BSC: BSC has zero base fee, so maxFeePerGas must equal maxPriorityFeePerGas
    let maxFeePerGas: string;
    if (chain === 'bsc') {
      // On BSC, base fee is always 0, so maxFeePerGas = maxPriorityFeePerGas
      // Both values must be equal to the total desired gas price
      const totalFee = new BigNumber(baseGas).plus(priorityGas).toFixed(0);
      maxFeePerGas = totalFee;
      // Update priorityGas to match maxFeePerGas for BSC
      priorityGas = totalFee;
    } else {
      // Standard EIP-1559 for other chains
      maxFeePerGas = new BigNumber(baseGas).plus(priorityGas).toFixed(0);
    }

    console.log('💰 MAX FEE PER GAS:', maxFeePerGas);
    console.log('💰 PRIORITY GAS:', priorityGas);

    const CLIENT_OPT = {
      feeOptions: {
        maxPriorityFeePerGas: {
          max: BigInt(priorityGas),
          min: BigInt(priorityGas),
        },
        maxFeePerGas: { max: BigInt(maxFeePerGas), min: BigInt(maxFeePerGas) },
        preVerificationGas: {
          multiplier: 1.3,
          max: BigInt(gasPreVerification),
        },
        callGasLimit: { multiplier: 1.3, max: BigInt(gasCallLimit) },
        verificationGasLimit: {
          multiplier: 1.3,
          max: BigInt(gasVerificationLimit),
        },
      },
      txMaxRetries: 5,
      txRetryMultiplier: 3,
    };

    const smartAccountClient = createSmartAccountClient({
      transport,
      chain: CHAIN,
      account: multiSigSmartAccount,
      opts: CLIENT_OPT,
    });

    let uoStruct;

    if (token) {
      const tokenInfo = blockchainConfig.tokens
        .concat(importedTokens)
        .find((x) => x.contract === token);
      if (!tokenInfo) {
        throw new Error('Token specifications not found');
      }
      const tokenDecimals = tokenInfo.decimals;
      const erc20Decimals = tokenDecimals;
      const erc20Amount = parseUnits(amount, erc20Decimals);
      const uoCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [receiver, erc20Amount],
      });

      uoStruct = await smartAccountClient.buildUserOperation({
        account: multiSigSmartAccount,
        uo: {
          data: uoCallData,
          target: token, // token contract address
        },
      });
    } else {
      // Handle custom data for contract calls (like WalletConnect)
      const txData = (customData || '0x') as `0x${string}`;
      // Parse the amount properly - use ETH value if provided, otherwise 0
      const txValue = parseUnits(amount, blockchainConfig.decimals);

      uoStruct = await smartAccountClient.buildUserOperation({
        account: multiSigSmartAccount,
        uo: {
          data: txData,
          target: receiver,
          value: txValue,
        },
      });
    }

    // @TODO: Override the SDK's estimated gas values with the user-provided values
    // This ensures manual fee settings are respected otherwise those are kept as max for our SDK which is optimizing it for now.
    // uoStruct.preVerificationGas = BigInt(gasPreVerification);
    // uoStruct.callGasLimit = BigInt(gasCallLimit);
    // uoStruct.verificationGasLimit = BigInt(gasVerificationLimit);

    const uoStructHexlified = deepHexlify(uoStruct) as UserOperationRequest_v6;
    const uoStructHash = multiSigSmartAccount
      .getEntryPoint()
      .getUserOperationHash(uoStructHexlified);

    const multiSigUserOp = new accountAbstraction.userOperation.MultiSigUserOp(
      publicKeys,
      [publicNonces1, publicNoncesKey],
      uoStructHash,
      uoStructHexlified,
    );
    multiSigUserOp.signMultiSigHash(schnorrSigner1); // we post this to our server
    // @TODO do a preflight check. This is getting 429 oftenly, consult with Alchemy
    // const userOpJson = multiSigUserOp.toJson();
    // // do a preflight check that the gas is sufficient
    // const dataPreflight = {
    //   id: new Date().getTime(),
    //   jsonrpc: '2.0',
    //   method: 'eth_estimateUserOperationGas',
    //   params: [userOpJson?.userOpRequest, blockchainConfig.entrypointAddress],
    // };
    // const responsePreflight = await axios.post<eth_evm>(rpcUrl, dataPreflight);
    // if (!responsePreflight.data.result) {
    //   throw new Error(
    //     'Preflight check failed. Gas limit isinsufficient. Please increase gas limit manually and try again.',
    //   );
    // }
    return JSON.stringify(multiSigUserOp.toJson());
  } catch (error) {
    console.log(error);
    throw error;
  }
}

// Check single address deployment status
export async function isEVMContractDeployed(
  address: string,
  chain: keyof cryptos,
): Promise<boolean> {
  try {
    const backendConfig = backends()[chain];
    const url = `https://${backendConfig.node}`;

    const data = {
      id: new Date().getTime(),
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [address, 'latest'],
    };

    console.log(`Checking deployment for ${address}...`);
    const response = await axios.post<eth_evm>(url, data);

    // Check if we got a valid response with result field
    if (
      !response.data ||
      response.data.result === undefined ||
      response.data.result === null
    ) {
      console.log(
        `Address ${address}: Invalid RPC response, assuming not deployed`,
      );
      return false;
    }

    const nonce = response.data.result;
    const isDeployed = nonce !== '0x0';
    console.log(`Address ${address}: nonce=${nonce}, isDeployed=${isDeployed}`);
    return isDeployed;
  } catch (error) {
    console.error(`Error checking deployment for ${address}:`, error);
    return false; // Assume not deployed on error
  }
}

// ============================================================================
// Solana
// ============================================================================

/**
 * Probes on-chain state to decide:
 *   - `needsSetup`: caller must POST /v1/sol/setup before constructAndSignSOLTransaction.
 *     True iff multisig OR durable nonce account is missing.
 *   - `isFirstRealSend`: charges firstSendLamports vs subsequentSendLamports.
 *     True iff multisig is missing OR multisig.transaction_index === 0.
 *     (The second condition captures the case where /v1/sol/setup ran
 *     hours/days ago but the user hasn't actually sent anything yet, so the
 *     paymaster's pre-paid setup rent still needs to be reimbursed on this send.)
 *
 * Uses Connection directly — no SDK client spin-up needed.
 */
export async function getSolanaMultisigInitState(opts: {
  chain: keyof cryptos;
  walletPubkeyBase58: string;
  keyPubkeyBase58: string;
}): Promise<{ needsSetup: boolean; isFirstRealSend: boolean }> {
  const { Connection, PublicKey } = await import('@solana/web3.js');
  const { SolanaMultisigClient, deriveMultisigAddress, deriveNonceAccount } =
    await import('@runonflux/solana-multisig');
  const backendConfig = backends()[opts.chain];
  const blockchainConfig = blockchains[opts.chain];
  if (!blockchainConfig.programId) {
    throw new Error(`Chain ${opts.chain} has no programId in spec`);
  }
  const programId = new PublicKey(blockchainConfig.programId);
  const connection = new Connection(`https://${backendConfig.node}`, {
    commitment: 'confirmed',
  });
  const members = [
    new PublicKey(opts.walletPubkeyBase58),
    new PublicKey(opts.keyPubkeyBase58),
  ];
  const [multisigAddress] = deriveMultisigAddress(members, 2, programId);
  const nonceAccount = await deriveNonceAccount(multisigAddress);

  const client = new SolanaMultisigClient(connection, programId);
  const [multisigState, nonceAccountInfo] = await Promise.all([
    client.getMultisig(multisigAddress),
    connection.getAccountInfo(nonceAccount),
  ]);

  const needsSetup = !multisigState || !nonceAccountInfo;
  // SDK's MultisigConfig.transactionIndex is typed as bigint but anchor's
  // u64 deserialization actually returns BN at runtime. Normalize via
  // .toString() so the BigInt comparison is correct either way.
  const isFirstRealSend =
    !multisigState ||
    BigInt(multisigState.transactionIndex.toString()) === BigInt(0);
  return { needsSetup, isFirstRealSend };
}

/**
 * Build a Solana 2-of-2 send transaction, wallet-leaf-signed and ready for
 * the SSP relay → Key co-sign → broadcast flow.
 *
 * When the multisig PDA isn't yet initialized on-chain, prepends a single
 * permissionless `initialize_multisig` ix. No member signatures are needed
 * for init — the PDA is fully determined by `(sorted_members, threshold)`,
 * so initializing with the canonical inputs is the only way to land at the
 * canonical address.
 *
 * Layout (when needsInit=true):
 *   [initialize_multisig, ...extraOuterIxs, create, approve×2, execute, close]
 * Layout (when needsInit=false):
 *   [...extraOuterIxs, create, approve×2, execute, close]
 *
 * Wallet leaf-signs in place and returns the partially-signed tx as base64.
 * Identical wire format for first / subsequent sends — Key co-signs + posts
 * to /v1/sol/broadcast.
 */
export async function constructAndSignSOLTransaction(opts: {
  chain: keyof cryptos;
  recipient: string; // base58 Solana address (recipient OWNER for SPL)
  amount: string; // amount in base units (lamports for SOL, raw token units for SPL)
  walletPubkeyBase58: string;
  keyPubkeyBase58: string;
  walletPrivKeyHex: string;
  // Fetched from GET /v1/sol/paymaster — the relay's paymaster signs feePayer.
  paymasterPubkeyBase58: string;
  // Vault → paymaster reimbursement, embedded in the proposal. Relay
  // rejects txs below FEE_SCHEDULE.minReimbursementLamports.
  paymasterFeeLamports: string;
  // SPL transfer if set; otherwise native SOL. Recipient ATA is auto-created
  // (idempotent ix).
  tokenMintBase58?: string;
  // Optional memo embedded as an SPL Memo v2 instruction inside the proposal.
  // Shows up on explorers and is parsed back into history's note field.
  memo?: string;
}): Promise<string> {
  const { Connection, PublicKey, SystemProgram, Transaction, Keypair } =
    await import('@solana/web3.js');
  const { SolanaMultisigClient, deriveMultisigAddress, deriveVaultAddress } =
    await import('@runonflux/solana-multisig');
  const backendConfig = backends()[opts.chain];
  const blockchainConfig = blockchains[opts.chain];
  if (!blockchainConfig.programId) {
    throw new Error(`Chain ${opts.chain} has no programId in spec`);
  }
  const programId = new PublicKey(blockchainConfig.programId);
  const connection = new Connection(`https://${backendConfig.node}`, {
    commitment: 'confirmed',
  });

  // Reconstruct wallet keypair from hex secretKey for partial-signing.
  const walletSecretKey = new Uint8Array(
    Buffer.from(opts.walletPrivKeyHex, 'hex'),
  );
  const walletKeypair = Keypair.fromSecretKey(walletSecretKey);
  if (walletKeypair.publicKey.toBase58() !== opts.walletPubkeyBase58) {
    throw new Error(
      'Wallet privkey/pubkey mismatch — secretKey does not match expected pubkey',
    );
  }

  const walletPubkey = walletKeypair.publicKey;
  const keyPubkey = new PublicKey(opts.keyPubkeyBase58);
  const paymasterPubkey = new PublicKey(opts.paymasterPubkeyBase58);

  // Compute multisig + vault PDAs from the two member pubkeys.
  const members = [walletPubkey, keyPubkey];
  const threshold = 2;
  const [multisigAddress] = deriveMultisigAddress(
    members,
    threshold,
    programId,
  );
  const [vaultAddress] = deriveVaultAddress(multisigAddress, 0, programId);

  // The multisig must already be initialized AND its durable nonce account
  // must already be provisioned by the time this function is called.
  // SendSOL.tsx is responsible for calling /v1/sol/setup on the relay
  // before invoking us when either is missing — that endpoint atomically
  // sets up both via a paymaster-signed tx with vault-balance gating.
  //
  // We can therefore assume here that:
  //   - `client.getMultisig(multisigAddress)` returns non-null
  //   - `connection.getAccountInfo(nonceAccount)` returns non-null
  //   - We can always use the durable-nonce flow (nonceAdvance at ix[0])
  const client = new SolanaMultisigClient(connection, programId);
  const multisigState = await client.getMultisig(multisigAddress);
  if (!multisigState) {
    throw new Error(
      'Multisig not initialized on-chain — caller must POST /v1/sol/setup first',
    );
  }
  // First *real* send is detected by transactionIndex===0 (not by needsInit)
  // because pre-setup leaves multisig.transaction_index at 0 even after
  // initialize_multisig has run. This means the wallet's fee calculator
  // correctly charges firstSendLamports on the first send even when the
  // multisig was pre-initialized by /v1/sol/setup hours/days earlier.
  const currentTxIndex = multisigState.transactionIndex;

  // Determine the durable nonce account for this multisig. Pure deterministic
  // derivation — paymaster-independent, no DB lookup needed.
  const { deriveNonceAccount } = await import('@runonflux/solana-multisig');
  const nonceAccount = await deriveNonceAccount(multisigAddress);

  const recipientPubkey = new PublicKey(opts.recipient);

  // Build the inner transfer instruction + V0-style proposal message.
  // For SPL: account_keys = [vault (signer), sourceAta, destAta, TOKEN_PROGRAM]
  // For SOL: account_keys = [vault (signer), recipient, SystemProgram]
  let message: import('@runonflux/solana-multisig').TransactionMessage;
  let extraOuterIxs: import('@solana/web3.js').TransactionInstruction[] = [];
  let executeRemainingAccounts: Array<{
    pubkey: import('@solana/web3.js').PublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }>;

  if (opts.tokenMintBase58) {
    const splToken = await import('@solana/spl-token');
    const mint = new PublicKey(opts.tokenMintBase58);
    // Vault's ATA is the source. allowOwnerOffCurve=true since vault is a PDA.
    const sourceAta = splToken.getAssociatedTokenAddressSync(
      mint,
      vaultAddress,
      true,
    );
    const destAta = splToken.getAssociatedTokenAddressSync(
      mint,
      recipientPubkey,
      true,
    );
    // Idempotent ATA creation for recipient's ATA (paymaster pays rent if
    // it doesn't exist). Goes outside the multisig proposal since it
    // doesn't need vault authorization.
    extraOuterIxs = [
      splToken.createAssociatedTokenAccountIdempotentInstruction(
        paymasterPubkey, // payer
        destAta,
        recipientPubkey, // owner of new ATA
        mint,
      ),
    ];
    const transferIx = splToken.createTransferInstruction(
      sourceAta,
      destAta,
      vaultAddress, // authority
      BigInt(opts.amount),
    );
    // Paymaster reimbursement, validated by the relay against its floor.
    const reimburseIx = SystemProgram.transfer({
      fromPubkey: vaultAddress,
      toPubkey: paymasterPubkey,
      lamports: BigInt(opts.paymasterFeeLamports),
    });
    const memoText = opts.memo?.trim() ?? '';
    const memoProgramId = new PublicKey(MEMO_PROGRAM_ID_BASE58);
    const splAccountKeys = [
      vaultAddress,
      sourceAta,
      destAta,
      splToken.TOKEN_PROGRAM_ID,
      paymasterPubkey,
      SystemProgram.programId,
    ];
    const splInstructions = [
      {
        programIdIndex: 3, // TOKEN_PROGRAM_ID
        accountIndexes: new Uint8Array([1, 2, 0]), // [source, dest, authority]
        data: new Uint8Array(transferIx.data),
      },
      {
        programIdIndex: 5, // SystemProgram for reimbursement
        accountIndexes: new Uint8Array([0, 4]), // [vault, paymaster]
        data: new Uint8Array(reimburseIx.data),
      },
    ];
    if (memoText) {
      splAccountKeys.push(memoProgramId);
      splInstructions.push({
        programIdIndex: splAccountKeys.length - 1,
        accountIndexes: new Uint8Array([]),
        data: new Uint8Array(Buffer.from(memoText, 'utf8')),
      });
    }
    message = {
      numSigners: 1,
      numWritableSigners: 1,
      numWritableNonSigners: 3,
      accountKeys: splAccountKeys,
      instructions: splInstructions,
      addressTableLookups: [],
    };
    executeRemainingAccounts = [
      { pubkey: vaultAddress, isSigner: false, isWritable: true },
      { pubkey: sourceAta, isSigner: false, isWritable: true },
      { pubkey: destAta, isSigner: false, isWritable: true },
      { pubkey: splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: paymasterPubkey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    if (memoText) {
      executeRemainingAccounts.push({
        pubkey: memoProgramId,
        isSigner: false,
        isWritable: false,
      });
    }
  } else {
    // Native SOL transfer + paymaster reimbursement.
    const transferIx = SystemProgram.transfer({
      fromPubkey: vaultAddress,
      toPubkey: recipientPubkey,
      lamports: BigInt(opts.amount),
    });
    const reimburseIx = SystemProgram.transfer({
      fromPubkey: vaultAddress,
      toPubkey: paymasterPubkey,
      lamports: BigInt(opts.paymasterFeeLamports),
    });
    // account_keys MUST be ordered: [writable_signers, readonly_signers,
    // writable_non_signers, readonly_non_signers]. Putting SystemProgram
    // before paymaster pushes paymaster into the readonly zone — execute
    // then fails with "instruction changed the balance of a read-only
    // account" when the reimbursement transfer credits paymaster.
    const memoText = opts.memo?.trim() ?? '';
    const memoProgramId = new PublicKey(MEMO_PROGRAM_ID_BASE58);
    const solAccountKeys = [
      vaultAddress,
      recipientPubkey,
      paymasterPubkey,
      SystemProgram.programId,
    ];
    const solInstructions = [
      {
        programIdIndex: 3,
        accountIndexes: new Uint8Array([0, 1]), // [vault, recipient]
        data: new Uint8Array(transferIx.data),
      },
      {
        programIdIndex: 3,
        accountIndexes: new Uint8Array([0, 2]), // [vault, paymaster]
        data: new Uint8Array(reimburseIx.data),
      },
    ];
    if (memoText) {
      solAccountKeys.push(memoProgramId);
      solInstructions.push({
        programIdIndex: solAccountKeys.length - 1,
        accountIndexes: new Uint8Array([]),
        data: new Uint8Array(Buffer.from(memoText, 'utf8')),
      });
    }
    message = {
      numSigners: 1,
      numWritableSigners: 1,
      numWritableNonSigners: 2,
      accountKeys: solAccountKeys,
      instructions: solInstructions,
      addressTableLookups: [],
    };
    executeRemainingAccounts = [
      { pubkey: vaultAddress, isSigner: false, isWritable: true },
      { pubkey: recipientPubkey, isSigner: false, isWritable: true },
      { pubkey: paymasterPubkey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    if (memoText) {
      executeRemainingAccounts.push({
        pubkey: memoProgramId,
        isSigner: false,
        isWritable: false,
      });
    }
  }

  const {
    instruction: createIx,
    transactionAddress,
    transactionIndex,
  } = await client.buildCreateTransactionInstruction({
    multisigAddress,
    currentTransactionIndex: currentTxIndex,
    vaultIndex: 0,
    message,
    creator: walletPubkey,
    // Paymaster funds the proposal rent — leaf doesn't need a SOL balance.
    // close_transaction below refunds rent back to the same paymaster.
    payer: paymasterPubkey,
  });
  const approveWalletIx = await client.buildApproveTransactionInstruction({
    multisigAddress,
    transactionAddress,
    transactionIndex,
    member: walletPubkey,
  });
  const approveKeyIx = await client.buildApproveTransactionInstruction({
    multisigAddress,
    transactionAddress,
    transactionIndex,
    member: keyPubkey,
  });
  const executeIx = await client.buildExecuteTransactionInstruction({
    multisigAddress,
    transactionAddress,
    transactionIndex,
    executor: walletPubkey,
    remainingAccounts: executeRemainingAccounts,
  });
  // Close refunds proposal rent to the original payer (paymaster);
  // bundled with execute so it's atomic.
  const closeIx = await client.buildCloseTransactionInstruction({
    multisigAddress,
    transactionAddress,
    transactionIndex,
    payer: paymasterPubkey,
  });

  // Durable nonce flow. Multisig + nonce account are guaranteed to exist
  // at this point (caller ran /v1/sol/setup first if needed). Fetch the
  // current nonce value, use it as `recentBlockhash`, and prepend
  // SystemProgram.nonceAdvance at ix[0]. Wallet's signature then survives
  // the full wallet→relay→push→user-approve→key-sign round trip without
  // expiring — durable nonces don't have the 60s blockhash window.
  const nonceState = await connection.getNonceAndContext(nonceAccount);
  if (!nonceState.value) {
    throw new Error(
      `Durable nonce at ${nonceAccount.toBase58()} not initialized — caller must POST /v1/sol/setup first`,
    );
  }
  const nonceAdvanceIx = SystemProgram.nonceAdvance({
    noncePubkey: nonceAccount,
    authorizedPubkey: paymasterPubkey,
  });

  const tx = new Transaction().add(
    nonceAdvanceIx, // ix[0] — MUST be first for Solana to recognize durable-nonce semantics
    ...extraOuterIxs,
    createIx,
    approveWalletIx,
    approveKeyIx,
    executeIx,
    closeIx,
  );
  tx.recentBlockhash = nonceState.value.nonce;
  tx.feePayer = paymasterPubkey;
  tx.partialSign(walletKeypair);

  // Serialize without verifying signatures (key's slot is still unsigned).
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
}
