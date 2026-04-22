// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck integration test suite
import { describe, it, expect, beforeEach } from 'vitest';
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Buffer } from 'buffer';

import {
  buildRecoveryEnvelope,
  decryptRecoveryEnvelope,
  persistRecoveryEnvelope,
  readRecoveryEnvelope,
} from '../../src/lib/recoveryEnvelope';
import {
  generateEphemeralKeypair,
  generateRecoveryNonce,
  wrapSkRForTransit,
  unwrapSkRFromTransit,
} from '../../src/lib/recoveryCrypto';
import { blockchains } from '../../src/storage/blockchains';

/**
 * End-to-end recovery round-trip.
 *
 * Simulates the full wire protocol using the real wallet-side modules for
 * both roles. ssp-key is simulated in-process via the same primitives
 * (BIP32 derivation + wrapSkRForTransit) that ssp-key's handler calls —
 * this verifies that both sides agree on the wire format byte-for-byte
 * and that no state beyond the seeds is required for recovery to succeed.
 */

// localStorage shim — the envelope module persists to localStorage.
function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
}

// Derive a chain-identity HDKey from a mnemonic, mirroring wallet.ts
// `generatexPubxPriv` at m/48'/coin'/0'/scriptType'.
function deriveIdentityMaster(mnemonic, identityChain = 'btc') {
  const chain = blockchains[identityChain];
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed, chain.bip32);
  const path = `m/48'/${chain.slip}'/0'/${2}'`;
  const identityMaster = master.derive(path);
  return {
    xpub: identityMaster.publicExtendedKey,
    xpriv: identityMaster.privateExtendedKey,
    hdkey: identityMaster,
  };
}

// Simulates the ssp-key side: receive a recovery request, derive sk_r
// from the seed at /11/0, wrap it under ECDH(identityPriv, walletEphPub).
function simulateSspKeyResponse(params) {
  const { sspKeyMaster, request } = params;

  const recoveryChild = sspKeyMaster.deriveChild(11).deriveChild(0);
  const identityChild = sspKeyMaster.deriveChild(10).deriveChild(0);

  const skR = Buffer.from(recoveryChild.privateKey);
  const sspKeyIdentityPriv = Buffer.from(identityChild.privateKey);
  const walletEphPub = Buffer.from(request.pkEph, 'hex');

  const transit = wrapSkRForTransit(sspKeyIdentityPriv, walletEphPub, skR);

  return {
    transit,
    nonce: request.nonce,
    timestamp: request.timestamp,
  };
}

const WALLET_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SSPKEY_MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

const USER_PASSWORD = 'my-real-wallet-password-123!';
const RANDOM_PARAMS = 'ab12cd34'.repeat(16); // 128 hex chars = 64 bytes

