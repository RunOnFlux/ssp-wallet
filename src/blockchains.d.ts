declare module '@storage/blockchains' {
  interface Blockchain {
    id: string;
    libid: string;
    name: string;
    symbol: string;
    decimals: number;
    node: string;
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
  }
  type blockchains = Record<string, Blockchain>;
  let blockchains: blockchains;
}
