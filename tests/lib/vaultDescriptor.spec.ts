// VD (vault descriptor pinning) — wallet implementation against the shared
// cross-implementation vectors generated from the real relay-enterprise code
// (~/repos/sec-2026-10/vd-vectors.json, copied to fixtures/vd-vectors.json).
import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import utxolib from '@runonflux/utxo-lib';
import { Buffer } from 'buffer';
import { blockchains } from '@storage/blockchains';

import {
  VAULT_DESCRIPTOR_MISSING_MESSAGE,
  VaultDescriptorError,
  assertRequestMatchesDescriptor,
  canonicalVaultDescriptorJson,
  computeVaultDescriptorHash,
  parseVaultDescriptor,
  verifyVaultDescriptor,
  wkIdentityOfPubKeys,
  type VaultDescriptorV1,
} from '../../src/lib/vaultDescriptor';
import {
  checkEvmSenderAgainstDescriptor,
  checkEvmSignerKeysAgainstDescriptor,
  deriveEvmVaultSignerKeys,
  checkFluxCollateralAgainstDescriptor,
  checkSolanaPdaAgainstDescriptor,
  checkUtxoTransactionAgainstDescriptor,
  checkVaultSignRequest,
  deriveVaultAddressFromDescriptor,
  vaultAddressesEqual,
} from '../../src/lib/vaultDescriptorDerive';
import { ownVaultAccountXpubFromXpriv } from '../../src/lib/vaultOwnXpub';
import {
  generateAddressKeypair,
  getMasterXpriv,
  getMasterXpub,
} from '../../src/lib/wallet';
import type { cryptos } from '../../src/types';

interface VectorMember {
  name: string;
  walletMnemonic: string;
  keyMnemonic: string;
  walletPubKey: string;
  keyPubKey: string;
  wkWitnessScript: string;
  wkIdentity: string;
}

interface VectorDerived {
  typeIndex: number;
  addressIndex: number;
  address: string;
  witnessScript?: string | null;
  redeemScript?: string | null;
  scriptPubKey?: string;
  multisigPda?: string;
  vaultPda?: string;
  solanaMembersSorted?: string[];
  solanaThreshold?: number;
  programId?: string;
}

interface Vector {
  name: string;
  descriptor: VaultDescriptorV1;
  canonicalJson: string;
  descriptorHash: string;
  derived: VectorDerived[];
}

interface VectorsFile {
  members: VectorMember[];
  vectors: Vector[];
  negativeHashVectors: Array<{
    what: string;
    canonicalJson: string;
    descriptorHash: string;
  }>;
}

const fixtureUrl = new URL('./fixtures/vd-vectors.json', import.meta.url);
const vectorsFile = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as VectorsFile;
const sharedPath = new URL('../../../vd-vectors.json', import.meta.url);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const memberByWk = (wk: string): VectorMember => {
  const member = vectorsFile.members.find((m) => m.wkIdentity === wk);
  if (!member) throw new Error(`no vector member ${wk}`);
  return member;
};
const vector = (name: string): Vector => {
  const found = vectorsFile.vectors.find((v) => v.name === name);
  if (!found) throw new Error(`no vector ${name}`);
  return found;
};

/** This member's own account xpub, computed exactly as the wallet does. */
function ownXpub(mnemonic: string, d: VaultDescriptorV1): string {
  const chain = d.chain as keyof cryptos;
  const config = blockchains[chain];
  const xpriv = getMasterXpriv(
    mnemonic,
    48,
    config.slip,
    d.orgIndex,
    config.scriptType,
    chain,
  );
  return ownVaultAccountXpubFromXpriv(xpriv, d.chain, d.vaultIndex);
}

/** Re-hash after a deliberate edit so only the targeted check can fail. */
function rehash(d: VaultDescriptorV1): string {
  return computeVaultDescriptorHash(parseVaultDescriptor(d));
}

function expectCode(fn: () => unknown, code: VaultDescriptorError['code']) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(VaultDescriptorError);
    expect((error as VaultDescriptorError).code).toBe(code);
    return error as VaultDescriptorError;
  }
  throw new Error(`expected VaultDescriptorError(${code})`);
}

