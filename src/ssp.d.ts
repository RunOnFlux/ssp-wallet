declare module '@storage/ssp' {
  interface ssp {
    relay: string;
  }
  let sspConfig: () => ssp;
  let sspConfigOriginal: () => ssp;
  let loadSSPConfig: () => void;
}
