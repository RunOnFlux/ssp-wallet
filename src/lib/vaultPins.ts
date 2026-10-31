/**
 * VD-3 check 6: trust-on-first-use pins of verified vault descriptors.
 *
 * Pin key `${orgId}:${vaultId}` → the descriptor hash the user confirmed.
 * Stored in the extension origin's localStorage (wiped with the wallet on
 * Create / Restore). A pin is never overwritten by a request: a different hash
 * for a pinned vault is a hard refusal until the user resets the pin in
 * Settings. Any storage failure fails closed.
 *
 * Pins are ALSO indexed by derivation slot, twice (the same rule as SSP Key):
 * `${orgId}:${chain}:${orgIndex}:${vaultIndex}` and the orgId-free
 * `${chain}:${orgIndex}:${vaultIndex}`. The slot is what decides which of this
 * device's keys sign, so a descriptor that names a NEW vaultId — or a new
 * orgId — for an occupied slot with a different signer set is the same hard
 * refusal as a changed pinned vault; otherwise a relay could sidestep a pin by
 * re-issuing the vault under fresh ids. orgIndex is unique and immutable on
 * the server, so an honest server never trips the orgId-free slot. Both slots
 * are derived from each stored record's own fields on every read, so pins
 * made before slot indexing are covered without a storage migration.
 */

import {
  signingModeLabel,
  type VerifiedVaultDescriptor,
} from './vaultDescriptor';

export const VAULT_PINS_STORAGE_KEY = 'sspVaultDescriptorPinsV1';

export interface VaultPinRecord {
  orgId: string;
  vaultId: string;
  hash: string;
  chain: string;
  orgIndex: number;
  vaultIndex: number;
  signingMode: string | null;
  requiredSigners: number;
  totalSigners: number;
  /** Vault name as SSP Enterprise claimed it at pin time (display only). */
  vaultName: string;
  pinnedAt: number;
}

export interface VaultPinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class VaultPinStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultPinStorageError';
  }
}

function resolveStorage(storage?: VaultPinStorage): VaultPinStorage {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // fall through
  }
  throw new VaultPinStorageError('Vault pin storage is unavailable');
}

export function vaultPinKey(orgId: string, vaultId: string): string {
  return `${orgId}:${vaultId}`;
}

/**
 * Derivation slot of a vault — byte-identical to SSP Key's slot key. Two
 * descriptors for one slot must have the same hash.
 */
export function vaultPinSlotKey(
  orgId: string,
  chain: string,
  orgIndex: number,
  vaultIndex: number,
): string {
  return `${orgId}:${chain}:${String(orgIndex)}:${String(vaultIndex)}`;
}

/**
 * orgId-free derivation slot — byte-identical to SSP Key's. orgIndex is
 * server-unique, so one slot never holds two honest configurations.
 */
export function vaultPinChainSlotKey(
  chain: string,
  orgIndex: number,
  vaultIndex: number,
): string {
  return `${chain}:${String(orgIndex)}:${String(vaultIndex)}`;
}

/** Both slot keys of a vault: with orgId, then orgId-free. */
function slotKeysOf(v: {
  orgId: string;
  chain: string;
  orgIndex: number;
  vaultIndex: number;
}): string[] {
  return [
    vaultPinSlotKey(v.orgId, v.chain, v.orgIndex, v.vaultIndex),
    vaultPinChainSlotKey(v.chain, v.orgIndex, v.vaultIndex),
  ];
}

/**
 * Every pin of each slot (both slot kinds), oldest first, derived from the
 * stored records' own fields. More than one configuration per slot can only
 * exist in pins made before slot indexing — any of them conflicting with a
 * request is a refusal.
 */
export function vaultPinsBySlot(
  pins: Record<string, VaultPinRecord>,
): Map<string, VaultPinRecord[]> {
  const bySlot = new Map<string, VaultPinRecord[]>();
  for (const pin of Object.values(pins)) {
    for (const slot of slotKeysOf(pin)) {
      const list = bySlot.get(slot) ?? [];
      list.push(pin);
      bySlot.set(slot, list);
    }
  }
  bySlot.forEach((list) => list.sort((a, b) => a.pinnedAt - b.pinnedAt));
  return bySlot;
}

function isPinRecord(value: unknown): value is VaultPinRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.orgId === 'string' &&
    typeof r.vaultId === 'string' &&
    typeof r.hash === 'string' &&
    /^[0-9a-f]{64}$/.test(r.hash) &&
    typeof r.chain === 'string' &&
    typeof r.orgIndex === 'number' &&
    typeof r.vaultIndex === 'number' &&
    (r.signingMode === null || typeof r.signingMode === 'string') &&
    typeof r.requiredSigners === 'number' &&
    typeof r.totalSigners === 'number' &&
    typeof r.vaultName === 'string' &&
    typeof r.pinnedAt === 'number'
  );
}