describe('shared vectors fixture', () => {
  it('is identical to the shared vd-vectors.json when it is present', () => {
    if (!existsSync(sharedPath)) return;
    expect(readFileSync(fixtureUrl, 'utf8')).toBe(
      readFileSync(sharedPath, 'utf8'),
    );
  });

  it('covers every chain family and signing mode', () => {
    expect(vectorsFile.vectors.map((v) => v.name)).toEqual(
      expect.arrayContaining([
        'btc-p2wsh-dual-2of3',
        'flux-p2sh-key_only-2of3',
        'eth-evm-dual-1of2',
        'solMainnet-sol_dual-2of3',
        'solMainnet-sol_single-2of2',
      ]),
    );
  });
});

describe('canonicalJson + descriptorHash (VD-1, byte-for-byte)', () => {
  it.each(vectorsFile.vectors.map((v) => [v.name, v] as const))(
    '%s',
    (_name, v) => {
      const d = parseVaultDescriptor(v.descriptor);
      expect(canonicalVaultDescriptorJson(d)).toBe(v.canonicalJson);
      expect(computeVaultDescriptorHash(d)).toBe(v.descriptorHash);
    },
  );

  it('negative vectors hash to what the server computed, never to vectors[0]', () => {
    for (const negative of vectorsFile.negativeHashVectors) {
      const d = JSON.parse(negative.canonicalJson) as VaultDescriptorV1;
      expect(canonicalVaultDescriptorJson(parseVaultDescriptor(d))).toBe(
        negative.canonicalJson,
      );
      expect(computeVaultDescriptorHash(parseVaultDescriptor(d))).toBe(
        negative.descriptorHash,
      );
      expect(negative.descriptorHash).not.toBe(
        vectorsFile.vectors[0].descriptorHash,
      );
    }
  });

  it('serialises missing optional values as null and never extra keys', () => {
    const d = clone(vector('solMainnet-sol_single-2of2').descriptor);
    const raw = d as unknown as { members: Array<Record<string, unknown>> };
    delete raw.members[0].xpubKey;
    expect(canonicalVaultDescriptorJson(parseVaultDescriptor(d))).toContain(
      '"xpubKey":null',
    );
  });
});

describe('WK identity construction', () => {
  it.each(vectorsFile.members.map((m) => [m.name, m] as const))(
    '%s: P2WSH 2-of-2 of the sorted pubkeys',
    (_name, m) => {
      expect(
        wkIdentityOfPubKeys(
          m.walletPubKey,
          m.keyPubKey,
          utxolib.networks.bitcoin,
        ),
      ).toBe(m.wkIdentity);
    },
  );
});

