import axios from 'axios';
import BigNumber from 'bignumber.js';
import utxolib from '@runonflux/utxo-lib';
import {
  transacitonsInsight,
  transactionInsight,
  transacitonsBlockbook,
  transactionBlockbook,
  transaction,
  cryptos,
} from '../types';

import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';

export function getLibId(chain: keyof cryptos): string {
  return blockchains[chain].libid;
}

function decodeMessage(asm: string) {
  const parts = asm.split('OP_RETURN ', 2);
  let message = '';
  if (parts[1]) {
    const encodedMessage = parts[1];
    const hexx = encodedMessage.toString(); // force conversion
    for (let k = 0; k < hexx.length && hexx.slice(k, k + 2) !== '00'; k += 2) {
      message += String.fromCharCode(parseInt(hexx.slice(k, k + 2), 16));
    }
  }
  return message;
}

function processTransaction(
  insightTx: transactionInsight,
  address: string,
  decimals: number,
): transaction {
  const vins = insightTx.vin;
  const vouts = insightTx.vout;

  let numberofvins = vins.length;
  let numberofvouts = vouts.length;

  let message = '';

  let amountSentInItx = new BigNumber(0);
  let amountReceivedInItx = new BigNumber(0);
  while (numberofvins > 0) {
    numberofvins -= 1;
    const jsonvin = vins[numberofvins];
    if (jsonvin.addr && jsonvin.addr === address) {
      // my address is sending
      const satsSent = new BigNumber(jsonvin.value).multipliedBy(
        new BigNumber(10 ** decimals),
      );
      amountSentInItx = amountSentInItx.plus(satsSent);
    }
  }

  while (numberofvouts > 0) {
    numberofvouts -= 1;
    const jsonvout = vouts[numberofvouts];
    if (jsonvout.scriptPubKey.addresses) {
      if (jsonvout.scriptPubKey.addresses[0] === address) {
        // my address is receiving
        const amountReceived = new BigNumber(jsonvout.value).multipliedBy(
          new BigNumber(10 ** decimals),
        );
        amountReceivedInItx = amountReceivedInItx.plus(amountReceived);
      }
    }
    // check message
    if (jsonvout.scriptPubKey.asm) {
      const decodedMessage = decodeMessage(jsonvout.scriptPubKey.asm);
      if (decodedMessage) {
        message = decodedMessage;
      }
    }
  }

  const fee = new BigNumber(insightTx.fees).multipliedBy(new BigNumber(10 ** decimals));
  let amount = amountReceivedInItx.minus(amountSentInItx);
  if (amount.isNegative()) {
    amount = amount.plus(fee); // we were the ones sending fee
  }

  const tx: transaction = {
    txid: insightTx.txid,
    fee: fee.toFixed(),
    blockheight: insightTx.blockheight,
    timestamp: insightTx.time * 1000,
    amount: amount.toFixed(),
    message,
    size: insightTx.size,
    vsize: insightTx.vsize,
  };
  return tx;
}

function processTransactionBlockbook(
  blockbookTx: transactionBlockbook,
  address: string,
): transaction {
  const vins = blockbookTx.vin;
  const vouts = blockbookTx.vout;

  let numberofvins = vins.length;
  let numberofvouts = vouts.length;

  let message = '';

  let amountSentInItx = new BigNumber(0);
  let amountReceivedInItx = new BigNumber(0);
  while (numberofvins > 0) {
    numberofvins -= 1;
    const jsonvin = vins[numberofvins];
    if (jsonvin.isAddress && jsonvin.addresses[0] === address) {
      // my address is sending
      const satsSent = new BigNumber(jsonvin.value);
      amountSentInItx = amountSentInItx.plus(satsSent);
    }
  }

  while (numberofvouts > 0) {
    numberofvouts -= 1;
    const jsonvout = vouts[numberofvouts];
    if (jsonvout.isAddress && jsonvout.addresses[0] === address) {
      // my address is receiving
      const amountReceived = new BigNumber(jsonvout.value);
      amountReceivedInItx = amountReceivedInItx.plus(amountReceived);
    }
    // check message
    if (!jsonvout.isAddress) {
      const mess = jsonvout.addresses[0];
      const messSplit = mess.split('OP_RETURN (');
      if (messSplit[1]) {
        message = messSplit[1].slice(0, -1);
      }
    }
  }

  const fee = new BigNumber(blockbookTx.fees);
  let amount = amountReceivedInItx.minus(amountSentInItx);
  if (amount.isNegative()) {
    amount = amount.plus(fee); // we were the ones sending fee
  }

  const time = blockbookTx.blockTime || new Date().getTime() / 1000;

  const tx: transaction = {
    txid: blockbookTx.txid,
    fee: fee.toFixed(),
    blockheight: blockbookTx.blockHeight,
    timestamp: time * 1000,
    amount: amount.toFixed(),
    message,
    size: blockbookTx.size,
    vsize: blockbookTx.vsize,
  };
  return tx;
}

