import axios from 'axios';
import BigNumber from 'bignumber.js';
import utxolib from '@runonflux/utxo-lib';
import { toCashAddress } from 'bchaddrjs';
import {
  transacitonsInsight,
  transactionInsight,
  transacitonsBlockbook,
  transactionBlockbook,
  transaction,
  cryptos,
  txIdentifier,
  evm_call_txs,
  evm_transfer,
  etherscan_call_internal_txs,
  etherscan_call_external_txs,
  etherscan_internal_tx,
  etherscan_external_tx,
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

  let receiver = address;

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
      } else if (jsonvout.scriptPubKey.addresses[0]) {
        receiver = jsonvout.scriptPubKey.addresses[0];
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

  const fee = new BigNumber(insightTx.fees || 0).multipliedBy(
    new BigNumber(10 ** decimals),
  );
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
    receiver,
  };
  if (!insightTx.blockheight || insightTx.blockheight <= 0) {
    // add utxos
    const utxos: txIdentifier[] = [];
    vins.forEach((vin) => {
      const utxo = {
        txid: vin.txid,
        vout: vin.vout ?? vin.n,
      };
      utxos.push(utxo);
    });
    tx.utxos = utxos;
  }
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

  let receiver = address;

  while (numberofvouts > 0) {
    numberofvouts -= 1;
    const jsonvout = vouts[numberofvouts];
    if (jsonvout.isAddress && jsonvout.addresses[0] === address) {
      // my address is receiving
      const amountReceived = new BigNumber(jsonvout.value);
      amountReceivedInItx = amountReceivedInItx.plus(amountReceived);
    } else if (jsonvout.isAddress && jsonvout.addresses[0]) {
      receiver = jsonvout.addresses[0];
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

  const fee = new BigNumber(blockbookTx.fees || 0);
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
    receiver,
  };

  if (!blockbookTx.blockHeight || blockbookTx.blockHeight <= 0) {
    // add utxos
    const utxos: txIdentifier[] = [];
    vins.forEach((vin) => {
      const utxo = {
        txid: vin.txid,
        vout: vin.vout ?? vin.n,
      };
      utxos.push(utxo);
    });
    tx.utxos = utxos;
  }
  return tx;
}

export function processTransactionEVM(
  transfer: evm_transfer,
  decimals: number,
): transaction {
  const amount = new BigNumber(transfer.value).multipliedBy(
    new BigNumber(10 ** decimals),
  );
  const tx: transaction = {
    txid: transfer.hash,
    fee: '0',
    blockheight: parseInt(transfer.blockNum, 16),
    timestamp: new Date(transfer.metadata.blockTimestamp).getTime(),
    amount: amount.toFixed(),
    message: '',
    size: 0,
    vsize: 0,
    receiver: transfer.to,
  };
  return tx;
}

export function processTransactionScan(
  transaction: etherscan_external_tx | etherscan_internal_tx,
  address: string,
): transaction {
  // const isErrortx = Number(tx.isError);
  // const myTimeStamp = tx.timeStamp;
  // const valueFull = tx.value;
  // const { gasUsed, gasPrice, confirmations, hash: txid, input: hexx, contractAddress, blockNumber, value } = tx;
  // const totalGas = gasUsed === "0" ? 0 : (parseInt(gasUsed) * parseInt(gasPrice)) / 10e17;

  // let myConfirmations = confirmations ? Number(confirmations) : 1;
  // const internalTx = !confirmations;
  let amount = transaction.value;
  if (address.toLowerCase() !== transaction.to.toLowerCase()) {
    amount = '-' + amount;
  }
  const tx: transaction = {
    txid: transaction.hash,
    fee: '0',
    blockheight: Number(transaction.blockNumber),
    timestamp: Number(transaction.timeStamp) * 1000,
    amount,
    message: '',
    size: 0,
    vsize: 0,
    receiver: transaction.to,
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
    if (blockchains[chain].chainType === 'evm') {
      const params = {
        module: 'account',
        startblock: 0,
        endblock: 99999999,
        page: 1,
        offset: to - from,
        sort: 'desc',
        apiKey: 'APIKEy',
        address,
        action: 'txlist',
      };

      const url = `https://${backendConfig.api}`;

      const responseExternal = await axios.get<etherscan_call_external_txs>(
        url,
        { params },
      );
      const externalTxs = responseExternal.data.result;
      params.action = 'txlistinternal';
      const responseInternal = await axios.get<etherscan_call_internal_txs>(
        url,
        { params },
      );
      const internalTxs = responseInternal.data.result;

      const allTransactions = [...externalTxs, ...internalTxs];

      const txs = [];
      for (const tx of allTransactions) {
        // transfers to alchemy entrypoint disregard - that is a fee. Transfer to no to disregard that is contract creation. TODO this is fee we paying, fix tx processing
        if (
          !tx.to ||
          tx.to.toLowerCase() ===
            blockchains[chain].entrypointAddress.toLowerCase()
        ) {
          continue;
        }
        const processedTransaction = processTransactionScan(tx, address);
        txs.push(processedTransaction);
      }
      return txs.sort((a, b) => b.timestamp - a.timestamp);
    }
    if (blockchains[chain].chainType === 'evmv') {
      const url = `https://${backendConfig.api}`;
      const amount = to - from;
      const amountInHex = '0x' + amount.toString(16);
      const data = {
        id: Date.now(),
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [
          {
            // fromAddress: address,
            toAddress: address,
            maxCount: amountInHex,
            category: ['external'],
            withMetadata: true,
          },
        ],
      };
      const response = await axios.post<evm_call_txs>(url, data);
      const txs = [];
      for (const tx of response.data.result.transfers) {
        const processedTransaction = processTransactionEVM(
          tx,
          blockchains[chain].decimals,
        );
        txs.push(processedTransaction);
      }
      // this shall me two calls one with fromAddress, second with toAddress
      console.log(response.data.result.transfers);
      return txs;
    } else if (blockchains[chain].backend === 'blockbook') {
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
        const processedTransaction = processTransaction(
          tx,
          address,
          blockchains[chain].decimals,
        );
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
    const cashAddrPrefix = blockchains[chain].cashaddr;
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
    if (cashAddrPrefix) {
      senderAddress = toCashAddress(senderAddress);
      txReceiver = toCashAddress(txReceiver);
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