describe('verifyVaultDescriptor (VD-3) — every vector, every member', () => {
  for (const v of vectorsFile.vectors) {
    for (const member of v.descriptor.members) {
      it(`${v.name}: verifies for ${memberByWk(member.wkIdentity).name}`, () => {
        const m = memberByWk(member.wkIdentity);
        const own = ownXpub(m.walletMnemonic, v.descriptor);
        // The wallet's own xpub derivation equals what it submitted.
        expect(own).toBe(member.xpubWallet);
        const verified = verifyVaultDescriptor(
          clone(v.descriptor),
          v.descriptorHash,
          m.wkIdentity,
          'wallet',
          own,
        );
        expect(verified.hash).toBe(v.descriptorHash);
        expect(verified.totalSigners).toBe(v.descriptor.members.length);
        expect(
          verified.descriptor.members[verified.ownMemberIndex].wkIdentity,
        ).toBe(m.wkIdentity);
      });
    }
  }

  const btc = vector('btc-p2wsh-dual-2of3');
  const alice = vectorsFile.members[0];
  const aliceXpub = () => ownXpub(alice.walletMnemonic, btc.descriptor);
  const verifyWith = (
    d: VaultDescriptorV1,
    hash = rehash(d),
    xpub = aliceXpub(),
  ) => verifyVaultDescriptor(d, hash, alice.wkIdentity, 'wallet', xpub);

  it('missing descriptor or hash: "Update required: vault descriptor missing"', () => {
    for (const [d, h] of [
      [undefined, btc.descriptorHash],
      [null, btc.descriptorHash],
      [clone(btc.descriptor), undefined],
      [clone(btc.descriptor), ''],
    ] as const) {
      const error = expectCode(
        () =>
          verifyVaultDescriptor(d, h, alice.wkIdentity, 'wallet', aliceXpub()),
        'missing',
      );
      expect(error.message).toBe(VAULT_DESCRIPTOR_MISSING_MESSAGE);
    }
  });

  it('1. refuses a hash that does not match (negative vector: M 2 -> 1)', () => {
    const negative = JSON.parse(
      vectorsFile.negativeHashVectors[0].canonicalJson,
    ) as VaultDescriptorV1;
    expectCode(() => verifyWith(negative, btc.descriptorHash), 'hash_mismatch');
    expectCode(
      () => verifyWith(clone(btc.descriptor), 'ab'.repeat(32)),
      'hash_mismatch',
    );
    expectCode(
      () => verifyWith(clone(btc.descriptor), btc.descriptorHash.toUpperCase()),
      'malformed',
    );
  });

  it('2. refuses unsorted members even when the hash matches (negative vector)', () => {
    const negative = vectorsFile.negativeHashVectors.find((n) =>
      n.what.includes('reversed'),
    )!;
    const error = expectCode(
      () =>
        verifyWith(
          JSON.parse(negative.canonicalJson) as VaultDescriptorV1,
          negative.descriptorHash,
        ),
      'malformed',
    );
    expect(error.message).toContain('sorted');
  });

  it('2. refuses duplicate members, bad indices, thresholds and limits', () => {
    const dup = clone(btc.descriptor);
    dup.members[1] = clone(dup.members[0]);
    expectCode(() => verifyWith(dup), 'malformed');

    for (const orgIndex of [0, 99, 100000, 1337.5]) {
      const d = clone(btc.descriptor);
      d.orgIndex = orgIndex;
      expectCode(() => verifyWith(d, btc.descriptorHash), 'malformed');
    }
    for (const vaultIndex of [-1, 2 ** 31, 1.5]) {
      const d = clone(btc.descriptor);
      d.vaultIndex = vaultIndex;
      expectCode(() => verifyWith(d, btc.descriptorHash), 'malformed');
    }
    for (const requiredSigners of [0, 4]) {
      const d = clone(btc.descriptor);
      d.requiredSigners = requiredSigners;
      expectCode(() => verifyWith(d), 'malformed');
    }
    const badMode = clone(btc.descriptor);
    badMode.signingMode = 'sol_dual';
    expectCode(() => verifyWith(badMode), 'unsupported');

    const v2 = clone(btc.descriptor) as unknown as Record<string, unknown>;
    v2.v = 2;
    expectCode(
      () => verifyWith(v2 as unknown as VaultDescriptorV1, btc.descriptorHash),
      'unsupported',
    );
    const extra = clone(btc.descriptor) as unknown as Record<string, unknown>;
    extra.note = 'x';
    expectCode(
      () =>
        verifyWith(extra as unknown as VaultDescriptorV1, btc.descriptorHash),
      'malformed',
    );
    const badId = clone(btc.descriptor);
    badId.vaultId = 'a:b';
    expectCode(() => verifyWith(badId, btc.descriptorHash), 'malformed');
  });

  it('2. refuses more signers than the server allows for the vault type', () => {
    const eth = clone(vector('eth-evm-dual-1of2').descriptor);
    // Dual EVM caps at 4 members; pad with copies of a member (the limit
    // check runs before the sort/identity checks).
    while (eth.members.length < 5) eth.members.push(clone(eth.members[0]));
    expectCode(
      () =>
        verifyVaultDescriptor(
          eth,
          rehash(eth),
          alice.wkIdentity,
          'wallet',
          'x',
        ),
      'malformed',
    );
  });

  it('2. Solana: N >= 2, M >= 2 and a u8 vault index', () => {
    const sol = vector('solMainnet-sol_single-2of2');
    const lowM = clone(sol.descriptor);
    lowM.requiredSigners = 1;
    expectCode(
      () =>
        verifyVaultDescriptor(
          lowM,
          rehash(lowM),
          alice.wkIdentity,
          'wallet',
          'x',
        ),
      'malformed',
    );
    const bigIndex = clone(sol.descriptor);
    bigIndex.vaultIndex = 256;
    expectCode(
      () =>
        verifyVaultDescriptor(
          bigIndex,
          rehash(bigIndex),
          alice.wkIdentity,
          'wallet',
          'x',
        ),
      'malformed',
    );
  });

  it('3. refuses a member whose WK identity is not its pubkeys', () => {
    const swapped = clone(btc.descriptor);
    swapped.members[1].walletPubKey = vectorsFile.members[2].walletPubKey;
    expectCode(() => verifyWith(swapped), 'identity_invalid');

    const same = clone(btc.descriptor);
    same.members[1].keyPubKey = same.members[1].walletPubKey;
    expectCode(() => verifyWith(same), 'identity_invalid');

    const offCurve = clone(btc.descriptor);
    offCurve.members[1].keyPubKey = '02' + 'ff'.repeat(32);
    expectCode(() => verifyWith(offCurve), 'identity_invalid');

    const otherNetwork = clone(btc.descriptor);
    otherNetwork.members[2].wkIdentity =
      'zz' + otherNetwork.members[2].wkIdentity.slice(2);
    expectCode(() => verifyWith(otherNetwork), 'identity_invalid');
  });

  it('4. refuses an xpub substituted without a valid attestation', () => {
    // The relay swaps bob's key xpub for carol's (a valid xpub with a valid
    // attestation — by carol, not bob).
    const substituted = clone(btc.descriptor);
    substituted.members[1].xpubKey = substituted.members[2].xpubKey;
    substituted.members[1].keyXpubSignature =
      substituted.members[2].keyXpubSignature;
    const error = expectCode(
      () => verifyWith(substituted),
      'attestation_invalid',
    );
    expect(error.message).toContain('members[1]');

    const negative = vectorsFile.negativeHashVectors.find((n) =>
      n.what.includes('keyXpubSignature'),
    )!;
    expectCode(
      () =>
        verifyWith(
          JSON.parse(negative.canonicalJson) as VaultDescriptorV1,
          negative.descriptorHash,
        ),
      'attestation_invalid',
    );

    // Attestations are bound to the chain and the org index.
    const otherOrg = clone(btc.descriptor);
    otherOrg.orgIndex = 1338;
    expectCode(() => verifyWith(otherOrg), 'attestation_invalid');
  });

  it('4. key_only: wallet xpubs are not used, key xpubs must be attested', () => {
    const flux = vector('flux-p2sh-key_only-2of3');
    const fluxAlice = ownXpub(alice.walletMnemonic, flux.descriptor);
    const noWallet = clone(flux.descriptor);
    noWallet.members[1].xpubWallet = null;
    noWallet.members[1].walletXpubSignature = null;
    expect(() =>
      verifyVaultDescriptor(
        noWallet,
        rehash(noWallet),
        alice.wkIdentity,
        'wallet',
        fluxAlice,
      ),
    ).not.toThrow();
    const badKey = clone(flux.descriptor);
    badKey.members[2].keyXpubSignature = badKey.members[1].keyXpubSignature;
    expectCode(
      () =>
        verifyVaultDescriptor(
          badKey,
          rehash(badKey),
          alice.wkIdentity,
          'wallet',
          fluxAlice,
        ),
      'attestation_invalid',
    );
  });

  it('5. refuses when this wallet is not a member', () => {
    const outsider = 'bc1q' + 'q'.repeat(58);
    expectCode(
      () =>
        verifyVaultDescriptor(
          clone(btc.descriptor),
          btc.descriptorHash,
          outsider,
          'wallet',
          aliceXpub(),
        ),
      'not_member',
    );
    const eth = vector('eth-evm-dual-1of2');
    const carol = vectorsFile.members[2];
    expectCode(
      () =>
        verifyVaultDescriptor(
          clone(eth.descriptor),
          eth.descriptorHash,
          carol.wkIdentity,
          'wallet',
          'x',
        ),
      'not_member',
    );
  });

  it("5. refuses when the member's wallet xpub is not this device's own", () => {
    const bob = vectorsFile.members[1];
    expectCode(
      () =>
        verifyVaultDescriptor(
          clone(btc.descriptor),
          btc.descriptorHash,
          alice.wkIdentity,
          'wallet',
          ownXpub(bob.walletMnemonic, btc.descriptor),
        ),
      'xpub_mismatch',
    );
    expectCode(
      () =>
        verifyVaultDescriptor(
          clone(btc.descriptor),
          btc.descriptorHash,
          alice.wkIdentity,
          'wallet',
          '',
        ),
      'xpub_mismatch',
    );
  });

  it('binds the request to the verified vault (chain, org, vault index)', () => {
    const d = parseVaultDescriptor(btc.descriptor);
    expect(() =>
      assertRequestMatchesDescriptor(d, {
        chain: 'btc',
        orgIndex: 1337,
        vaultIndex: 3,
      }),
    ).not.toThrow();
    for (const request of [
      { chain: 'ltc', orgIndex: 1337, vaultIndex: 3 },
      { chain: 'btc', orgIndex: 1338, vaultIndex: 3 },
      { chain: 'btc', orgIndex: 1337, vaultIndex: 4 },
    ]) {
      expectCode(
        () => assertRequestMatchesDescriptor(d, request),
        'request_mismatch',
      );
    }
  });
});

