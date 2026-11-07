/**
 * @vitest-environment jsdom
 */
// Secret-blob rewrites read what is PERSISTED, not react-secure-storage's
// per-view cache (security review: vaultUpgrade raw compare-and-swap).
import { describe, expect, it, vi } from 'vitest';

// The wallet build's react-secure-storage fingerprint settings (vite.config
// define). jsdom has no canvas: react-secure-storage reuses a stored canvas
// print instead of drawing one.
vi.hoisted(() => {
  process.env.SECURE_LOCAL_STORAGE_DISABLED_KEYS =
    'UserAgent|Plugins|TimeZone|Canvas';
  localStorage.setItem('canvas', 'jsdom-canvas-print');
});

import secureLocalStorage from 'react-secure-storage';
import EncryptionService from 'react-secure-storage/dist/encryption';

import {
  plainVaultStorage,
  secureStorageRawKey,
  secureVaultStorage,
} from '../../src/lib/vaultStorage';

/** What another wallet view's react-secure-storage writes for a string. */
function writeFromAnotherView(key: string, value: string): void {
  const Ctor =
    typeof EncryptionService === 'function'
      ? EncryptionService
      : (EncryptionService as unknown as { default: typeof EncryptionService })
          .default;
  localStorage.setItem(secureStorageRawKey(key), new Ctor().encrypt(value));
}

describe('secureVaultStorage', () => {
  it('reads the persisted ciphertext and decodes it afresh', () => {
    const storage = secureVaultStorage();
    storage.setItem('vaultStorageTest', 'blob-A');
    const raw = storage.getRaw('vaultStorageTest');
    expect(typeof raw).toBe('string');
    expect(raw).not.toBe('blob-A');
    expect(storage.getFresh('vaultStorageTest')).toBe('blob-A');
    // A rewrite is a new ciphertext even for the same value (random salt), so
    // the raw value identifies one write.
    storage.setItem('vaultStorageTest', 'blob-A');
    expect(storage.getRaw('vaultStorageTest')).not.toBe(raw);
  });

  it('sees another view’s write that this view’s cache does not', () => {
    const storage = secureVaultStorage();
    storage.setItem('vaultStorageStale', 'blob-A');
    writeFromAnotherView('vaultStorageStale', 'blob-B');
    // react-secure-storage serves this view's stale copy…
    expect(secureLocalStorage.getItem('vaultStorageStale')).toBe('blob-A');
    // …the adapter the rewrites use does not.
    expect(storage.getFresh('vaultStorageStale')).toBe('blob-B');
  });

  it('reports absent keys as null and removes through the library', () => {
    const storage = secureVaultStorage();
    expect(storage.getRaw('vaultStorageAbsent')).toBeNull();
    expect(storage.getFresh('vaultStorageAbsent')).toBeNull();
    storage.setItem('vaultStorageGone', 'x');
    storage.removeItem?.('vaultStorageGone');
    expect(storage.getRaw('vaultStorageGone')).toBeNull();
  });
});

describe('plainVaultStorage', () => {
  it('is plain localStorage', () => {
    const storage = plainVaultStorage();
    storage.setItem('vaultStoragePlain', 'pool');
    expect(localStorage.getItem('vaultStoragePlain')).toBe('pool');
    expect(storage.getRaw('vaultStoragePlain')).toBe('pool');
    expect(storage.getFresh('vaultStoragePlain')).toBe('pool');
    storage.removeItem?.('vaultStoragePlain');
    expect(storage.getRaw('vaultStoragePlain')).toBeNull();
  });
});
