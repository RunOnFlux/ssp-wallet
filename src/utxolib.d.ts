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
  interface network {
    messagePrefix: string;
    bech32: string;
    bip32: {
      public: number;
      private: number;
    };
    pubKeyHash: string;
    scriptHash: string;
    wif: string;
  }
  type networks = Record<string, network>;
  let address: {
    fromOutputScript: (scriptPubKey: Uint8Array, network: network) => string;
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
    fromBase58: (xpubxpriv: string, network: network) => minHDKey;
  };
  interface TX {
    virtualSize(): number;
    ins: inInput[];
  }
  let Transaction: {
    fromHex: (txhex: string, network: network) => TX;
    SIGHASH_ALL: number;
  };
  // Other methods/properties...
  // Replace 'any' with the appropriate type // Define the constructor signature and any other methods/properties
  type TransactionBuilder = new (
    network: network,
    fee: string,
  ) => {
    setVersion: (version: number) => void;
    setVersionGroupId: (versionGroupId: number) => void;
    addInput: (txid: string, vout: number, sequence?: number) => void;
    addOutput: (address: string, satoshis: number) => void;
    fromTransaction: (tx: TX, network: network) => txBuilder;
    buildIncomplete: () => builtTx;
    setExpiryHeight: (expiryHeight: number) => void;
  };
  let TransactionBuilder: {
    fromTransaction: (tx: TX, network: network) => txBuilder;
  } & TransactionBuilder;
  let ECPair: {
    fromWIF: (
      privateKey: string,
      network: network,
    ) => {
      sign: (hash: Buffer) => Buffer;
      getPrivateKeyBuffer: () => Buffer;
    };
    fromPublicKeyBuffer: (
      publicKeyBuffer: Buffer,
      network?: network,
    ) => {
      getAddress: () => string;
    };
  };
}
