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
  storeRecoveryXpub,
  readRecoveryXpub,
  advanceRecoveryIndex,
  clearRecoveryEnvelope,
} from '../../src/lib/recoveryEnvelope';
import { recoveryXpubMessage } from '../../src/lib/recoveryXpubVerify';
import { fluxnode } from '@runonflux/flux-sdk';
import {
  generateEphemeralKeypair,
  generateRecoveryNonce,
  wrapSkRForTransit,
  unwrapSkRFromTransit,
} from '../../src/lib/recoveryCrypto';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';

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

// Derive both accounts a Key holds from one mnemonic, mirroring wallet.ts
// `generatexPubxPriv` at m/48'/coin'/0'/scriptType' (the signing/identity
// account) and ssp-key's lib/recoveryAccount.ts at m/48'/coin'/99'/scriptType'
// (the account whose keys are released).
function deriveKeyAccounts(mnemonic, identityChain = 'btc') {
  const chain = blockchains[identityChain];
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed, chain.bip32);
  const identityMaster = master.derive(`m/48'/${chain.slip}'/0'/${2}'`);
  const recoveryAccount = master.derive(`m/48'/${chain.slip}'/99'/${2}'`);
  return {
    xpub: identityMaster.publicExtendedKey,
    xpriv: identityMaster.privateExtendedKey,
    hdkey: identityMaster,
    recoveryXpub: recoveryAccount.publicExtendedKey,
    recoveryHdkey: recoveryAccount,
  };
}