describe('recovery round-trip (integration)', () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  it('wallet recovers randomParams end-to-end via ssp-key simulation', async () => {
    // ---------------------------------------------------------------------
    // 1) SETUP: wallet builds envelope once WK pairing delivers ssp-key xpub.
    // ---------------------------------------------------------------------
    const sspKey = deriveIdentityMaster(SSPKEY_MNEMONIC);
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: sspKey.xpub,
      wkIdentity: 'bc1qtest00000wkidentity000000',
      identityChain: 'btc',
    });
    persistRecoveryEnvelope(envelope);

    expect(readRecoveryEnvelope()).toEqual(envelope);

    // ---------------------------------------------------------------------
    // 2) DRIFT: some time later, wallet fingerprint drifts — login's
    //    `passworderDecrypt(fingerprint, randomParamsBlob)` throws. We
    //    enter the recovery path with only the plain-localStorage envelope
    //    and the user's password.
    // ---------------------------------------------------------------------
    const storedEnvelope = readRecoveryEnvelope();
    expect(storedEnvelope).not.toBeNull();

    // ---------------------------------------------------------------------
    // 3) RECOVERY REQUEST: wallet generates an ephemeral keypair, builds
    //    a recovery request, notionally posts it to relay. We skip the
    //    relay and hand it directly to the ssp-key simulation.
    // ---------------------------------------------------------------------
    const eph = generateEphemeralKeypair();
    const nonce = generateRecoveryNonce();
    const request = {
      pkEph: eph.pub.toString('hex'),
      nonce: nonce.toString('hex'),
      timestamp: Date.now(),
    };

    // ---------------------------------------------------------------------
    // 4) SSP KEY: derive sk_r from its seed, wrap under ECDH, reply.
    // ---------------------------------------------------------------------
    const response = simulateSspKeyResponse({
      sspKeyMaster: sspKey.hdkey,
      request,
    });

    expect(response.nonce).toBe(request.nonce);
    expect(response.timestamp).toBe(request.timestamp);

    // ---------------------------------------------------------------------
    // 5) WALLET UNWRAPS: compute same ECDH key, decrypt transit to get sk_r,
    //    then decrypt the envelope to get plaintext randomParams.
    // ---------------------------------------------------------------------
    const skR = unwrapSkRFromTransit(
      eph.priv,
      Buffer.from(storedEnvelope.keyIdentityPubKey, 'hex'),
      response.transit,
    );
    expect(skR.length).toBe(32);

    const recoveredRandomParams = await decryptRecoveryEnvelope({
      envelope: storedEnvelope,
      userPassword: USER_PASSWORD,
      skR,
    });

    expect(recoveredRandomParams).toBe(RANDOM_PARAMS);
  });

  it('rejects recovery when a different ssp-key seed responds', async () => {
    const legitSspKey = deriveIdentityMaster(SSPKEY_MNEMONIC);
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: legitSspKey.xpub,
      wkIdentity: 'bc1qvictim',
      identityChain: 'btc',
    });
    persistRecoveryEnvelope(envelope);

    const eph = generateEphemeralKeypair();
    const request = {
      pkEph: eph.pub.toString('hex'),
      nonce: generateRecoveryNonce().toString('hex'),
      timestamp: Date.now(),
    };

    // Attacker-controlled ssp-key with a different seed.
    const attackerSspKey = deriveIdentityMaster(WALLET_MNEMONIC);
    const response = simulateSspKeyResponse({
      sspKeyMaster: attackerSspKey.hdkey,
      request,
    });

    // Wallet will attempt ECDH with the attacker's identity pub — doesn't
    // match the stored envelope's keyIdentityPubKey, so GCM tag fails.
    expect(() =>
      unwrapSkRFromTransit(
        eph.priv,
        Buffer.from(envelope.keyIdentityPubKey, 'hex'),
        response.transit,
      ),
    ).toThrow();
  });

  it('rejects envelope decrypt with wrong user password even after sk_r is recovered', async () => {
    const sspKey = deriveIdentityMaster(SSPKEY_MNEMONIC);
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: sspKey.xpub,
      wkIdentity: 'bc1qtest',
      identityChain: 'btc',
    });
    persistRecoveryEnvelope(envelope);

    const eph = generateEphemeralKeypair();
    const request = {
      pkEph: eph.pub.toString('hex'),
      nonce: generateRecoveryNonce().toString('hex'),
      timestamp: Date.now(),
    };
    const response = simulateSspKeyResponse({
      sspKeyMaster: sspKey.hdkey,
      request,
    });
    const skR = unwrapSkRFromTransit(
      eph.priv,
      Buffer.from(envelope.keyIdentityPubKey, 'hex'),
      response.transit,
    );

    await expect(
      decryptRecoveryEnvelope({
        envelope,
        userPassword: 'wrong-password',
        skR,
      }),
    ).rejects.toThrow();
  });

  it('survives ssp-key "reinstall from same seed" — envelope still decrypts', async () => {
    // Setup against the first ssp-key instance.
    const sspKeyV1 = deriveIdentityMaster(SSPKEY_MNEMONIC);
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: sspKeyV1.xpub,
      wkIdentity: 'bc1qtest',
      identityChain: 'btc',
    });

    // Later: user restores ssp-key from the same mnemonic on a new device.
    // Derivation is deterministic, so the derived keys at /10/0 and /11/0
    // are identical — recovery proceeds with no re-setup needed.
    const sspKeyV2 = deriveIdentityMaster(SSPKEY_MNEMONIC);
    expect(sspKeyV2.xpub).toBe(sspKeyV1.xpub);

    const eph = generateEphemeralKeypair();
    const request = {
      pkEph: eph.pub.toString('hex'),
      nonce: generateRecoveryNonce().toString('hex'),
      timestamp: Date.now(),
    };
    const response = simulateSspKeyResponse({
      sspKeyMaster: sspKeyV2.hdkey,
      request,
    });
    const skR = unwrapSkRFromTransit(
      eph.priv,
      Buffer.from(envelope.keyIdentityPubKey, 'hex'),
      response.transit,
    );
    const recovered = await decryptRecoveryEnvelope({
      envelope,
      userPassword: USER_PASSWORD,
      skR,
    });
    expect(recovered).toBe(RANDOM_PARAMS);
  });

  it('survives wallet "reinstall" — fresh envelope rebuilt from known inputs is decryptable', async () => {
    // User restores wallet from mnemonic: Create.tsx generates fresh
    // randomParams, fresh password is entered. Envelope is rebuilt in
    // Home.tsx after WK pairing delivers the (same) ssp-key xpub.
    const sspKey = deriveIdentityMaster(SSPKEY_MNEMONIC);

    const newRandomParams = '12'.repeat(64);
    const newPassword = 'fresh-password-after-restore';

    const envelope = await buildRecoveryEnvelope({
      userPassword: newPassword,
      randomParams: newRandomParams,
      xpubKeyIdentity: sspKey.xpub,
      wkIdentity: 'bc1qrestoredwallet',
      identityChain: 'btc',
    });

    const eph = generateEphemeralKeypair();
    const request = {
      pkEph: eph.pub.toString('hex'),
      nonce: generateRecoveryNonce().toString('hex'),
      timestamp: Date.now(),
    };
    const response = simulateSspKeyResponse({
      sspKeyMaster: sspKey.hdkey,
      request,
    });
    const skR = unwrapSkRFromTransit(
      eph.priv,
      Buffer.from(envelope.keyIdentityPubKey, 'hex'),
      response.transit,
    );
    const recovered = await decryptRecoveryEnvelope({
      envelope,
      userPassword: newPassword,
      skR,
    });
    expect(recovered).toBe(newRandomParams);
  });
});
