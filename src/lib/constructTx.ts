import utxolib from 'utxo-lib';
import { Buffer } from 'buffer';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { utxo, broadcastTxResult, cryptos } from '../types';

import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';

export function getLibId(chain: keyof cryptos): string {
  return blockchains[chain].libid;
}

export async function fetchUtxos(
  address: string,
  chain: string,
): Promise<utxo[]> {
  try {
    const backendConfig = backends()[chain];
    const url = `https://${backendConfig.node}/api/addr/${address}/utxo`;
    const { data } = await axios.get<utxo[]>(url);
    const fetchedUtxos = data;
    const utxos = fetchedUtxos.map((x) => ({
      txid: x.txid,
      vout: x.vout,
      scriptPubKey: x.scriptPubKey,
      satoshis: x.satoshis.toString(),
    }));
    return utxos;
  } catch (e) {
    console.log(e);
    return [];
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
  utxos: utxo[], // same or bi gger set than was used to construct the tx
): string {
  try {
    const libID = getLibId(chain);
    const network = utxolib.networks[libID];
    const txhex = rawTx;
    const hashType = utxolib.Transaction.SIGHASH_ALL;
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
      txb.sign(
        i,
        keyPair,
        Buffer.from(redeemScript, 'hex'),
        hashType,
        new BigNumber(utxoFound.satoshis).toNumber(),
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
): string {
  try {
    const libID = getLibId(chain);
    const network = utxolib.networks[libID];
    const txb = new utxolib.TransactionBuilder(network, fee);
    txb.setVersion(4);
    txb.setVersionGroupId(0x892f2085);
    utxos.forEach((x) => txb.addInput(x.txid, x.vout));
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
      recipients.push({
        address: change,
        satoshis: totalUtxoValue.minus(totalAmountOutgoing).toFixed(),
      });
    }

    // library accepts it as integer. BN is capped with max safe integer, throws otherwise
    recipients.forEach((x) =>
      txb.addOutput(x.address, new BigNumber(x.satoshis).toNumber()),
    );

    if (message) {
      const data = Buffer.from(message, 'utf8');
      const dataScript = utxolib.script.nullData.output.encode(data);
      txb.addOutput(dataScript, 0);
    }

    const tx = txb.buildIncomplete();
    const txhex = tx.toHex();
    return txhex;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

function pickUtxos(utxos: utxo[], amount: BigNumber): utxo[] {
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
    return utxoAmount.isGreaterThan(amount);
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
  if (totalAmountSmallerUtxos.isGreaterThan(amount)) {
    let totalAmount = new BigNumber(0);
    const preselectedUtxos = [];
    for (const utxoX of utxosSmallerThanTarget) {
      totalAmount = totalAmount.plus(new BigNumber(utxoX.satoshis));
      preselectedUtxos.push(utxoX);
      if (totalAmount.isGreaterThan(amount)) {
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
  if (totalAmountSmallerUtxos.isGreaterThan(amount)) {
    let totalAmount = new BigNumber(0);
    const preselectedUtxos = [];
    for (const utxoX of utxosSmallerThanTarget.reverse()) {
      totalAmount = totalAmount.plus(new BigNumber(utxoX.satoshis));
      preselectedUtxos.push(utxoX);
      if (totalAmount.isGreaterThan(amount)) {
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
  if (totalAmountSmallerUtxos.isGreaterThan(amount)) {
    let totalAmount = new BigNumber(0);
    const preselectedUtxos = [];
    for (const utxoX of utxosSmallerThanTarget.reverse()) {
      totalAmount = totalAmount.plus(new BigNumber(utxoX.satoshis));
      preselectedUtxos.push(utxoX);
      if (totalAmount.isGreaterThan(amount)) {
        selectedUtxos = preselectedUtxos;
        break;
      }
    }
  }
  return selectedUtxos;
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
): Promise<string> {
  try {
    const utxos = await fetchUtxos(sender, chain);
    const amountToSend = new BigNumber(amount).plus(new BigNumber(fee));
    const pickedUtxos = pickUtxos(utxos, amountToSend);
    const rawTx = buildUnsignedRawTx(
      chain,
      pickedUtxos,
      receiver,
      amount,
      fee,
      change,
      message,
    );
    if (!rawTx) {
      throw new Error('Could not construct raw tx');
    }
    const signedTx = signTransaction(
      rawTx,
      chain,
      privateKey,
      redeemScript,
      utxos,
    );
    if (!signedTx) {
      throw new Error('Could not sign tx');
    }
    // wallet is NOT finalising the transaction, the KEY is finalising the transaction
    return signedTx;
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
    const url = `https://${backendConfig.node}/api/tx/send`;
    const response = await axios.post<broadcastTxResult>(url, { rawtx: txHex });
    return response.data.txid;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
