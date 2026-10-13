// react-secure-storage internals used to read what is PERSISTED, bypassing
// its per-view cache (lib/vaultStorage.ts). Shapes as in react-secure-storage
// 1.3.2 dist/encryption.js and dist/utils.js.
declare module 'react-secure-storage/dist/encryption' {
  export default class EncryptionService {
    constructor();
    encrypt(value: string): string;
    decrypt(value: string): string | null;
  }
}

declare module 'react-secure-storage/dist/utils' {
  export function getSecurePrefix(): string;
}