export async function fetchAddressTransactions(
  address: string,
  chain: keyof cryptos,
  from: number,
  to: number,
): Promise<transaction[]> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].backend === 'blockbook') {
      const pageSize = to - from;
      const page = Math.round(from / pageSize);
      const url = `https://${backendConfig.node}/api/v2/address/${address}?pageSize=${pageSize}&details=txs&page=${page}`;
      const response = await axios.get<transacitonsBlockbook>(url);
      const txs = [];
      for (const tx of response.data.transactions || []) {
        const processedTransaction = processTransactionBlockbook(tx, address);
        txs.push(processedTransaction);
      }
      return txs;
    } else {
      const url = `https://${backendConfig.node}/api/addrs/${address}/txs?from=${from}&to=${to}`;
      const response = await axios.get<transacitonsInsight>(url);
      const txs = [];
      for (const tx of response.data.items || []) {
        const processedTransaction = processTransaction(tx, address, blockchains[chain].decimals);
        txs.push(processedTransaction);
      }
      return txs;
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}

interface output {
  script: Buffer;
  value: number;
}

export function decodeTransactionForApproval(
  rawTx: string,
  chain: keyof cryptos,
) {
  try {
    const libID = getLibId(chain);
    const decimals = blockchains[chain].decimals;
    const network = utxolib.networks[libID];
    const txhex = rawTx;
    const txb = utxolib.TransactionBuilder.fromTransaction(
      utxolib.Transaction.fromHex(txhex, network),
      network,
    );
    let txReceiver = 'decodingError';
    let amount = '0';
    let senderAddress = '';

    if (txb.inputs[0].witnessScript && txb.inputs[0].redeemScript) {
      // p2sh-p2wsh
      const scriptPubKey = utxolib.script.scriptHash.output.encode(
        utxolib.crypto.hash160(txb.inputs[0].redeemScript),
      );
      senderAddress = utxolib.address.fromOutputScript(scriptPubKey, network);
    } else if (txb.inputs[0].witnessScript) {
      // p2wsh
      const scriptPubKey = utxolib.script.witnessScriptHash.output.encode(
        utxolib.crypto.sha256(txb.inputs[0].witnessScript),
      );
      senderAddress = utxolib.address.fromOutputScript(scriptPubKey, network);
    } else {
      // p2sh
      const scriptPubKey = utxolib.script.scriptHash.output.encode(
        utxolib.crypto.hash160(txb.inputs[0].redeemScript),
      );
      senderAddress = utxolib.address.fromOutputScript(scriptPubKey, network);
    }

    txb.tx.outs.forEach((out: output) => {
      if (out.value) {
        const address = utxolib.address.fromOutputScript(out.script, network);
        if (address !== senderAddress) {
          txReceiver = address;
          amount = new BigNumber(out.value)
            .dividedBy(new BigNumber(10 ** decimals))
            .toFixed();
        }
      }
    });
    if (txReceiver === 'decodingError') {
      // use first output as being the receiver
      const outOne = txb.tx.outs[0];
      if (outOne.value) {
        const address = utxolib.address.fromOutputScript(
          outOne.script,
          network,
        );
        txReceiver = address;
        amount = new BigNumber(outOne.value)
          .dividedBy(new BigNumber(10 ** decimals))
          .toFixed();
      }
    }
    const txInfo = {
      sender: senderAddress,
      receiver: txReceiver,
      amount,
    };
    return txInfo;
  } catch (error) {
    console.log(error);
    const txInfo = {
      sender: 'decodingError',
      receiver: 'decodingError',
      amount: 'decodingError',
    };
    return txInfo;
  }
}