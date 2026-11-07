// VD-3 check 6: TOFU pins and the combined gate (verify + bind + pin).
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { blockchains } from '@storage/blockchains';

import {
  VaultDescriptorError,
  computeVaultDescriptorHash,
  parseVaultDescriptor,
  verifyVaultDescriptor,
  type VaultDescriptorV1,
} from '../../src/lib/vaultDescriptor';
import {
  VAULT_PINS_STORAGE_KEY,
  VaultPinConflictError,
  VaultPinStorageError,
  checkVaultPin,
  listVaultPins,
  pinVaultDescriptor,
  readVaultPins,
  resetAllVaultPins,
  resetVaultPin,
  vaultPinChainSlotKey,
  vaultPinSlotKey,
  type VaultPinStorage,
} from '../../src/lib/vaultPins';
import {
  VAULT_PIN_MISMATCH_MESSAGE,
  commitVaultPin,
  vaultGateErrorCode,
  verifyPinnedVaultGate,
  verifyVaultGate,
} from '../../src/lib/vaultGate';
import { ownVaultAccountXpubFromXpriv } from '../../src/lib/vaultOwnXpub';
import { getMasterXpriv } from '../../src/lib/wallet';
import type { cryptos } from '../../src/types';

const vectors = JSON.parse(
  readFileSync(new URL('./fixtures/vd-vectors.json', import.meta.url), 'utf8'),
) as {
  members: Array<{ walletMnemonic: string; wkIdentity: string }>;
  vectors: Array<{
    name: string;
    descriptor: VaultDescriptorV1;
    descriptorHash: string;
  }>;
  negativeHashVectors: Array<{ canonicalJson: string; descriptorHash: string }>;
};

const btc = vectors.vectors.find((v) => v.name === 'btc-p2wsh-dual-2of3')!;
const alice = vectors.members[0];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function aliceXpub(d: VaultDescriptorV1): string {
  const chain = d.chain as keyof cryptos;
  const config = blockchains[chain];
  return ownVaultAccountXpubFromXpriv(
    getMasterXpriv(
      alice.walletMnemonic,
      48,
      config.slip,
      d.orgIndex,
      config.scriptType,
      chain,
    ),
    d.chain,
    d.vaultIndex,
  );
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: VaultPinStorage & { data: Map<string, string> } = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  return storage;
}

const verifiedBtc = () =>
  verifyVaultDescriptor(
    clone(btc.descriptor),
    btc.descriptorHash,
    alice.wkIdentity,
    'wallet',
    aliceXpub(btc.descriptor),
  );

/** vectors[0] with M 2 -> 1: same vault ids, different configuration. */
const changedBtc = () => {
  const negative = vectors.negativeHashVectors[0];
  const d = JSON.parse(negative.canonicalJson) as VaultDescriptorV1;
  return verifyVaultDescriptor(
    d,
    negative.descriptorHash,
    alice.wkIdentity,
    'wallet',
    aliceXpub(d),
  );
};

