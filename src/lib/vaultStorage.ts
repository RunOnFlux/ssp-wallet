/**
 * VaultStorage adapters for the secret-blob rewrites in vaultUpgrade.ts.
 *
 * react-secure-storage loads every value ONCE per wallet view into an
 * in-memory cache and serves getItem from it, so a view can hold a blob that
 * another view (popup, side panel, full tab) has replaced since. Rewriting a
 * secret from that cache can put back a stale value — e.g. a blob under the
 * pre-rotation password, which no longer decrypts. These adapters read the
 * raw localStorage value instead (for react-secure-storage: its ciphertext,
 * decoded afresh on every read), and compare-and-swap runs against that raw
 * value.
 */

import secureLocalStorage from 'react-secure-storage';
import EncryptionService from 'react-secure-storage/dist/encryption';
import { getSecurePrefix } from 'react-secure-storage/dist/utils';
import type { VaultStorage } from './vaultUpgrade';

type Decoder = { decrypt(value: string): string | null };
type DecoderCtor = new () => Decoder;

/** The class behind the default export, whichever CJS interop applied. */
function encryptionCtor(): DecoderCtor {
  const candidate: unknown = EncryptionService;
  if (typeof candidate === 'function') return candidate as DecoderCtor;
  const nested = (candidate as { default?: unknown } | null)?.default;
  if (typeof nested === 'function') return nested as DecoderCtor;
  throw new Error('react-secure-storage decoder unavailable');
}

/** react-secure-storage's localStorage key of a STRING value. */
export function secureStorageRawKey(key: string): string {
  return `${getSecurePrefix()}s.${key}`;
}

/** react-secure-storage, read from what is persisted (not the view cache). */
export function secureVaultStorage(): VaultStorage {
  let decoder: Decoder | null = null;
  return {
    getRaw: (key) => localStorage.getItem(secureStorageRawKey(key)),
    getFresh: (key) => {
      const raw = localStorage.getItem(secureStorageRawKey(key));
      if (raw === null) return null;
      decoder ??= new (encryptionCtor())();
      return decoder.decrypt(raw);
    },
    setItem: (key, value) => secureLocalStorage.setItem(key, value),
    removeItem: (key) => secureLocalStorage.removeItem(key),
  };
}

/** Plain localStorage (the enterprise nonce pool lives here). */
export function plainVaultStorage(): VaultStorage {
  return {
    getRaw: (key) => localStorage.getItem(key),
    getFresh: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  };
}
