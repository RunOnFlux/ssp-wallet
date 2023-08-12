import { Buffer } from 'buffer';
// wallet.tx
export interface minHDKey {
  keyPair: {
    toWIF: () => string;
    getPublicKeyBuffer: () => Buffer;
  };
}

export interface xPrivXpub {
  xpriv: string;
  xpub: string;
}

export interface keyPair {
  privKey: string;
  pubKey: string;
}

export interface multisig {
  address: string;
  redeemScript: string;
}

// transactions.ts
export interface utxo {
  txid: string;
  vout: number;
  scriptPubKey: string;
  satoshis: string;
}

export interface broadcastTxResult {
  txid: string;
}

export interface balance {
  address: string;
  confirmed: string;
  unconfirmed: string;
  totalTransactions?: number;
}

export interface balanceInsight {
  addrStr: string;
  balanceSat: number;
  unconfirmedBalanceSat: number;
  txApperances: number;
}

export interface vin {
  txid: string;
  vout: number;
  sequence: number;
  n: number;
  scriptSig: {
    hes: string;
    asm: string;
  };
  addr: string;
  valueSat: number;
  value: number;
}

export interface vout {
  value: string;
  n: number;
  scriptPubKey: {
    hex: string;
    asm: string;
    addresses: string[];
    type: string;
  };
}
export interface transactionInsight {
  txid: string;
  version: number;
  locktime: number;
  blockhash: string;
  blockheight: number;
  confirmations: number;
  size: number;
  time: number;
  blocktime: number;
  valueOut: number;
  valueIn: number;
  fees: number;
  vin: vin[];
  vout: vout[];
}

export interface transacitonsInsight {
  totalItems: number;
  from: number;
  to: number;
  items: transactionInsight[];
}

export interface transaction {
  txid: string;
  fee: string;
  blockheight: number;
  timestamp: number;
  fee: string;
  amount: string; // satoshis
  message: string;
}

export interface getInfoInsight {
  info: {
    version: number;
    blocks: number;
    testnet: boolean;
  };
}

export interface syncSSPRelay {
  chain: string;
  walletIdentity: string;
  keyXpub: string;
  wkIdentity: string;
}
