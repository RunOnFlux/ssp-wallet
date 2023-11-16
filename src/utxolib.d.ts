declare module '@runonflux/utxo-lib' {
  interface minHDKey {
    keyPair: {
      toWIF: () => string;
      getPublicKeyBuffer: () => Buffer;
    };
  }
  interface inInput {
    hash: Buffer;
    index: number;
  }
  interface input {
    hash: Buffer;
    index: number;
    redeemScript: Buffer;
    witnessScript: Buffer;
    value: number;
  }
  interface output {
    script: Buffer;
    value: number;
  }
  interface builtTx {
    toHex: () => string;
  }
  interface txBuilder {
    build: () => builtTx;
    sign: (
      index: number,
      keyPair: object,
      redeemScript: Buffer | undefined,
      hashType: number,
      value: number,
      witnessScript: Buffer | undefined,
    ) => void;
    buildIncomplete(): builtTx;
    inputs: input[];
    tx: {
      ins: inInput[];
      outs: output[];
    };
  }
  type networks = Record<string, object>;
  let address: {
    fromOutputScript: (scriptPubKey: Uint8Array, network: object) => string;
  };
  let script: {
    multisig: {
      output: {
        encode: (m: number, publicKeysBuffer: Buffer[]) => Uint8Array;
      };
    };
    witnessScriptHash: {
      output: {
        encode: (hash: Buffer) => Uint8Array;
      };
    };
    scriptHash: {
      output: {
        encode: (hash160: Buffer) => Uint8Array;
      };
    };
    nullData: {
      output: {
        encode: (data: Buffer) => string;
      };
    };
  };
  let networks: networks;
  let crypto: {
    hash160: (redeemScript: Uint8Array) => Buffer;
    sha256: (witnessScript: Uint8Array) => Buffer;
  };
  let HDNode: {
    fromBase58: (xpubxpriv: string, network: object) => minHDKey;
  };
  let Transaction: {
    fromHex: (txhex: string, network: object) => object;
    SIGHASH_ALL: number;
  };
  // Other methods/properties...
  // Replace 'any' with the appropriate type // Define the constructor signature and any other methods/properties
  type TransactionBuilder = new (
    network: object,
    fee: string,
  ) => {
    setVersion: (version: number) => void;
    setVersionGroupId: (versionGroupId: number) => void;
    addInput: (txid: string, vout: number) => void;
    addOutput: (address: string, satoshis: number) => void;
    fromTransaction: (tx: object, network: object) => txBuilder;
    buildIncomplete: () => builtTx;
  };
  let TransactionBuilder: {
    fromTransaction: (tx: object, network: object) => txBuilder;
  } & TransactionBuilder;
  let ECPair: {
    fromWIF: (
      privateKey: string,
      network: object,
    ) => {
      sign: (hash: Buffer) => Buffer;
      getPrivateKeyBuffer: () => Buffer;
    };
    fromPublicKeyBuffer: (
      publicKeyBuffer: Buffer,
      network?: object,
    ) => {
      getAddress: () => string;
    };
  };
}