describe('deriveVaultAddressFromDescriptor (VD-4) — every derived vector', () => {
  for (const v of vectorsFile.vectors) {
    for (const expected of v.derived) {
      it(`${v.name} @ ${expected.typeIndex}/${expected.addressIndex}`, () => {
        const d = parseVaultDescriptor(v.descriptor);
        const derived = deriveVaultAddressFromDescriptor(
          d,
          expected.typeIndex,
          expected.addressIndex,
        );
        expect(derived.address).toBe(expected.address);
        if (expected.scriptPubKey !== undefined) {
          expect(derived.witnessScript ?? null).toBe(
            expected.witnessScript ?? null,
          );
          expect(derived.redeemScript ?? null).toBe(
            expected.redeemScript ?? null,
          );
          expect(derived.scriptPubKey).toBe(expected.scriptPubKey);
        }
        if (expected.multisigPda !== undefined) {
          expect(derived.solanaMultisigPda).toBe(expected.multisigPda);
          expect(derived.address).toBe(expected.vaultPda);
          expect(derived.solanaMembers).toEqual(expected.solanaMembersSorted);
          expect(derived.solanaThreshold).toBe(expected.solanaThreshold);
          expect(blockchains[d.chain as keyof cryptos].programId).toBe(
            expected.programId,
          );
        }
      });
    }
  }

  it('refuses invalid indices and Solana indices outside the 20-key pool', () => {
    const btc = parseVaultDescriptor(vector('btc-p2wsh-dual-2of3').descriptor);
    expectCode(() => deriveVaultAddressFromDescriptor(btc, -1, 0), 'malformed');
    expectCode(
      () => deriveVaultAddressFromDescriptor(btc, 3, 2 ** 31),
      'malformed',
    );
    const sol = parseVaultDescriptor(
      vector('solMainnet-sol_dual-2of3').descriptor,
    );
    expectCode(() => deriveVaultAddressFromDescriptor(sol, 4, 20), 'malformed');
  });
});

