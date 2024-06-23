declare module '@storage/blockchains' {
  interface Blockchain {
    id: string;
    libid: string;
    name: string;
    symbol: string;
    decimals: number;
    node: string;
    api: string;
    slip: number;
    scriptType: string;
    messagePrefix: string;
    pubKeyHash: string;
    scriptHash: string;
    wif: string;
    logo: string;
    bip32: {
      public: number;
      private: number;
    };
    txVersion: number;
    txGroupID: number;
    backend: string;
    bech32: string;
    dustLimit: number;
    minFeePerByte: number;
    feePerByte: number;
    maxMessage: number;
    maxTxSize: number;
    rbf: boolean;
    cashaddr: string;
    txExpiryHeight: number;
    hashType: number;
    // evm
    chainType: string;
    accountSalt: string;
    factorySalt: string;
    factoryAddress: string;
    entrypointAddress: string;
  }
  type blockchains = Record<string, Blockchain>;
  let blockchains: blockchains;
}