// Simulates the ssp-key side: receive a recovery request, derive sk_r(i) from
// the recovery account at /0/i, wrap it under ECDH(identityPriv, walletEphPub).
// Mirrors ssp-key lib/recoveryHandler.ts buildRecoveryResponse.
function simulateSspKeyResponse(params) {
  const { sspKey, request } = params;
  const index = request.recoveryIndex ?? 0;

  const recoveryChild = sspKey.recoveryHdkey.deriveChild(0).deriveChild(index);
  const identityChild = sspKey.hdkey.deriveChild(10).deriveChild(0);

  const skR = Buffer.from(recoveryChild.privateKey);
  const sspKeyIdentityPriv = Buffer.from(identityChild.privateKey);
  const walletEphPub = Buffer.from(request.pkEph, 'hex');

  const transit = wrapSkRForTransit(sspKeyIdentityPriv, walletEphPub, skR);

  return {
    version: 2,
    transit,
    nonce: request.nonce,
    timestamp: request.timestamp,
    recoveryIndex: index,
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
    const sspKey = deriveKeyAccounts(SSPKEY_MNEMONIC);
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: sspKey.xpub,
      recoveryXpub: sspKey.recoveryXpub,
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
      sspKey,
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
    const legitSspKey = deriveKeyAccounts(SSPKEY_MNEMONIC);
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: legitSspKey.xpub,
      recoveryXpub: legitSspKey.recoveryXpub,
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
    const attackerSspKey = deriveKeyAccounts(WALLET_MNEMONIC);
    const response = simulateSspKeyResponse({
      sspKey: attackerSspKey,
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
    const sspKey = deriveKeyAccounts(SSPKEY_MNEMONIC);
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: sspKey.xpub,
      recoveryXpub: sspKey.recoveryXpub,
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
      sspKey,
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
    const sspKeyV1 = deriveKeyAccounts(SSPKEY_MNEMONIC);
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: sspKeyV1.xpub,
      recoveryXpub: sspKeyV1.recoveryXpub,
      wkIdentity: 'bc1qtest',
      identityChain: 'btc',
    });

    // Later: user restores ssp-key from the same mnemonic on a new device.
    // Derivation is deterministic, so both accounts come out identical —
    // recovery proceeds with no re-setup needed.
    const sspKeyV2 = deriveKeyAccounts(SSPKEY_MNEMONIC);
    expect(sspKeyV2.xpub).toBe(sspKeyV1.xpub);
    expect(sspKeyV2.recoveryXpub).toBe(sspKeyV1.recoveryXpub);

    const eph = generateEphemeralKeypair();
    const request = {
      pkEph: eph.pub.toString('hex'),
      nonce: generateRecoveryNonce().toString('hex'),
      timestamp: Date.now(),
    };
    const response = simulateSspKeyResponse({
      sspKey: sspKeyV2,
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
    const sspKey = deriveKeyAccounts(SSPKEY_MNEMONIC);

    const newRandomParams = '12'.repeat(64);
    const newPassword = 'fresh-password-after-restore';

    const envelope = await buildRecoveryEnvelope({
      userPassword: newPassword,
      randomParams: newRandomParams,
      xpubKeyIdentity: sspKey.xpub,
      recoveryXpub: sspKey.recoveryXpub,
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
      sspKey,
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

  it('a released child determines its account, so the account is dedicated', async () => {
    // DESIGN CONSTRAINT, pinned here so it cannot be optimised away later.
    //
    // BIP-32 defines a non-hardened child as k_child = (k_parent + IL) mod n
    // with IL = HMAC-SHA512(cc_parent, serP(K_parent) || ser32(i)), and IL is
    // computable from the parent xpub alone. Handing out any non-hardened
    // private child of an account is therefore equivalent to handing out that
    // whole account.
    //
    // The recovery exchange hands out exactly such a child, which is why the
    // account it comes from is provisioned for nothing else.
    const sspKey = deriveKeyAccounts(SSPKEY_MNEMONIC);

    const eph = generateEphemeralKeypair();
    const request = {
      pkEph: eph.pub.toString('hex'),
      nonce: generateRecoveryNonce().toString('hex'),
      timestamp: Date.now(),
      recoveryIndex: 0,
    };
    const response = simulateSspKeyResponse({ sspKey, request });
    const skR = unwrapSkRFromTransit(
      eph.priv,
      Buffer.from(sspKey.hdkey.deriveChild(10).deriveChild(0).publicKey),
      response.transit,
    );

    // Curve order: @noble/curves v1 exposes CURVE.n, v2 Point.Fn.ORDER.
    const N = secp256k1.CURVE?.n ?? secp256k1.Point.Fn.ORDER;
    const toScalar = (bytes) =>
      BigInt('0x' + Buffer.from(bytes).toString('hex'));

    // Reconstruct an account's private key from one released child of it,
    // using only that account's xpub — the relation quoted above, applied to
    // the two non-hardened levels.
    const invert = (accountXpub, child, change, index) => {
      const account = HDKey.fromExtendedKey(accountXpub, blockchains.btc.bip32);
      const level1 = account.deriveChild(change);
      const step = (parentPub, parentCc, i, k) => {
        const data = new Uint8Array(37);
        data.set(parentPub, 0);
        data[33] = (i >>> 24) & 0xff;
        data[34] = (i >>> 16) & 0xff;
        data[35] = (i >>> 8) & 0xff;
        data[36] = i & 0xff;
        const IL = hmac(sha512, parentCc, data).slice(0, 32);
        return (((k - toScalar(IL)) % N) + N) % N;
      };
      const k = step(
        account.publicKey,
        account.chainCode,
        change,
        step(level1.publicKey, level1.chainCode, index, toScalar(child)),
      );
      return k;
    };

    // The released child determines its whole account.
    const recoveredRecoveryK = invert(sspKey.recoveryXpub, skR, 0, 0);
    expect(recoveredRecoveryK).toBe(toScalar(sspKey.recoveryHdkey.privateKey));

    // And it stops there: the signing account is a hardened sibling, so the
    // identity xpub the wallet holds cannot address 99' at all.
    expect(recoveredRecoveryK).not.toBe(toScalar(sspKey.hdkey.privateKey));
    const identityFromXpub = HDKey.fromExtendedKey(
      sspKey.xpub,
      blockchains.btc.bip32,
    );
    expect(() => identityFromXpub.deriveChild(99 + 0x80000000)).toThrow();
  });
  /**
   * The whole sequence in one test, in the order it happens in production, with
   * the real wallet-side modules at every step:
   *
   *   1. ssp-key derives the recovery account and signs its xpub
   *   2. relay stores that record (modelled as a plain object here)
   *   3. wallet fetches it and gates storage on verifying the signature
   *   4. wallet seals an envelope to pk_r(i) derived from the stored xpub
   *   5. fingerprint drifts; wallet asks for sk_r(i) and unwraps the response
   *   6. envelope opens, wallet rotates to i+1
   *   7. the released key no longer opens anything
   */
  it('runs the full publish -> verify -> seal -> release -> rotate sequence', async () => {
    const sspKey = deriveKeyAccounts(SSPKEY_MNEMONIC);
    const wkIdentity = 'bc1qsequencewkidentity0000000000';

    // --- 1. ssp-key signs its recovery account xpub (lib/recoveryPublish.ts) --
    const identityLeaf = sspKey.hdkey.deriveChild(10).deriveChild(0);
    const xpubSignature = fluxnode.signMessage(
      recoveryXpubMessage(wkIdentity, sspKey.recoveryXpub),
      Buffer.from(identityLeaf.privateKey).toString('hex'),
      true,
      blockchains.btc.messagePrefix,
    );

    // --- 2/3. the wallet stores it ONLY if the signature verifies ------------
    expect(readRecoveryXpub()).toBeNull();
    const accepted = storeRecoveryXpub({
      recoveryXpub: sspKey.recoveryXpub,
      signature: xpubSignature,
      wkIdentity,
      xpubKeyIdentity: sspKey.xpub,
      identityChain: 'btc',
    });
    expect(accepted).toBe(true);
    expect(readRecoveryXpub()).toBe(sspKey.recoveryXpub);

    // A record for the same identity signed by a DIFFERENT key is refused, and
    // leaves the good one in place.
    const attacker = deriveKeyAccounts(WALLET_MNEMONIC);
    const attackerLeaf = attacker.hdkey.deriveChild(10).deriveChild(0);
    expect(
      storeRecoveryXpub({
        recoveryXpub: attacker.recoveryXpub,
        signature: fluxnode.signMessage(
          recoveryXpubMessage(wkIdentity, attacker.recoveryXpub),
          Buffer.from(attackerLeaf.privateKey).toString('hex'),
          true,
          blockchains.btc.messagePrefix,
        ),
        wkIdentity,
        xpubKeyIdentity: sspKey.xpub,
        identityChain: 'btc',
      }),
    ).toBe(false);
    expect(readRecoveryXpub()).toBe(sspKey.recoveryXpub);

    // --- 4. seal the envelope to pk_r(0) from the stored account xpub --------
    const envelope = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: sspKey.xpub,
      recoveryXpub: readRecoveryXpub(),
      recoveryIndex: 0,
      wkIdentity,
      identityChain: 'btc',
    });
    persistRecoveryEnvelope(envelope);
    expect(readRecoveryEnvelope().recoveryIndex).toBe(0);

    // --- 5. fingerprint drifts: request, respond, unwrap --------------------
    const eph = generateEphemeralKeypair();
    const request = {
      pkEph: eph.pub.toString('hex'),
      nonce: generateRecoveryNonce().toString('hex'),
      timestamp: Date.now(),
      recoveryIndex: readRecoveryEnvelope().recoveryIndex,
    };
    const response = simulateSspKeyResponse({ sspKey, request });
    expect(response.version).toBe(2);
    expect(response.recoveryIndex).toBe(0);

    const skR0 = unwrapSkRFromTransit(
      eph.priv,
      Buffer.from(readRecoveryEnvelope().keyIdentityPubKey, 'hex'),
      response.transit,
    );

    // --- 6. the envelope opens, then the wallet rotates ---------------------
    expect(
      await decryptRecoveryEnvelope({
        envelope: readRecoveryEnvelope(),
        userPassword: USER_PASSWORD,
        skR: skR0,
      }),
    ).toBe(RANDOM_PARAMS);

    advanceRecoveryIndex();
    // Rotation drops the envelope, so the next unlock rebuilds it.
    expect(readRecoveryEnvelope()).toBeNull();
    // The account xpub survives, so no second round trip is needed.
    expect(readRecoveryXpub()).toBe(sspKey.recoveryXpub);

    const rebuilt = await buildRecoveryEnvelope({
      userPassword: USER_PASSWORD,
      randomParams: RANDOM_PARAMS,
      xpubKeyIdentity: sspKey.xpub,
      recoveryXpub: readRecoveryXpub(),
      recoveryIndex: 1,
      wkIdentity,
      identityChain: 'btc',
    });
    persistRecoveryEnvelope(rebuilt);
    expect(readRecoveryEnvelope().recoveryIndex).toBe(1);

    // --- 7. the key that was already handed over is of no further use -------
    await expect(
      decryptRecoveryEnvelope({
        envelope: rebuilt,
        userPassword: USER_PASSWORD,
        skR: skR0,
      }),
    ).rejects.toThrow();

    // ...and the next index does open it.
    const nextRequest = {
      pkEph: eph.pub.toString('hex'),
      nonce: generateRecoveryNonce().toString('hex'),
      timestamp: Date.now(),
      recoveryIndex: 1,
    };
    const nextResponse = simulateSspKeyResponse({
      sspKey,
      request: nextRequest,
    });
    const skR1 = unwrapSkRFromTransit(
      eph.priv,
      Buffer.from(rebuilt.keyIdentityPubKey, 'hex'),
      nextResponse.transit,
    );
    expect(
      await decryptRecoveryEnvelope({
        envelope: rebuilt,
        userPassword: USER_PASSWORD,
        skR: skR1,
      }),
    ).toBe(RANDOM_PARAMS);

    clearRecoveryEnvelope();
    expect(readRecoveryEnvelope()).toBeNull();
  });
  /**
   * Delivery over the ordinary sync payload — the path the wallet takes from
   * now on. The Key attaches its recovery account xpub plus a signature to the
   * sync record; the wallet verifies against the identity key it derives from
   * the xpub it already holds, so a doc altered in transit is refused.
   */
  it('accepts a recovery xpub delivered on a sync payload, and refuses a tampered one', () => {
    const sspKey = deriveKeyAccounts(SSPKEY_MNEMONIC);
    const wkIdentity = 'bc1qsyncdeliverywkidentity00000';
    const identityLeaf = sspKey.hdkey.deriveChild(10).deriveChild(0);

    const sign = (xpub, signer = identityLeaf) =>
      fluxnode.signMessage(
        recoveryXpubMessage(wkIdentity, xpub),
        Buffer.from(signer.privateKey).toString('hex'),
        true,
        blockchains.btc.messagePrefix,
      );

    // What ssp-key puts on the sync payload.
    const syncDoc = {
      recoveryXpub: sspKey.recoveryXpub,
      xpubSignature: sign(sspKey.recoveryXpub),
    };

    const accept = (doc) =>
      storeRecoveryXpub({
        recoveryXpub: doc.recoveryXpub,
        signature: doc.xpubSignature,
        wkIdentity,
        // Derived from the xpub the wallet already stores for this pairing.
        xpubKeyIdentity: sspKey.xpub,
        identityChain: 'btc',
      });

    expect(accept(syncDoc)).toBe(true);
    expect(readRecoveryXpub()).toBe(sspKey.recoveryXpub);

    // A doc carrying someone else's account, signed by that someone else.
    const attacker = deriveKeyAccounts(WALLET_MNEMONIC);
    const attackerLeaf = attacker.hdkey.deriveChild(10).deriveChild(0);
    expect(
      accept({
        recoveryXpub: attacker.recoveryXpub,
        xpubSignature: sign(attacker.recoveryXpub, attackerLeaf),
      }),
    ).toBe(false);

    // A doc whose xpub was swapped but whose signature was left alone.
    expect(
      accept({
        recoveryXpub: attacker.recoveryXpub,
        xpubSignature: syncDoc.xpubSignature,
      }),
    ).toBe(false);

    // The good value is still the one cached.
    expect(readRecoveryXpub()).toBe(sspKey.recoveryXpub);
  });
});