// ---------------------------------------------------------------------------
// VD-4 sign-time checks
// ---------------------------------------------------------------------------

// utxo-lib's bundled typings omit the signing surface used below.
interface LooseTxBuilder {
  addInput(txid: string, vout: number): void;
  addOutput(address: string, value: number): void;
  sign(
    vin: number,
    keyPair: unknown,
    redeemScript: Buffer | undefined,
    hashType: number,
    value: number,
    witnessScript: Buffer,
  ): void;
  buildIncomplete(): { toHex(): string };
}
const lib = utxolib as unknown as {
  TransactionBuilder: new (network: unknown) => LooseTxBuilder;
  ECPair: { fromWIF(wif: string, network: unknown): unknown };
  Transaction: { SIGHASH_ALL: number };
  script: {
    multisig: { output: { encode(m: number, keys: Buffer[]): Buffer } };
  };
};

const RECIPIENT = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

function btcTx(outputs: Array<[string, number]>, inputs = 1): string {
  const txb = new lib.TransactionBuilder(utxolib.networks.bitcoin);
  for (let i = 0; i < inputs; i++) txb.addInput('aa'.repeat(32), i);
  for (const [address, value] of outputs) txb.addOutput(address, value);
  return txb.buildIncomplete().toHex();
}

describe('UTXO inputs, change and recipients against the descriptor', () => {
  const v = vector('btc-p2wsh-dual-2of3');
  const d = parseVaultDescriptor(v.descriptor);
  const at = (i: number) =>
    deriveVaultAddressFromDescriptor(d, d.vaultIndex, i);

  it('accepts inputs carrying the derived scripts; change is any vault address', () => {
    const raw = btcTx(
      [
        [RECIPIENT, 50_000],
        [at(1).address, 20_000],
        [at(7).address, 10_000],
      ],
      2,
    );
    const result = checkUtxoTransactionAgainstDescriptor(d, raw, [
      { addressIndex: 1, witnessScript: at(1).witnessScript, amount: '60000' },
      { addressIndex: 1, witnessScript: at(1).witnessScript, amount: '30000' },
    ]);
    expect(result.inputAddressIndexes).toEqual([1, 1]);
    expect(result.sourceAddress).toBe(v.derived[1].address);
    expect(result.outputs).toEqual([
      { address: RECIPIENT, amount: '50000', vaultAddressIndex: null },
      { address: at(1).address, amount: '20000', vaultAddressIndex: 1 },
      { address: at(7).address, amount: '10000', vaultAddressIndex: 7 },
    ]);
  });

  it('refuses an input whose script is not the vault script at its index', () => {
    const raw = btcTx([[RECIPIENT, 50_000]]);
    const error = expectCode(
      () =>
        checkUtxoTransactionAgainstDescriptor(d, raw, [
          { addressIndex: 0, witnessScript: at(1).witnessScript },
        ]),
      'derivation_mismatch',
    );
    expect(error.message).toContain('input 0');
    // Attacker 1-of-1 script that the relay presents as a vault input.
    const attackerScript = lib.script.multisig.output
      .encode(1, [Buffer.from(vectorsFile.members[0].walletPubKey, 'hex')])
      .toString('hex');
    expectCode(
      () =>
        checkUtxoTransactionAgainstDescriptor(d, raw, [
          { addressIndex: 0, witnessScript: attackerScript },
        ]),
      'derivation_mismatch',
    );
  });

  it('refuses a missing script, a P2SH wrapper on a P2WSH vault, or bad indices', () => {
    const raw = btcTx([[RECIPIENT, 50_000]]);
    for (const input of [
      { addressIndex: 0 },
      {
        addressIndex: 0,
        witnessScript: at(0).witnessScript,
        redeemScript: '0020' + '00'.repeat(32),
      },
      { addressIndex: -1, witnessScript: at(0).witnessScript },
      { addressIndex: '0', witnessScript: at(0).witnessScript },
    ]) {
      expectCode(
        () => checkUtxoTransactionAgainstDescriptor(d, raw, [input]),
        'derivation_mismatch',
      );
    }
  });

  it('refuses input details that do not match the transaction inputs', () => {
    const raw = btcTx([[RECIPIENT, 50_000]], 2);
    expectCode(
      () =>
        checkUtxoTransactionAgainstDescriptor(d, raw, [
          { addressIndex: 0, witnessScript: at(0).witnessScript },
        ]),
      'derivation_mismatch',
    );
    expectCode(
      () => checkUtxoTransactionAgainstDescriptor(d, 'zz', []),
      'derivation_mismatch',
    );
  });

  it("refuses a partly signed transaction whose embedded script is not the vault's", () => {
    const alice = vectorsFile.members[0];
    const xpriv = getMasterXpriv(
      alice.walletMnemonic,
      48,
      0,
      1337,
      'p2wsh',
      'btc',
    );
    const keypair = generateAddressKeypair(xpriv, d.vaultIndex, 0, 'btc');
    const keyPair = lib.ECPair.fromWIF(
      keypair.privKey,
      utxolib.networks.bitcoin,
    );
    const sign = (witnessScript: Buffer) => {
      const txb = new lib.TransactionBuilder(utxolib.networks.bitcoin);
      txb.addInput('aa'.repeat(32), 0);
      txb.addOutput(RECIPIENT, 50_000);
      txb.sign(
        0,
        keyPair,
        undefined,
        lib.Transaction.SIGHASH_ALL,
        60_000,
        witnessScript,
      );
      return txb.buildIncomplete().toHex();
    };
    const honest = sign(Buffer.from(at(0).witnessScript!, 'hex'));
    expect(
      checkUtxoTransactionAgainstDescriptor(d, honest, [
        { addressIndex: 0, witnessScript: at(0).witnessScript },
      ]).sourceAddress,
    ).toBe(at(0).address);
    const forged = sign(
      lib.script.multisig.output.encode(1, [
        Buffer.from(keypair.pubKey, 'hex'),
      ]),
    );
    expectCode(
      () =>
        checkUtxoTransactionAgainstDescriptor(d, forged, [
          { addressIndex: 0, witnessScript: at(0).witnessScript },
        ]),
      'derivation_mismatch',
    );
  });

  it('checkVaultSignRequest runs the UTXO check', () => {
    const raw = btcTx([[RECIPIENT, 50_000]]);
    const result = checkVaultSignRequest(d, {
      isMessageSign: false,
      rawUnsignedTx: raw,
      inputDetails: [{ addressIndex: 0, witnessScript: at(0).witnessScript }],
    });
    expect(result.sourceAddress).toBe(v.derived[0].address);
    expect(result.utxo?.outputs[0].vaultAddressIndex).toBeNull();
  });
});

