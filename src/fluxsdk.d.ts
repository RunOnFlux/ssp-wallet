declare module '@runonflux/flux-sdk' {
  interface DelegateData {
    version?: number;
    type?: number;
    delegatePublicKeys?: string[];
  }

  let fluxnode: {
    startFluxNodev6: (
      collateralOutHash: string,
      collateralOutIndex: number,
      collateralPrivateKey: string,
      fluxnodePrivateKey: string,
      timestamp: string,
      comprossedCollateralPrivateKey: boolean,
      compressedFluxnodePrivateKey: boolean,
      redeemScript: string,
      delegateData?: DelegateData,
    ) => string;
    startFluxNodeAddDelegate: (
      collateralOutHash: string,
      collateralOutIndex: number,
      collateralPrivateKey: string,
      fluxnodePrivateKey: string,
      timestamp: string,
      delegatePublicKeys: string[],
      compressedCollateralPrivateKey: boolean,
      compressedFluxnodePrivateKey: boolean,
      redeemScript: string,
    ) => string;
    startFluxNodeAsDelegate: (
      collateralOutHash: string,
      collateralOutIndex: number,
      delegatePrivateKey: string,
      fluxnodePrivateKey: string,
      timestamp: string,
      compressedDelegatePrivateKey: boolean,
      compressedFluxnodePrivateKey: boolean,
      redeemScript: string,
    ) => string;
    createDelegateData: (
      type: number,
      delegatePublicKeys?: string[],
      delegatePrivateKeys?: string[],
    ) => DelegateData;
    convertDelegatePrivateKeysToPublic: (
      delegatePrivateKeys: string[],
    ) => string[];
    signMessage: (
      message: string,
      privateKey: string,
      isCompressed: boolean,
      messagePrefix: string,
      options?: {
        extraEntropy?: Buffer;
      },
    ) => string;
  };
}
