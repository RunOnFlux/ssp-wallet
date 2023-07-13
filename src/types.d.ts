declare module 'utxo-lib' {
  interface minHDKey {
    keyPair: {
      toWIF: () => string;
      getPublicKeyBuffer: () => Buffer;
    };
  }
  let address: {
    fromOutputScript: (scriptPubKey: Buffer, network: object) => string;
  };
  let script: {
    multisig: {
      output: {
        encode: (m: number, publicKeysBuffer: Buffer[]) => Uint8Array;
      };
    };
    scriptHash: {
      output: {
        encode: (hash160: Buffer) => Uint8Array;
      };
    };
  };
  let networks: {
    flux: object;
  };
  let crypto: {
    hash160: (redeemScript: Uint8Array) => Buffer;
  };
  let HDNode: {
    fromBase58: (xpubxpriv: string, network: object) => minHDKey;
  };
}