describe('vault pins', () => {
  it('is unpinned on first sight, matches after pinning', () => {
    const storage = memoryStorage();
    const verified = verifiedBtc();
    expect(checkVaultPin(verified, storage)).toEqual({ status: 'unpinned' });
    const pin = pinVaultDescriptor(verified, 'Treasury', storage, 1000);
    expect(pin).toMatchObject({
      orgId: btc.descriptor.orgId,
      vaultId: btc.descriptor.vaultId,
      hash: btc.descriptorHash,
      chain: 'btc',
      requiredSigners: 2,
      totalSigners: 3,
      vaultName: 'Treasury',
      pinnedAt: 1000,
    });
    expect(checkVaultPin(verified, storage)).toEqual({ status: 'match', pin });
    expect(Object.keys(readVaultPins(storage))).toEqual([
      `${btc.descriptor.orgId}:${btc.descriptor.vaultId}`,
    ]);
  });

  it('reports a changed configuration of a pinned vault as a mismatch', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(verifiedBtc(), 'Treasury', storage);
    expect(checkVaultPin(changedBtc(), storage).status).toBe('mismatch');
  });

  it('never overwrites a pin with a different configuration', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(verifiedBtc(), 'Treasury', storage);
    expect(() => pinVaultDescriptor(changedBtc(), 'Treasury', storage)).toThrow(
      VaultPinStorageError,
    );
    // Re-pinning the same configuration is a no-op.
    expect(
      pinVaultDescriptor(verifiedBtc(), 'Renamed', storage).vaultName,
    ).toBe('Treasury');
  });

  it('reset removes exactly one pin; the vault can then be pinned again', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(verifiedBtc(), 'Treasury', storage);
    resetVaultPin(btc.descriptor.orgId, btc.descriptor.vaultId, storage);
    expect(listVaultPins(storage)).toEqual([]);
    pinVaultDescriptor(changedBtc(), 'Treasury', storage);
    expect(checkVaultPin(changedBtc(), storage).status).toBe('match');
  });

  it('fails closed on corrupted or unreadable storage', () => {
    for (const raw of ['{', '[]', JSON.stringify({ 'a:b': { hash: 'x' } })]) {
      const storage = memoryStorage({ [VAULT_PINS_STORAGE_KEY]: raw });
      expect(() => checkVaultPin(verifiedBtc(), storage)).toThrow(
        VaultPinStorageError,
      );
    }
    const throwing: VaultPinStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => readVaultPins(throwing)).toThrow(VaultPinStorageError);
    expect(() =>
      pinVaultDescriptor(verifiedBtc(), 'x', memoryStorage(), 1),
    ).not.toThrow();
    const readOnly: VaultPinStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => pinVaultDescriptor(verifiedBtc(), 'x', readOnly)).toThrow(
      VaultPinStorageError,
    );
  });

  it('a corrupted store can be cleared with reset-all', () => {
    const storage = memoryStorage({ [VAULT_PINS_STORAGE_KEY]: '{' });
    resetAllVaultPins(storage);
    expect(listVaultPins(storage)).toEqual([]);
  });
});

describe('verifyVaultGate (VD-3 1-6 as one call)', () => {
  const request = { chain: 'btc', orgIndex: 1337, vaultIndex: 3 };
  const params = (
    storage: VaultPinStorage,
    d: unknown = clone(btc.descriptor),
  ) => ({
    descriptor: d,
    descriptorHash: btc.descriptorHash,
    wkIdentity: alice.wkIdentity,
    ownAccountXpub: aliceXpub(btc.descriptor),
    request,
    storage,
  });

  it('first sight needs a pin, then verifies', () => {
    const storage = memoryStorage();
    const first = verifyVaultGate(params(storage));
    expect(first.pin).toBeNull();
    pinVaultDescriptor(first.verified, 'Treasury', storage);
    expect(verifyVaultGate(params(storage)).pin?.hash).toBe(btc.descriptorHash);
    expect(verifyPinnedVaultGate(params(storage)).hash).toBe(
      btc.descriptorHash,
    );
  });

  it('sign time refuses a vault that was never confirmed', () => {
    let error: unknown;
    try {
      verifyPinnedVaultGate(params(memoryStorage()));
    } catch (e) {
      error = e;
    }
    expect((error as VaultDescriptorError).code).toBe('not_pinned');
  });

  it('hard-refuses a pinned vault whose configuration changed', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(changedBtc(), 'Treasury', storage);
    let error: unknown;
    try {
      verifyVaultGate(params(storage));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VaultDescriptorError);
    expect((error as VaultDescriptorError).code).toBe('pin_mismatch');
    expect((error as VaultDescriptorError).message).toBe(
      VAULT_PIN_MISMATCH_MESSAGE,
    );
    expect(vaultGateErrorCode('pin_mismatch')).toBe('VAULT_DESCRIPTOR_CHANGED');
  });

  it('refuses a request for another account of the org', () => {
    expect(() =>
      verifyVaultGate({
        ...params(memoryStorage()),
        request: { ...request, vaultIndex: 4 },
      }),
    ).toThrow(/does not belong to the verified vault/);
  });

  it('maps unreadable pins to pin_storage and missing descriptors to VAULT_DESCRIPTOR_MISSING', () => {
    const storage = memoryStorage({ [VAULT_PINS_STORAGE_KEY]: '{' });
    let error: unknown;
    try {
      verifyVaultGate(params(storage));
    } catch (e) {
      error = e;
    }
    expect((error as VaultDescriptorError).code).toBe('pin_storage');
    try {
      verifyVaultGate(params(memoryStorage(), null));
    } catch (e) {
      error = e;
    }
    expect((error as VaultDescriptorError).code).toBe('missing');
    expect(vaultGateErrorCode('missing')).toBe('VAULT_DESCRIPTOR_MISSING');
  });

  it('a hash over a tampered descriptor never reaches the pin store', () => {
    const tampered = clone(btc.descriptor);
    tampered.requiredSigners = 1;
    const storage = memoryStorage();
    expect(computeVaultDescriptorHash(parseVaultDescriptor(tampered))).not.toBe(
      btc.descriptorHash,
    );
    expect(() => verifyVaultGate(params(storage, tampered))).toThrow(
      /hash does not match/,
    );
    expect(storage.data.size).toBe(0);
  });
});

