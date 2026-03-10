import axios from 'axios';
import BigNumber from 'bignumber.js';
import utxolib from '@runonflux/utxo-lib';
import { decodeFunctionData, erc20Abi } from 'viem';
import * as abi from '@runonflux/aa-schnorr-multisig-sdk/dist/abi';
import { toCashAddress } from 'bchaddrjs';
import {
  transacitonsInsight,
  transactionInsight,
  transacitonsBlockbook,
  transactionBlockbook,
  transaction,
  csvTransaction,
  cryptos,
  txIdentifier,
  etherscan_call_internal_txs,
  etherscan_call_external_txs,
  etherscan_call_token_txs,
  etherscan_internal_tx,
  etherscan_external_tx,
  etherscan_token_tx,
} from '../types';

import { backends } from '@storage/backends';
import { blockchains, Token } from '@storage/blockchains';

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
      const decodedMessage = decodeMessage(jsonvout.scriptPubKey.asm || '');
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
      const mess = jsonvout.addresses[0] || '';
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

// if I am receiving, we take blockchain fee as a fee. If I am sending, we show total fee.
export function processTransactionTokenScan(
  tx: etherscan_token_tx,
  address: string,
): transaction {
  let amount = tx.value;
  if (address.toLowerCase() !== tx.to.toLowerCase()) {
    amount = '-' + amount;
  }
  const { gasUsed, gasPrice } = tx;
  const totalGas = new BigNumber(gasUsed).multipliedBy(new BigNumber(gasPrice));
  const tran: transaction = {
    type: 'evm',
    txid: tx.hash,
    fee: totalGas.toFixed(),
    blockheight: Number(tx.blockNumber),
    timestamp: Number(tx.timeStamp) * 1000,
    amount,
    message: '',
    receiver: tx.to,
    isError: false,
    decimals: Number(tx.tokenDecimal),
    tokenSymbol: tx.tokenSymbol,
    contractAddress: tx.contractAddress,
  };
  return tran;
}

export function processTransactionsTokensScan(
  transactions: etherscan_token_tx[],
  address: string,
): transaction[] {
  const txs = [];
  for (const tx of transactions) {
    const processedTransaction = processTransactionTokenScan(tx, address);
    txs.push(processedTransaction);
  }
  return txs;
}

// if I am receiving, we take blockchain fee as a fee. If I am sending, we show total fee.
export function processTransactionInternalScan(
  txGroup: etherscan_internal_tx[],
  address: string,
  chain: keyof cryptos,
): transaction {
  const tran: transaction = {
    type: 'evm',
    txid: txGroup[0].hash,
    blockheight: Number(txGroup[0].blockNumber),
    timestamp: Number(txGroup[0].timeStamp) * 1000,
    message: '',
    isError: !!txGroup[0].isError,
    receiver: '',
    fee: '0',
    amount: '0',
  };

  let amountSending = new BigNumber(0);
  let amountReceiving = new BigNumber(0);

  for (const tx of txGroup) {
    if (!tx.to) {
      continue;
    }
    if (tx.from.toLowerCase() === address.toLowerCase()) {
      if (
        tx.to.toLowerCase() ===
        blockchains[chain].entrypointAddress.toLowerCase()
      ) {
        tran.fee = new BigNumber(tran.fee)
          .plus(new BigNumber(tx.value))
          .toFixed();
      } else {
        amountSending = amountSending.plus(new BigNumber(tx.value));
      }
    }
    if (tx.to.toLowerCase() === address.toLowerCase()) {
      amountReceiving = amountReceiving.plus(new BigNumber(tx.value));
    }
    if (
      tx.to.toLowerCase() !== blockchains[chain].entrypointAddress.toLowerCase()
    ) {
      tran.receiver = tx.to;
    }
  }

  const totalAmount = amountReceiving.minus(amountSending);
  tran.amount = totalAmount.toFixed();
  return tran;
}