describe('Flux node collateral (P2SH, key_only) against the descriptor', () => {
  const v = vector('flux-p2sh-key_only-2of3');
  const d = parseVaultDescriptor(v.descriptor);
  const expected = v.derived[0];

  it('accepts the derived redeem script and collateral address', () => {
    expect(
      checkFluxCollateralAgainstDescriptor(
        d,
        expected.addressIndex,
        expected.redeemScript!,
        expected.address,
      ).address,
    ).toBe(expected.address);
  });

  it('refuses a redeem script or address of another index', () => {
    const other = v.derived[1];
    expectCode(
      () =>
        checkFluxCollateralAgainstDescriptor(
          d,
          expected.addressIndex,
          other.redeemScript!,
        ),
      'derivation_mismatch',
    );
    expectCode(
      () =>
        checkFluxCollateralAgainstDescriptor(
          d,
          expected.addressIndex,
          expected.redeemScript!,
          other.address,
        ),
      'derivation_mismatch',
    );
  });
});

describe('EVM signer keys against the descriptor (VD-4, parity with SSP Key)', () => {
  const v = vector('eth-evm-dual-1of2');
  const d = parseVaultDescriptor(v.descriptor);
  // Server-generated child keys of every vault key (relay-enterprise order).
  const serverKeys = (addressIndex: number): string[] =>
    (
      v.derived.find(
        (entry) => entry.addressIndex === addressIndex,
      ) as unknown as {
        childPubKeys: Array<{ pubKey: string }>;
      }
    ).childPubKeys.map((key) => key.pubKey);
  const own = (addressIndex: number): string =>
    (
      v.derived.find(
        (entry) => entry.addressIndex === addressIndex,
      ) as unknown as {
        childPubKeys: Array<{
          wkIdentity: string;
          device: string;
          pubKey: string;
        }>;
      }
    ).childPubKeys.find(
      (key) =>
        key.wkIdentity === d.members[0].wkIdentity && key.device === 'wallet',
    )!.pubKey;
  // A valid compressed key that is not a vault key: the member's WK identity
  // key (a relay could hand out any key it likes).
  const foreign = d.members[1].walletPubKey;

  it('derives exactly the server keys, in the server order', () => {
    for (const entry of v.derived) {
      expect(deriveEvmVaultSignerKeys(d, entry.addressIndex)).toEqual(
        serverKeys(entry.addressIndex),
      );
    }
  });

  it('accepts the full set and any subset that holds this wallet’s key', () => {
    const keys = serverKeys(0);
    expect(
      checkEvmSignerKeysAgainstDescriptor(d, 0, keys, own(0).toUpperCase()),
    ).toEqual(keys);
    const pair = keys.filter((key, i) => key === own(0) || i === 1);
    expect(checkEvmSignerKeysAgainstDescriptor(d, 0, pair, own(0))).toEqual(
      pair,
    );
  });

  it('refuses a relay-chosen key, a duplicate, or another address index', () => {
    const keys = serverKeys(0);
    expectCode(
      () =>
        checkEvmSignerKeysAgainstDescriptor(d, 0, [own(0), foreign], own(0)),
      'derivation_mismatch',
    );
    expectCode(
      () => checkEvmSignerKeysAgainstDescriptor(d, 0, [own(0), own(0)], own(0)),
      'derivation_mismatch',
    );
    expectCode(
      () => checkEvmSignerKeysAgainstDescriptor(d, 1, keys, own(1)),
      'derivation_mismatch',
    );
  });

  it("refuses a signer set without this wallet's own key (unless the wallet does not sign)", () => {
    const others = serverKeys(0).filter((key) => key !== own(0));
    expectCode(
      () => checkEvmSignerKeysAgainstDescriptor(d, 0, others, own(0)),
      'derivation_mismatch',
    );
    // key_only forwarding: the wallet holds no key of the set.
    expect(checkEvmSignerKeysAgainstDescriptor(d, 0, others, null)).toEqual(
      others,
    );
  });

  it('refuses malformed lists and non-EVM vaults', () => {
    for (const bad of [undefined, null, [], 'not-an-array', [42], ['']]) {
      expectCode(
        () => checkEvmSignerKeysAgainstDescriptor(d, 0, bad, null),
        'derivation_mismatch',
      );
    }
    const btc = parseVaultDescriptor(vector('btc-p2wsh-dual-2of3').descriptor);
    expectCode(
      () => checkEvmSignerKeysAgainstDescriptor(btc, 0, serverKeys(0), null),
      'derivation_mismatch',
    );
  });
});