/**
 * The attack the slot index stops: the relay re-issues the vault under a NEW
 * vaultId — so the `${orgId}:${vaultId}` pin is never consulted — for the SAME
 * derivation slot, with a different signer set. This device's keys at that
 * slot would then serve a vault the user never confirmed.
 */
function slotAttackDescriptor(orgId: string = btc.descriptor.orgId): {
  descriptor: VaultDescriptorV1;
  hash: string;
} {
  const d = clone(btc.descriptor);
  d.orgId = orgId;
  d.vaultId = '66f1a0000000000000000199';
  // Drop a co-signer (never this device's own member): 2 of 2 instead of 2 of 3.
  const dropIndex = d.members.findIndex(
    (member) => member.wkIdentity !== alice.wkIdentity,
  );
  d.members.splice(dropIndex, 1);
  return {
    descriptor: d,
    hash: computeVaultDescriptorHash(parseVaultDescriptor(d)),
  };
}

const errorOf = (fn: () => unknown): VaultDescriptorError => {
  try {
    fn();
  } catch (error) {
    return error as VaultDescriptorError;
  }
  throw new Error('expected a refusal');
};

describe('vault pins by derivation slot', () => {
  const request = { chain: 'btc', orgIndex: 1337, vaultIndex: 3 };

  it('uses the slot key formats shared with SSP Key', () => {
    expect(vaultPinSlotKey('org', 'btc', 1337, 3)).toBe('org:btc:1337:3');
    expect(vaultPinChainSlotKey('btc', 1337, 3)).toBe('btc:1337:3');
    expect(
      vaultPinSlotKey(
        btc.descriptor.orgId,
        btc.descriptor.chain,
        btc.descriptor.orgIndex,
        btc.descriptor.vaultIndex,
      ),
    ).toBe(`${btc.descriptor.orgId}:btc:1337:3`);
  });

  it('refuses a NEW vaultId for an occupied slot with a different signer set', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(verifiedBtc(), 'Treasury', storage);
    const attack = slotAttackDescriptor();
    // The forged descriptor verifies on its own (own xpub, attestations)…
    const verifiedAttack = verifyVaultDescriptor(
      clone(attack.descriptor),
      attack.hash,
      alice.wkIdentity,
      'wallet',
      aliceXpub(attack.descriptor),
    );
    expect(verifiedAttack.totalSigners).toBe(2);
    // …but its slot is pinned to another configuration: hard refusal.
    const status = checkVaultPin(verifiedAttack, storage);
    expect(status.status).toBe('mismatch');
    expect(status.status === 'mismatch' && status.pin.vaultId).toBe(
      btc.descriptor.vaultId,
    );
    const error = errorOf(() =>
      verifyVaultGate({
        descriptor: clone(attack.descriptor),
        descriptorHash: attack.hash,
        wkIdentity: alice.wkIdentity,
        ownAccountXpub: aliceXpub(attack.descriptor),
        request,
        storage,
      }),
    );
    expect(error.code).toBe('pin_mismatch');
    expect(vaultGateErrorCode(error.code)).toBe('VAULT_DESCRIPTOR_CHANGED');
    // …and it can never be pinned next to the real one.
    expect(() =>
      pinVaultDescriptor(verifiedAttack, 'Treasury', storage),
    ).toThrow(VaultPinConflictError);
    expect(Object.keys(readVaultPins(storage))).toHaveLength(1);
  });

  it('refuses a NEW orgId for the same chain, orgIndex and vaultIndex with a different signer set', () => {
    // A pin stored before slot indexing: the orgId-free slot is derived from
    // the record's own fields on read.
    const storage = memoryStorage();
    pinVaultDescriptor(verifiedBtc(), 'Treasury', storage);
    const attack = slotAttackDescriptor('66f1a0000000000000000777');
    expect(attack.descriptor.orgId).not.toBe(btc.descriptor.orgId);
    const verifiedAttack = verifyVaultDescriptor(
      clone(attack.descriptor),
      attack.hash,
      alice.wkIdentity,
      'wallet',
      aliceXpub(attack.descriptor),
    );
    const status = checkVaultPin(verifiedAttack, storage);
    expect(status.status).toBe('mismatch');
    expect(status.status === 'mismatch' && status.pin.orgId).toBe(
      btc.descriptor.orgId,
    );
    const error = errorOf(() =>
      verifyVaultGate({
        descriptor: clone(attack.descriptor),
        descriptorHash: attack.hash,
        wkIdentity: alice.wkIdentity,
        ownAccountXpub: aliceXpub(attack.descriptor),
        request,
        storage,
      }),
    );
    expect(error.code).toBe('pin_mismatch');
    expect(vaultGateErrorCode(error.code)).toBe('VAULT_DESCRIPTOR_CHANGED');
    expect(() =>
      pinVaultDescriptor(verifiedAttack, 'Treasury', storage),
    ).toThrow(VaultPinConflictError);
    expect(
      errorOf(() =>
        commitVaultPin(verifiedAttack, attack.hash, 'Treasury', storage),
      ).code,
    ).toBe('pin_mismatch');
    expect(Object.keys(readVaultPins(storage))).toHaveLength(1);
  });

  it('the slot frees up only through an explicit reset', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(verifiedBtc(), 'Treasury', storage);
    resetVaultPin(btc.descriptor.orgId, btc.descriptor.vaultId, storage);
    const attack = slotAttackDescriptor();
    const first = verifyVaultGate({
      descriptor: clone(attack.descriptor),
      descriptorHash: attack.hash,
      wkIdentity: alice.wkIdentity,
      ownAccountXpub: aliceXpub(attack.descriptor),
      request,
      storage,
    });
    expect(first.pin).toBeNull();
  });

  it('refuses every configuration of a slot that already holds two different pins', () => {
    // Possible only in a store written before slot indexing.
    const real = pinVaultDescriptor(verifiedBtc(), 'Treasury', memoryStorage());
    const attack = slotAttackDescriptor();
    const forged = {
      ...real,
      vaultId: attack.descriptor.vaultId,
      hash: attack.hash,
      pinnedAt: real.pinnedAt + 1,
    };
    const storage = memoryStorage({
      [VAULT_PINS_STORAGE_KEY]: JSON.stringify({
        [`${real.orgId}:${real.vaultId}`]: real,
        [`${forged.orgId}:${forged.vaultId}`]: forged,
      }),
    });
    expect(checkVaultPin(verifiedBtc(), storage).status).toBe('mismatch');
  });

  it('other slots of the same org are independent', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(verifiedBtc(), 'Treasury', storage);
    const other = clone(btc.descriptor);
    other.vaultId = '66f1a0000000000000000198';
    other.vaultIndex = 9;
    const otherHash = computeVaultDescriptorHash(parseVaultDescriptor(other));
    const verifiedOther = verifyVaultDescriptor(
      other,
      otherHash,
      alice.wkIdentity,
      'wallet',
      aliceXpub(other),
    );
    expect(checkVaultPin(verifiedOther, storage).status).toBe('unpinned');
  });
});

