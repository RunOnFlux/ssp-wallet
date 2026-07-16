import { useSyncExternalStore } from 'react';

/**
 * Wallet personalization + backup-health metadata — Phase 4 "Delight".
 *
 * Invariant 6 (storage is append-only): everything here lives in NEW, dedicated
 * `localStorage` keys, completely separate from `sspConfig`, encrypted seeds
 * (secureLocalStorage), wallet state, `walletNames-*` / `navPrefs` (localForage),
 * `themeMode`, etc. Nothing here is required for correctness — a missing/corrupt
 * value falls back to a safe default (no custom name/color; backup treated as
 * unverified so the health nudge simply shows). Losing all of it never affects
 * funds, keys or pairing; an upgraded wallet with no keys renders the defaults.
 *
 * Why localStorage (not localForage): the wallet-init path clears localForage
 * on first sync of a fresh wallet (address-mismatch safety in WalletShell).
 * These cosmetic prefs, written during onboarding, must survive that — so they
 * live in localStorage, which is cleared only by the onboarding flow itself
 * (localStorage.clear() runs BEFORE we write here) and never by localForage.
 *
 * Two independent concerns share one module (and one subscriber set):
 *   - `walletMeta`            → per-wallet cosmetic { name, color } (IKEA effect)
 *   - `walletBackupVerified`  → one global flag: has the seed been word-verified
 *                               (loss-aversion backup-health card on Home)
 */

export interface WalletMeta {
  /** User-chosen wallet name. Falls back to "Wallet N" when absent. */
  name?: string;
  /** User-chosen accent color (hex). Falls back to the identicon hue. */
  color?: string;
}

type MetaMap = Record<string, WalletMeta>;

const WALLET_META_KEY = 'walletMeta';
const BACKUP_VERIFIED_KEY = 'walletBackupVerified';

/** Accent palette offered in the "Make it yours" step (DESIGN_TOKENS chart set). */
export const ACCENT_COLORS = [
  '#FBBF24',
  '#F97316',
  '#22C55E',
  '#14B8A6',
  '#3B82F6',
  '#A855F7',
  '#EC4899',
  '#EF4444',
] as const;

const EMPTY_META: WalletMeta = Object.freeze({});

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((cb) => cb());
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

function sanitizeMeta(input: unknown): MetaMap {
  const out: MetaMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const entry: WalletMeta = {};
    if (typeof v.name === 'string') entry.name = v.name;
    if (typeof v.color === 'string') entry.color = v.color;
    if (entry.name !== undefined || entry.color !== undefined) out[id] = entry;
  }
  return out;
}

// Synchronous cache backed by localStorage. getSnapshot must be referentially
// stable between changes, so we only replace `metaCache` when it actually
// changes (on write, or a cross-tab storage event).
let metaCache: MetaMap = readMeta();
let backupCache: boolean = readBackup();

function readMeta(): MetaMap {
  try {
    const raw = localStorage.getItem(WALLET_META_KEY);
    return raw ? sanitizeMeta(JSON.parse(raw)) : {};
  } catch (error) {
    console.log('[walletMeta] read failed', error);
    return {};
  }
}

function readBackup(): boolean {
  try {
    return localStorage.getItem(BACKUP_VERIFIED_KEY) === 'true';
  } catch (error) {
    console.log('[walletMeta] backup read failed', error);
    return false;
  }
}

// Keep in sync if another extension view (side panel vs popup) writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === WALLET_META_KEY) {
      metaCache = readMeta();
      emit();
    } else if (e.key === BACKUP_VERIFIED_KEY) {
      backupCache = readBackup();
      emit();
    }
  });
}

export function getWalletMetaFromCache(walletId: string): WalletMeta {
  return metaCache[walletId] ?? EMPTY_META;
}

export function setWalletMeta(walletId: string, meta: WalletMeta): void {
  const merged: WalletMeta = { ...metaCache[walletId] };
  if (meta.name !== undefined) {
    const trimmed = meta.name.trim();
    if (trimmed) merged.name = trimmed;
    else delete merged.name;
  }
  if (meta.color !== undefined) {
    if (meta.color) merged.color = meta.color;
    else delete merged.color;
  }
  const next: MetaMap = { ...metaCache };
  if (merged.name === undefined && merged.color === undefined) {
    delete next[walletId];
  } else {
    next[walletId] = merged;
  }
  metaCache = next;
  try {
    localStorage.setItem(WALLET_META_KEY, JSON.stringify(next));
  } catch (error) {
    console.log('[walletMeta] write failed', error);
  }
  emit();
}

export function getBackupVerifiedFromCache(): boolean {
  return backupCache;
}

export function setBackupVerified(verified: boolean): void {
  backupCache = verified;
  try {
    localStorage.setItem(BACKUP_VERIFIED_KEY, verified ? 'true' : 'false');
  } catch (error) {
    console.log('[walletMeta] backup write failed', error);
  }
  emit();
}

/** Reactive per-wallet metadata (name + color). */
export function useWalletMeta(walletId: string): WalletMeta {
  return useSyncExternalStore(
    subscribe,
    () => metaCache[walletId] ?? EMPTY_META,
  );
}

/** Reactive full metadata map — for lists (e.g. the wallet switcher). */
export function useWalletMetaMap(): MetaMap {
  return useSyncExternalStore(subscribe, () => metaCache);
}

/** Reactive global "has the seed been word-verified" flag. */
export function useBackupVerified(): boolean {
  return useSyncExternalStore(subscribe, () => backupCache);
}
