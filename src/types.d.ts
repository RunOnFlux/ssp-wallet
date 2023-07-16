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
