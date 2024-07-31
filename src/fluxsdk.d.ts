declare module '@runonflux/flux-sdk' {
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
    ) => string;
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