export function processTransactionsInternalScan(
  transactions: etherscan_internal_tx[],
  address: string,
  chain: keyof cryptos,
): transaction[] {
  const txs = [];
  const groupedTxs: Record<string, etherscan_internal_tx[]> = {};
  // if hash is the same, treat it as one transaction
  for (const tx of transactions) {
    if (!groupedTxs[tx.hash]) {
      groupedTxs[tx.hash] = [tx];
    } else {
      groupedTxs[tx.hash].push(tx);
    }
  }
  for (const txGroup of Object.keys(groupedTxs)) {
    const processedTransaction = processTransactionInternalScan(
      groupedTxs[txGroup],
      address,
      chain,
    );
    txs.push(processedTransaction);
  }
  return txs;
}

export function processTransactionExternalScan(
  tx: etherscan_external_tx,
  address: string,
): transaction {
  let amount = tx.value;
  if (address.toLowerCase() !== tx.to.toLowerCase()) {
    amount = '-' + amount;
  }
  const { gasUsed, gasPrice } = tx;
  const totalGas = new BigNumber(gasUsed).multipliedBy(new BigNumber(gasPrice));
  const tran: transaction = {
    type: 'evm',
    txid: tx.hash,
    fee: totalGas.toFixed(),
    blockheight: Number(tx.blockNumber),
    timestamp: Number(tx.timeStamp) * 1000,
    amount,
    message: '',
    receiver: tx.to,
    isError: !!tx.isError,
  };
  return tran;
}

export function processTransactionsExternalScan(
  transactions: etherscan_external_tx[],
  address: string,
): transaction[] {
  const txs = [];
  for (const tx of transactions) {
    const processedTransaction = processTransactionExternalScan(tx, address);
    txs.push(processedTransaction);
  }
  return txs;
}