describe('pin timing: staged on confirm, saved at sign time', () => {
  const request = { chain: 'btc', orgIndex: 1337, vaultIndex: 3 };
  const params = (storage: VaultPinStorage) => ({
    descriptor: clone(btc.descriptor),
    descriptorHash: btc.descriptorHash,
    wkIdentity: alice.wkIdentity,
    ownAccountXpub: aliceXpub(btc.descriptor),
    request,
    storage,
  });

  it('a staged confirmation passes the sign-time check without pinning anything', () => {
    const storage = memoryStorage();
    const verified = verifyPinnedVaultGate(params(storage), btc.descriptorHash);
    expect(verified.hash).toBe(btc.descriptorHash);
    expect(storage.data.size).toBe(0);
  });

  it('a staged confirmation of another hash is not a confirmation', () => {
    const storage = memoryStorage();
    expect(
      errorOf(() => verifyPinnedVaultGate(params(storage), 'f'.repeat(64)))
        .code,
    ).toBe('not_pinned');
  });

  it('a staged confirmation never overrides a changed pinned vault', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(changedBtc(), 'Treasury', storage);
    expect(
      errorOf(() => verifyPinnedVaultGate(params(storage), btc.descriptorHash))
        .code,
    ).toBe('pin_mismatch');
  });

  it('commitVaultPin saves the staged hash, and only that', () => {
    const storage = memoryStorage();
    const verified = verifiedBtc();
    expect(
      errorOf(() => commitVaultPin(verified, null, 'T', storage)).code,
    ).toBe('not_pinned');
    expect(
      errorOf(() => commitVaultPin(verified, 'f'.repeat(64), 'T', storage))
        .code,
    ).toBe('not_pinned');
    expect(storage.data.size).toBe(0);
    const pin = commitVaultPin(
      verified,
      btc.descriptorHash,
      'Treasury',
      storage,
    );
    expect(pin.hash).toBe(btc.descriptorHash);
    // Already pinned: a no-op, no staged confirmation needed.
    expect(commitVaultPin(verified, null, 'Other', storage)).toEqual(pin);
  });

  it('commitVaultPin refuses when the slot was pinned differently meanwhile', () => {
    const storage = memoryStorage();
    pinVaultDescriptor(verifiedBtc(), 'Treasury', storage);
    const attack = slotAttackDescriptor();
    const verifiedAttack = verifyVaultDescriptor(
      clone(attack.descriptor),
      attack.hash,
      alice.wkIdentity,
      'wallet',
      aliceXpub(attack.descriptor),
    );
    const error = errorOf(() =>
      commitVaultPin(verifiedAttack, attack.hash, 'Treasury', storage),
    );
    expect(error.code).toBe('pin_mismatch');
    expect(error.message).toBe(VAULT_PIN_MISMATCH_MESSAGE);
  });

  it('commitVaultPin fails closed when the pin cannot be saved', () => {
    const readOnly: VaultPinStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(
      errorOf(() =>
        commitVaultPin(verifiedBtc(), btc.descriptorHash, 'T', readOnly),
      ).code,
    ).toBe('pin_storage');
  });
});