/** All pins. Throws VaultPinStorageError when storage is unreadable/corrupt. */
export function readVaultPins(
  storage?: VaultPinStorage,
): Record<string, VaultPinRecord> {
  const store = resolveStorage(storage);
  let raw: string | null;
  try {
    raw = store.getItem(VAULT_PINS_STORAGE_KEY);
  } catch {
    throw new VaultPinStorageError('Vault pins could not be read');
  }
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VaultPinStorageError('Vault pins are corrupted');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new VaultPinStorageError('Vault pins are corrupted');
  }
  const pins: Record<string, VaultPinRecord> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (
      !isPinRecord(value) ||
      key !== vaultPinKey(value.orgId, value.vaultId)
    ) {
      throw new VaultPinStorageError('Vault pins are corrupted');
    }
    pins[key] = value;
  }
  return pins;
}

function writeVaultPins(
  pins: Record<string, VaultPinRecord>,
  storage?: VaultPinStorage,
): void {
  const store = resolveStorage(storage);
  try {
    store.setItem(VAULT_PINS_STORAGE_KEY, JSON.stringify(pins));
  } catch {
    throw new VaultPinStorageError('Vault pin could not be saved');
  }
}

export type VaultPinStatus =
  | { status: 'unpinned' }
  | { status: 'match'; pin: VaultPinRecord }
  | { status: 'mismatch'; pin: VaultPinRecord };

function pinStatusOf(
  verified: VerifiedVaultDescriptor,
  pins: Record<string, VaultPinRecord>,
): VaultPinStatus {
  const d = verified.descriptor;
  const pin = pins[vaultPinKey(d.orgId, d.vaultId)];
  if (pin && pin.hash !== verified.hash) {
    return { status: 'mismatch', pin };
  }
  // The slots: any OTHER configuration pinned at these derivation indices —
  // under this vaultId or any other, this orgId or any other — is a changed
  // vault.
  const bySlot = vaultPinsBySlot(pins);
  const conflict = slotKeysOf(d)
    .flatMap((slot) => bySlot.get(slot) ?? [])
    .find((slotPin) => slotPin.hash !== verified.hash);
  if (conflict) return { status: 'mismatch', pin: conflict };
  return pin ? { status: 'match', pin } : { status: 'unpinned' };
}

/**
 * Compare a verified descriptor with its pin AND with every pin of its
 * derivation slot. A different hash in either is a mismatch.
 */
export function checkVaultPin(
  verified: VerifiedVaultDescriptor,
  storage?: VaultPinStorage,
): VaultPinStatus {
  return pinStatusOf(verified, readVaultPins(storage));
}

/** A pin was refused because the vault (or its slot) is pinned differently. */
export class VaultPinConflictError extends VaultPinStorageError {
  readonly pin: VaultPinRecord;

  constructor(pin: VaultPinRecord) {
    super('This vault is already pinned to a different configuration');
    this.name = 'VaultPinConflictError';
    this.pin = pin;
  }
}

/**
 * Pin a verified descriptor after the user confirmed it. Refuses to replace a
 * different existing pin of the vault OR of its derivation slot (that needs
 * an explicit reset first).
 */
export function pinVaultDescriptor(
  verified: VerifiedVaultDescriptor,
  vaultName: string,
  storage?: VaultPinStorage,
  now: number = Date.now(),
): VaultPinRecord {
  const d = verified.descriptor;
  const pins = readVaultPins(storage);
  const key = vaultPinKey(d.orgId, d.vaultId);
  const status = pinStatusOf(verified, pins);
  if (status.status === 'mismatch') {
    throw new VaultPinConflictError(status.pin);
  }
  if (status.status === 'match') return status.pin;
  const record: VaultPinRecord = {
    orgId: d.orgId,
    vaultId: d.vaultId,
    hash: verified.hash,
    chain: d.chain,
    orgIndex: d.orgIndex,
    vaultIndex: d.vaultIndex,
    signingMode: d.signingMode,
    requiredSigners: d.requiredSigners,
    totalSigners: d.members.length,
    vaultName: (vaultName || '').slice(0, 100),
    pinnedAt: now,
  };
  writeVaultPins({ ...pins, [key]: record }, storage);
  return record;
}

/** Remove one pin (Settings → Reset vault pin, behind a confirmation). */
export function resetVaultPin(
  orgId: string,
  vaultId: string,
  storage?: VaultPinStorage,
): void {
  const pins = readVaultPins(storage);
  const key = vaultPinKey(orgId, vaultId);
  if (!(key in pins)) return;
  const { [key]: _removed, ...rest } = pins;
  void _removed;
  writeVaultPins(rest, storage);
}

/** Remove every pin — the recovery path when the pin store is corrupted. */
export function resetAllVaultPins(storage?: VaultPinStorage): void {
  const store = resolveStorage(storage);
  try {
    store.setItem(VAULT_PINS_STORAGE_KEY, JSON.stringify({}));
  } catch {
    throw new VaultPinStorageError('Vault pins could not be reset');
  }
}

/** Pins, newest first (Settings list). */
export function listVaultPins(storage?: VaultPinStorage): VaultPinRecord[] {
  return Object.values(readVaultPins(storage)).sort(
    (a, b) => b.pinnedAt - a.pinnedAt,
  );
}

/** One-line summary of a pin for display. */
export function describeVaultPin(pin: VaultPinRecord): string {
  return `${pin.chain} · ${pin.requiredSigners} of ${pin.totalSigners} · ${signingModeLabel(
    pin.signingMode,
  )}`;
}