export async function fetchAddressTransactions(
  address: string,
  chain: keyof cryptos,
  from: number,
  to: number,
  page = 1,
): Promise<transaction[]> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].chainType === 'evm') {
      const params = {
        module: 'account',
        startblock: 0,
        endblock: 99999999,
        page: page,
        offset: to - from, // number of txs per page
        sort: 'desc',
        address,
        action: 'txlist',
      };

      const url = `https://${backendConfig.api}`;

      const responseExternal = await axios.get<etherscan_call_external_txs>(
        url,
        { params },
      );
      const externalTxs = responseExternal.data.result;
      const externalTxsProcessed = processTransactionsExternalScan(
        externalTxs,
        address,
      );

      params.action = 'txlistinternal';
      const responseInternal = await axios.get<etherscan_call_internal_txs>(
        url,
        { params },
      );
      const internalTxs = responseInternal.data.result;
      const internalTxsProcessed = processTransactionsInternalScan(
        internalTxs,
        address,
        chain,
      );

      params.action = 'tokentx';
      const responseTokens = await axios.get<etherscan_call_token_txs>(url, {
        params,
      });
      const tokenTxs = responseTokens.data.result;
      const tokenTxsProcessed = processTransactionsTokensScan(
        tokenTxs,
        address,
      );

      let allTransactions = [...externalTxsProcessed, ...internalTxsProcessed];

      // replace allTransactions transaction with tokenTxsProcessed transaction in case that it is the same txid and value of allTransactions transaction is 0
      for (const tx of tokenTxsProcessed) {
        if (
          allTransactions.find((t) => t.txid === tx.txid && t.amount === '0')
        ) {
          allTransactions = allTransactions.map((t) =>
            t.txid === tx.txid ? tx : t,
          );
        } else {
          allTransactions.push(tx);
        }
      }

      return allTransactions.sort((a, b) => b.timestamp - a.timestamp);
    } else if (blockchains[chain].backend === 'blockbook') {
      const pageSize = to - from;
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

export async function fetchAllAddressTransactions(
  address: string,
  chain: keyof cryptos,
): Promise<transaction[]> {
  const txs = [];
  let page = 1;
  let from = 0;
  let to = 50;
  let txsPage: transaction[] = [];
  do {
    txsPage = await fetchAddressTransactions(address, chain, from, to, page); // 50 txs per page is maximum usually
    if (txsPage) {
      txs.push(...txsPage);
      page++;
      from = to;
      to = to + 50;
    }
  } while (txsPage.length >= 50 || page === 1);
  return txs;
}

export interface VaultDecodedRecipient {
  address: string;
  amount: string; // base units (satoshis / wei)
}

export interface VaultDecodedTx {
  sender: string;
  recipients: VaultDecodedRecipient[];
  fee: string; // base units
  tokenSymbol?: string;
  tokenContract?: string;
  tokenDecimals?: number;
  error?: string;
}

/**
 * Decode a vault transaction from raw TX data for independent verification.
 * Unlike decodeTransactionForApproval() which handles single-recipient legacy 2-of-2,
 * this supports multiple recipients (enterprise vaults) and returns base-unit amounts.
 *
 * UTXO: decodes TX hex → extracts all non-change outputs as recipients.
 * EVM: parses UserOperation JSON → decodes callData → extracts execute/transfer.
 *
 * @param rawTx - Raw unsigned TX hex (UTXO) or UserOperation JSON string (EVM)
 * @param chain - Blockchain identifier
 * @param inputAmounts - Per-input amounts in base units (for UTXO fee calculation)
 * @param importedTokens - User-imported tokens for ERC-20 symbol lookup (wallet only)
 */
export function decodeVaultTransaction(
  rawTx: string,
  chain: keyof cryptos,
  inputAmounts: string[] = [],
  importedTokens: Token[] = [],
  inputScripts?: { witnessScript?: string; redeemScript?: string },
): VaultDecodedTx {
  try {
    if (blockchains[chain].chainType === 'evm') {
      return decodeVaultEvmTransaction(rawTx, chain, importedTokens);
    }
    return decodeVaultUtxoTransaction(rawTx, chain, inputAmounts, inputScripts);
  } catch (error) {
    return {
      sender: '',
      recipients: [],
      fee: '0',
      error:
        error instanceof Error ? error.message : 'Failed to decode transaction',
    };
  }
}

function decodeVaultUtxoTransaction(
  rawTx: string,
  chain: keyof cryptos,
  inputAmounts: string[],
  inputScripts?: { witnessScript?: string; redeemScript?: string },
): VaultDecodedTx {
  const libID = getLibId(chain);
  const cashAddrPrefix = blockchains[chain].cashaddr;
  const network = utxolib.networks[libID];

  const txb = utxolib.TransactionBuilder.fromTransaction(
    utxolib.Transaction.fromHex(rawTx, network),
    network,
  );

  // Derive sender address from first input's script.
  // For unsigned TXs the scripts aren't embedded in the raw hex, so we also
  // accept them from inputDetails metadata (witnessScript/redeemScript from
  // the vault address generation, stored in the proposal).
  let senderAddress = '';

  // Try scripts from the raw TX first (available for partially-signed TXs)
  const txWitnessScript = txb.inputs[0].witnessScript;
  const txRedeemScript = txb.inputs[0].redeemScript;

  // Fall back to scripts from inputDetails metadata (always available)
  const witnessScript =
    txWitnessScript ||
    (inputScripts?.witnessScript
      ? Buffer.from(inputScripts.witnessScript, 'hex')
      : undefined);
  const redeemScript =
    txRedeemScript ||
    (inputScripts?.redeemScript
      ? Buffer.from(inputScripts.redeemScript, 'hex')
      : undefined);

  if (witnessScript && redeemScript) {
    // P2SH-P2WSH
    const scriptPubKey = utxolib.script.scriptHash.output.encode(
      utxolib.crypto.hash160(redeemScript),
    );
    senderAddress = utxolib.address.fromOutputScript(scriptPubKey, network);
  } else if (witnessScript) {
    // P2WSH
    const scriptPubKey = utxolib.script.witnessScriptHash.output.encode(
      utxolib.crypto.sha256(witnessScript),
    );
    senderAddress = utxolib.address.fromOutputScript(scriptPubKey, network);
  } else if (redeemScript) {
    // P2SH
    const scriptPubKey = utxolib.script.scriptHash.output.encode(
      utxolib.crypto.hash160(redeemScript),
    );
    senderAddress = utxolib.address.fromOutputScript(scriptPubKey, network);
  }

  // Extract all outputs — separate recipients from change
  const recipients: VaultDecodedRecipient[] = [];
  let totalOutputValue = new BigNumber(0);

  txb.tx.outs.forEach((out: output) => {
    if (out.value) {
      let address = utxolib.address.fromOutputScript(out.script, network);
      if (cashAddrPrefix) {
        address = toCashAddress(address);
      }
      totalOutputValue = totalOutputValue.plus(new BigNumber(out.value));
      // Outputs not matching sender are recipients; change goes back to sender
      let senderAddr = senderAddress;
      if (cashAddrPrefix) {
        senderAddr = toCashAddress(senderAddress);
      }
      if (address !== senderAddr) {
        recipients.push({
          address,
          amount: String(out.value),
        });
      }
    }
  });

  // Calculate fee: sum(inputs) - sum(outputs)
  let fee = '0';
  if (inputAmounts.length > 0) {
    const totalInputs = inputAmounts.reduce(
      (sum, a) => sum.plus(new BigNumber(a)),
      new BigNumber(0),
    );
    fee = totalInputs.minus(totalOutputValue).toFixed();
  }

  if (cashAddrPrefix && senderAddress) {
    senderAddress = toCashAddress(senderAddress);
  }

  return { sender: senderAddress, recipients, fee };
}

function decodeVaultEvmTransaction(
  rawTx: string,
  chain: keyof cryptos,
  importedTokens: Token[] = [],
): VaultDecodedTx {
  const multisigUserOpJSON = JSON.parse(rawTx) as userOperation;

  if (!multisigUserOpJSON.userOpRequest) {
    throw new Error('Invalid transaction format: missing userOpRequest');
  }

  const {
    callData,
    sender,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  } = multisigUserOpJSON.userOpRequest;

  // Calculate fee in base units (wei)
  const totalGasLimit = new BigNumber(callGasLimit)
    .plus(new BigNumber(verificationGasLimit))
    .plus(new BigNumber(preVerificationGas));
  const totalMaxWeiPerGas = new BigNumber(maxFeePerGas).plus(
    new BigNumber(maxPriorityFeePerGas),
  );
  const fee = totalGasLimit.multipliedBy(totalMaxWeiPerGas).toFixed();

  // Decode callData
  const decodedData = decodeFunctionData({
    abi: abi.MultiSigSmartAccount_abi,
    data: callData,
  }) as decodedAbiData;

  if (
    !decodedData ||
    decodedData.functionName !== 'execute' ||
    !decodedData.args ||
    decodedData.args.length < 3
  ) {
    throw new Error('Unexpected callData format');
  }

  const result: VaultDecodedTx = {
    sender,
    recipients: [],
    fee,
  };

  const executeTarget = decodedData.args[0];
  const executeValue = decodedData.args[1].toString();

  if (executeValue !== '0') {
    // Native transfer
    result.recipients = [{ address: executeTarget, amount: executeValue }];
    result.tokenSymbol = blockchains[chain].symbol;
  } else {
    // ERC-20 token transfer or contract execution
    result.tokenContract = executeTarget;

    // Look up token metadata
    const token = blockchains[chain].tokens
      .concat(importedTokens)
      .find((t) => t.contract.toLowerCase() === executeTarget.toLowerCase());

    if (token) {
      result.tokenSymbol = token.symbol;
      result.tokenDecimals = token.decimals;
    }

    // Decode inner transfer call
    try {
      const contractData: `0x${string}` = decodedData.args[2] as `0x${string}`;
      const decodedContract = decodeFunctionData({
        abi: erc20Abi,
        data: contractData,
      }) as unknown as decodedAbiData;

      if (
        decodedContract &&
        decodedContract.functionName === 'transfer' &&
        decodedContract.args &&
        decodedContract.args.length >= 2
      ) {
        result.recipients = [
          {
            address: decodedContract.args[0],
            amount: decodedContract.args[1].toString(),
          },
        ];
      }
    } catch {
      // Not a standard ERC-20 transfer — contract interaction
      result.recipients = [{ address: executeTarget, amount: '0' }];
    }
  }

  return result;
}

interface output {
  script: Buffer;
  value: number;
}

export async function fetchDataForCSV(
  address: string,
  chain: keyof cryptos,
): Promise<csvTransaction[]> {
  const txs = [];
  let page = 1;
  let from = 0;
  let to = 50;
  let txsPage: transaction[] = [];
  const blockchainConfig = blockchains[chain];
  do {
    txsPage = await fetchAddressTransactions(address, chain, from, to, page); // 50 txs per page is maximum usually
    if (txsPage) {
      txs.push(...txsPage);
      page++;
      from = to;
      to = to + 50;
    }
  } while (txsPage.length >= 50 || page === 1);
  const data = [];
  for (const t of txs) {
    data.push({
      Timestamp: t.timestamp,
      Date: new Date(t.timestamp).toUTCString(),
      'Koinly Date': new Date(t.timestamp).toUTCString(),
      Amount: new BigNumber(t.amount)
        .dividedBy(10 ** (t.decimals ?? blockchainConfig.decimals))
        .toNumber(),
      Currency: t.tokenSymbol || blockchainConfig.symbol,
      'Sent Amount': new BigNumber(t.amount)
        .dividedBy(10 ** (t.decimals ?? blockchainConfig.decimals))
        .isNegative()
        ? new BigNumber(t.amount)
            .dividedBy(10 ** (t.decimals ?? blockchainConfig.decimals))
            .toNumber()
        : 0,
      'Sent Currency': t.tokenSymbol || blockchainConfig.symbol,
      'Received Amount': new BigNumber(t.amount)
        .dividedBy(10 ** (t.decimals ?? blockchainConfig.decimals))
        .isPositive()
        ? new BigNumber(t.amount)
            .dividedBy(10 ** (t.decimals ?? blockchainConfig.decimals))
            .toNumber()
        : 0,
      'Received Currency': t.tokenSymbol || blockchainConfig.symbol,
      'Fee Amount': new BigNumber(t.amount) // ONLY add fee if I am sending to support koinly well
        .dividedBy(10 ** blockchainConfig.decimals)
        .isNegative()
        ? new BigNumber(t.fee)
            .dividedBy(10 ** blockchainConfig.decimals)
            .toNumber()
        : 0,
      'Fee Currency': blockchainConfig.symbol,
      TxHash: t.txid,
      Note: t.message.length > 0 ? t.message : '-',
    });
  }
  return data;
}

export function decodeTransactionForApproval(
  rawTx: string,
  chain: keyof cryptos,
  importedTokens: Token[] = [],
) {
  try {
    if (blockchains[chain].chainType === 'evm') {
      return decodeEVMTransactionForApproval(
        rawTx,
        chain,
        importedTokens ?? [],
      );
    }
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

interface decodedAbiData {
  functionName: string;
  args: [string, bigint, string];
}

interface userOperation {
  userOpRequest: {
    sender: string;
    callData: `0x${string}`;
    callGasLimit: `0x${string}`;
    verificationGasLimit: `0x${string}`;
    preVerificationGas: `0x${string}`;
    maxFeePerGas: `0x${string}`;
    maxPriorityFeePerGas: `0x${string}`;
  };
}

export function decodeEVMTransactionForApproval(
  rawTx: string,
  chain: keyof cryptos,
  importedTokens: Token[] = [],
) {
  try {
    let decimals = blockchains[chain].decimals;
    const multisigUserOpJSON = JSON.parse(rawTx) as userOperation;
    const {
      callData,
      sender,
      callGasLimit,
      verificationGasLimit,
      preVerificationGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    } = multisigUserOpJSON.userOpRequest;

    const totalGasLimit = new BigNumber(callGasLimit)
      .plus(new BigNumber(verificationGasLimit))
      .plus(new BigNumber(preVerificationGas));

    const totalMaxWeiPerGas = new BigNumber(maxFeePerGas).plus(
      new BigNumber(maxPriorityFeePerGas),
    );

    const totalFeeWei = totalGasLimit.multipliedBy(totalMaxWeiPerGas);

    console.log(multisigUserOpJSON);

    // callGasLimit":"0x5ea6","verificationGasLimit":"0x11b5a","preVerificationGas":"0xdf89","maxFeePerGas":"0xee6b28000","maxPriorityFeePerGas":"0x77359400",

    const decodedData: decodedAbiData = decodeFunctionData({
      abi: abi.MultiSigSmartAccount_abi,
      data: callData,
    }) as decodedAbiData; // Cast decodedData to decodedAbiData type.

    let txReceiver = 'decodingError';
    let amount = '0';

    if (
      decodedData &&
      decodedData.functionName === 'execute' &&
      decodedData.args &&
      decodedData.args.length >= 3
    ) {
      txReceiver = decodedData.args[0];
      amount = new BigNumber(decodedData.args[1].toString())
        .dividedBy(new BigNumber(10 ** decimals))
        .toFixed();
    } else {
      throw new Error('Unexpected decoded data.');
    }

    const txInfo = {
      sender,
      receiver: txReceiver,
      amount,
      fee: totalFeeWei.toFixed(),
      token: '',
      tokenSymbol: '',
      decimals: 18,
    };

    if (amount === '0') {
      txInfo.token = decodedData.args[0];

      // find the token in our token list
      const token = blockchains[chain].tokens
        .concat(importedTokens)
        .find((t) => t.contract.toLowerCase() === txInfo.token.toLowerCase());
      if (token) {
        decimals = token.decimals;
        txInfo.tokenSymbol = token.symbol;
        txInfo.decimals = token.decimals;
      }
      const contractData: `0x${string}` = decodedData.args[2] as `0x${string}`;
      // most likely we are dealing with a contract call, sending some erc20 token
      // docode args[2] which is operation
      const decodedDataContract: decodedAbiData = decodeFunctionData({
        abi: erc20Abi,
        data: contractData,
      }) as unknown as decodedAbiData; // Cast decodedDataContract to decodedAbiData type.
      console.log(decodedDataContract);
      if (
        decodedDataContract &&
        decodedDataContract.functionName === 'transfer' &&
        decodedDataContract.args &&
        decodedDataContract.args.length >= 2
      ) {
        txInfo.receiver = decodedDataContract.args[0];
        txInfo.amount = new BigNumber(decodedDataContract.args[1].toString())
          .dividedBy(new BigNumber(10 ** decimals))
          .toFixed();
      }
    } else {
      txInfo.tokenSymbol = blockchains[chain].symbol;
    }

    return txInfo;
  } catch (error) {
    console.log(error);
    const txInfo = {
      sender: 'decodingError',
      receiver: 'decodingError',
      amount: 'decodingError',
      fee: 'decodingError',
      token: 'decodingError',
      tokenSymbol: 'decodingError',
      decimals: 18,
    };
    return txInfo;
  }
}