describe('EVM sender against the descriptor', () => {
  const v = vector('eth-evm-dual-1of2');
  const d = parseVaultDescriptor(v.descriptor);

  it('accepts the derived account (any hex case) at the proposal index', () => {
    for (const expected of v.derived) {
      expect(
        checkEvmSenderAgainstDescriptor(
          d,
          expected.address.toLowerCase(),
          expected.addressIndex,
        ).address,
      ).toBe(expected.address);
    }
  });

  it('refuses a sender of another index or an attacker account', () => {
    expectCode(
      () => checkEvmSenderAgainstDescriptor(d, v.derived[1].address, 0),
      'derivation_mismatch',
    );
    expectCode(
      () =>
        checkEvmSenderAgainstDescriptor(
          d,
          '0x000000000000000000000000000000000000dEaD',
          0,
        ),
      'derivation_mismatch',
    );
    expectCode(
      () => checkEvmSenderAgainstDescriptor(d, undefined, 0),
      'derivation_mismatch',
    );
  });

  it('message signing derives the vault account; non-EVM is refused', () => {
    expect(
      checkVaultSignRequest(d, {
        isMessageSign: true,
        rawUnsignedTx: '0x' + '11'.repeat(32),
        inputDetails: [{ index: 0, addressIndex: 1, amount: '0' }],
      }).sourceAddress,
    ).toBe(v.derived[1].address);
    const btc = parseVaultDescriptor(vector('btc-p2wsh-dual-2of3').descriptor);
    expectCode(
      () =>
        checkVaultSignRequest(btc, {
          isMessageSign: true,
          rawUnsignedTx: '0x' + '11'.repeat(32),
          inputDetails: [{ addressIndex: 0 }],
        }),
      'derivation_mismatch',
    );
  });
});

