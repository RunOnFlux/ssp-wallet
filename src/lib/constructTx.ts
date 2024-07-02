import utxolib from '@runonflux/utxo-lib';
import { Buffer } from 'buffer';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { toLegacyAddress } from 'bchaddrjs';
import { http as viemHttp, parseUnits } from 'viem';
import * as viemChains from 'viem/chains';
import * as accountAbstraction from '@runonflux/aa-schnorr-multisig-sdk';
import {
  getEntryPoint,
  createSmartAccountClient,
  deepHexlify,
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
import { blockchains } from '@storage/blockchains';

import { LRUCache } from 'lru-cache';

import { getBlockheight } from './blockheight.ts';

const utxoCache = new LRUCache({
  max: 1000,
  ttl: 1 * 60 * 60 * 1000, // 1 hour, just as precaution here, not really needed
});

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
        const fetchedUtxos = data
          .filter((x) => (onlyConfirmed ? x.confirmations > 0 : true))
          .concat(dataB);
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
        const fetchedUtxos = data
          .filter((x) => (onlyConfirmed ? x.confirmations > 0 : true))
          .concat(dataB);
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
        // eslint-disable-next-line no-bitwise
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
function pickUtxos(
  utxos: utxo[],
  amount: BigNumber,
  mandatoryUtxos?: txIdentifier[],
): utxo[] {
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
  if (selectedUtxos.length && selectedUtxos.length <= 670) {
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
  if (selectedUtxos.length && selectedUtxos.length <= 670) {
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
  if (selectedUtxos.length && selectedUtxos.length <= 670) {
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
    if (selectedUtxos.length && selectedUtxos.length <= 670) {
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
    if (selectedUtxos.length && selectedUtxos.length <= 670) {
      return selectedUtxos;
    }
  }

  // case 6, use utxo bigger than target
  if (utxosBiggestThanTarget.length) {
    selectedUtxos = [utxosBiggestThanTarget[0]];
  }
  if (selectedUtxos.length && selectedUtxos.length <= 670) {
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
  if (selectedUtxos.length && selectedUtxos.length <= 670) {
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
    const pickedUtxos = pickUtxos(utxosFiltered, amountToSend, mandatoryUtxos);
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
    const pickedUtxos = pickUtxos(utxosFiltered, amountToSend, mandatoryUtxos);
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

export async function estimateGas(
  chain: keyof cryptos,
  sender: string,
): Promise<string> {
  const backendConfig = backends()[chain];
  const url = `https://${backendConfig.node}`;

  // get address nonce. if 0, use gas limit of 347763  * 1.5
  // if > =, use gas limit of 119098 * 1.5

  // const data = {
  //   id: new Date().getTime(),
  //   jsonrpc: '2.0',
  //   method: 'eth_estimateUserOperationGas',
  //   params: [estimateUserOpData, blockchainConfig.entrypointAddress],
  // };
  // get account nonce
  // account creation:

  // result: {
  //   preVerificationGas: '0xb904',
  //   callGasLimit: '0x4bb8',
  //   verificationGasLimit: '0x449b7'
  // }
  // = 347763 gas

  // account exists:

  // result: {
  //   preVerificationGas: '0xb2d4',
  //   callGasLimit: '0x3bb8',
  //   verificationGasLimit: '0xe2ae'
  // }
  // = 119098 gas
  // // 2 scenarios coded
  // 1st transfer with account creation if nonce is 0
  // 2nd transfer if nonce is present, account present

  if (nonceCache[sender]) {
    if (nonceCache[sender] === '0x0') {
      return (347763 * 1.5).toFixed();
    }
    return (119098 * 1.5).toFixed();
  }
  const data = {
    id: new Date().getTime(),
    jsonrpc: '2.0',
    method: 'eth_getTransactionCount',
    params: [sender],
  };
  const response = await axios.post<eth_evm>(url, data);
  console.log(response.data);
  nonceCache[sender] = response.data.result;
  if (response.data.result === '0x0') {
    return (347763 * 1.5).toFixed();
  }
  return (119098 * 1.5).toFixed();
}

interface publicNonces {
  kPublic: string;
  kTwoPublic: string;
}

// return stringified multisig user operation
export async function constructAndSignEVMTransaction(
  chain: keyof cryptos,
  receiver: string,
  amount: string,
  privateKey: `0x${string}`, // ssp
  // publicKey1 is generated here. ssp wallet
  publicKey2HEX: string,
  // publicNonces1 is generated here. ssp wallet
  publicNonces2: publicNonces, // ssp key public nonces
  baseGasPrice: string,
  priorityGasPrice: string,
  maxTotalGas: string,
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const CHAIN = viemChains[blockchainConfig.libid as keyof typeof viemChains];
    const multiSigSmartAccount =
      await accountAbstraction.accountAbstraction.createMultiSigSmartAccount({
        // @ts-expect-error library issue
        transport,
        // @ts-expect-error library issue
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        chain: CHAIN,
        combinedAddress: combinedAddresses,
        salt: accountAbstraction.helpers.create2Helpers.saltToHex(accountSalt),
        // @ts-expect-error type mismatch as of library
        entryPoint: getEntryPoint(CHAIN),
      });

    let preVerificationGas = Math.ceil(47364 * 1.5);
    let callGasLimit = Math.ceil(19384 * 1.5);
    const suggestedVerLimit = Math.ceil(347763 * 1.5);
    // if we have more than suggestedVerLimit split it 1, 1, 2
    const difference = Number(maxTotalGas) - (suggestedVerLimit + callGasLimit + preVerificationGas);
    if (difference > 0) {
      const differenceGroup = Math.ceil(difference / 4);
      preVerificationGas += differenceGroup;
      callGasLimit += differenceGroup;
    }
    preVerificationGas = Math.ceil(preVerificationGas);
    callGasLimit = Math.ceil(callGasLimit);

    const verificationGasLimit = Math.ceil(
      Number(maxTotalGas) - preVerificationGas - callGasLimit,
    );

    const CLIENT_OPT = {
      feeOptions: {
        maxPriorityFeePerGas: {
          max: BigInt(priorityGasPrice),
          min: BigInt(priorityGasPrice),
        },
        maxFeePerGas: { max: BigInt(baseGasPrice), min: BigInt(baseGasPrice) },
        preVerificationGas: {
          multiplier: 1.25,
          max: BigInt(preVerificationGas),
        },
        callGasLimit: { multiplier: 1.25, max: BigInt(callGasLimit) },
        verificationGasLimit: {
          multiplier: 1.25,
          max: BigInt(verificationGasLimit),
        },
      },
      txMaxRetries: 5,
      txRetryMultiplier: 3,
    };

    const smartAccountClient = createSmartAccountClient({
      // @ts-expect-error library issue
      transport,
      // @ts-expect-error library issue
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      chain: CHAIN,
      // @ts-expect-error library issue
      account: multiSigSmartAccount,
      opts: CLIENT_OPT,
    });

    const uoStruct = await smartAccountClient.buildUserOperation({
      // @ts-expect-error library issue
      account: multiSigSmartAccount,
      // @ts-expect-error library issue
      uo: {
        data: '0x',
        target: receiver,
        value: parseUnits(amount, blockchainConfig.decimals),
      },
    });
    console.log(uoStruct);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const uoStructHexlified = deepHexlify(uoStruct);
    const uoStructHash = multiSigSmartAccount
      .getEntryPoint()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .getUserOperationHash(uoStructHexlified);
    const multiSigUserOp = new accountAbstraction.userOperation.MultiSigUserOp(
      publicKeys,
      [publicNonces1, publicNoncesKey],
      uoStructHash,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      uoStructHexlified,
    );
    multiSigUserOp.signMultiSigHash(schnorrSigner1); // we post this to our server
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return JSON.stringify(multiSigUserOp.toJson());
  } catch (error) {
    console.log(error);
    throw error;
  }
}
