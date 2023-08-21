import axios from 'axios';
import BigNumber from 'bignumber.js';
import utxolib from 'utxo-lib';
import { transacitonsInsight, transactionInsight, transaction } from '../types';

import { blockchains } from '@storage/blockchains';

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
        new BigNumber(1e8),
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
          new BigNumber(1e8),
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

  const fee = new BigNumber(insightTx.fees).multipliedBy(new BigNumber(1e8));
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
  };
  return tx;
}

export async function fetchAddressTransactions(
  address: string,
  chain = 'flux',
  from: number,
  to: number,
): Promise<transaction[]> {
  try {
    const blockchainConfig = blockchains[chain];
    const url = `https://${blockchainConfig.node}/api/addrs/${address}/txs?from=${from}&to=${to}`;
    const response = await axios.get<transacitonsInsight>(url);
    const txs = [];
    for (const tx of response.data.items) {
      const processedTransaction = processTransaction(tx, address);
      txs.push(processedTransaction);
    }
    return txs;
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
  myAddress: string,
  chain = 'flux',
) {
  const network = utxolib.networks[chain];
  const txhex = rawTx;
  const txb = utxolib.TransactionBuilder.fromTransaction(
    utxolib.Transaction.fromHex(txhex, network),
    network,
  );
  console.log(JSON.stringify(txb));
  let txReceiver = '';
  let amount = '0';
  txb.tx.outs.forEach((out: output) => {
    if (out.value) {
      const address = utxolib.address.fromOutputScript(out.script, network);
      console.log(address);
      if (address !== myAddress) {
        txReceiver = address;
        amount = new BigNumber(out.value)
          .dividedBy(new BigNumber(1e8))
          .toFixed();
      }
    }
  });
  const txInfo = {
    receiver: txReceiver,
    amount,
  };
  return txInfo;
}