describe('Solana PDAs against the descriptor', () => {
  const v = vector('solMainnet-sol_dual-2of3');
  const d = parseVaultDescriptor(v.descriptor);
  const expected = v.derived[1];

  it('accepts the derived multisig PDA and vault PDA', () => {
    expect(
      checkSolanaPdaAgainstDescriptor(
        d,
        expected.multisigPda,
        expected.vaultPda,
        expected.addressIndex,
      ).address,
    ).toBe(expected.vaultPda);
    // approve-only bytes carry no vault PDA of their own
    expect(() =>
      checkSolanaPdaAgainstDescriptor(
        d,
        expected.multisigPda,
        undefined,
        expected.addressIndex,
      ),
    ).not.toThrow();
  });

  it('refuses another multisig, another index, or a foreign vault PDA', () => {
    expectCode(
      () =>
        checkSolanaPdaAgainstDescriptor(
          d,
          v.derived[0].multisigPda,
          undefined,
          expected.addressIndex,
        ),
      'derivation_mismatch',
    );
    expectCode(
      () =>
        checkSolanaPdaAgainstDescriptor(
          d,
          expected.multisigPda,
          v.derived[0].vaultPda,
          expected.addressIndex,
        ),
      'derivation_mismatch',
    );
    expectCode(
      () =>
        checkSolanaPdaAgainstDescriptor(
          d,
          undefined,
          undefined,
          expected.addressIndex,
        ),
      'derivation_mismatch',
    );
  });
});

describe('own account xpub', () => {
  it('equals getMasterXpub for UTXO/EVM accounts', () => {
    const alice = vectorsFile.members[0];
    for (const name of ['btc-p2wsh-dual-2of3', 'eth-evm-dual-1of2']) {
      const d = vector(name).descriptor;
      const chain = d.chain as keyof cryptos;
      const config = blockchains[chain];
      expect(ownXpub(alice.walletMnemonic, d)).toBe(
        getMasterXpub(
          alice.walletMnemonic,
          48,
          config.slip,
          d.orgIndex,
          config.scriptType,
          chain,
        ),
      );
    }
  });
});

describe('address comparison', () => {
  it('is case-insensitive except on Solana', () => {
    expect(vaultAddressesEqual('eth', '0xAbC', '0xabc')).toBe(true);
    expect(vaultAddressesEqual('solMainnet', 'AbC', 'abc')).toBe(false);
    expect(vaultAddressesEqual('btc', '', '')).toBe(false);
  });
});
