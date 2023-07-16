import utxolib from 'utxo-lib';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { Buffer } from 'buffer';
import { utxo } from '../types';

export async function fetchUtxos(
  address: string,
  api: string,
): Promise<utxo[]> {
  try {
    const url = `https://${api}/api/addr/${address}/utxo`;
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
  chain = 'flux',
): string | null {
  try {
    const network = utxolib.networks[chain];
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
    return null;
  }
}

function getValueHexBuffer(hex: string) {
  const buf = Buffer.from(hex, 'hex').reverse();
  return buf.toString('hex');
}

export function signTransaction(
  rawTx: string,
  chain = 'flux',
  privateKey: string,
  redeemScript: string,
  utxos: utxo[], // same or bigger set than was used to construct the tx
): string | null {
  try {
    const network = utxolib.networks[chain];
    const txhex = rawTx;
    const hashType = utxolib.Transaction.SIGHASH_ALL;
    const keyPair = utxolib.ECPair.fromWIF(privateKey, network);
    const txb = utxolib.TransactionBuilder.fromTransaction(
      utxolib.Transaction.fromHex(txhex, network),
      network,
    );
    // eslint-disable-next-line no-unused-vars
    for (let i = 0; i < txb.inputs.length; i += 1) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const hashHex = (txb.tx.ins[i].hash as Buffer).toString('hex');
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
        utxoFound.satoshis,
      );
    }
    const tx = txb.buildIncomplete();
    const signedTx = tx.toHex();
    return signedTx;
  } catch (e) {
    console.log(e);
    return null;
  }
}

// entire utxo set will be used to construct the tx, amount, fee is in satoshi represented as string
export function buildUnsignedRawTx(
  chain = 'flux',
  utxos: utxo[],
  receiver: string,
  amount: string,
  fee: string,
  change: string,
  message: string,
): string | null {
  try {
    const network = utxolib.networks[chain];
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

    recipients.forEach((x) => txb.addOutput(x.address, x.satoshis)); // TOOD check if lib can accept string

    if (message) {
      const data = Buffer.from(message, 'utf8');
      const dataScript = utxolib.script.nullData.output.encode(data);
      txb.addOutput(dataScript, '0');
    }

    const tx = txb.buildIncomplete();
    const txhex = tx.toHex();
    return txhex;
  } catch (e) {
    console.log(e);
    return null;
  }
}
