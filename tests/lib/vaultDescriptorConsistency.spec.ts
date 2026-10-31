// VD-3 consistency, wallet side: SSP Wallet and SSP Key must refuse exactly
// the same descriptors. SSP Key runs the same tampered descriptors in
// tests/lib/vaultDescriptorConsistency.test.ts and expects the same hashes,
// so the two canonical forms also agree beyond the five shared vectors.
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { fluxnode } from '@runonflux/flux-sdk';
import {
  VaultDescriptorError,
  assertRequestMatchesDescriptor,
  computeVaultDescriptorHash,
  parseVaultDescriptor,
  verifyVaultDescriptor,
  vaultXpubAttestationMessage,
  type VaultDescriptorV1,
} from '../../src/lib/vaultDescriptor';
import {
  generateAddressKeypair,
  getMasterXpriv,
  wifToPrivateKey,
} from '../../src/lib/wallet';

interface Member {
  name: string;
  walletMnemonic: string;
  walletPubKey: string;
  wkIdentity: string;
}
const V = JSON.parse(
  readFileSync(new URL('./fixtures/vd-vectors.json', import.meta.url), 'utf8'),
) as {
  members: Member[];
  vectors: Array<{
    name: string;
    descriptor: VaultDescriptorV1;
    descriptorHash: string;
  }>;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const BTC = V.vectors.find((v) => v.name === 'btc-p2wsh-dual-2of3')!;
const member = (wk: string) => V.members.find((m) => m.wkIdentity === wk)!;
const ALICE = member(BTC.descriptor.members[0].wkIdentity);

/** Bitcoin message signature by a member's wallet identity key (/10/0). */
function signAsWalletIdentity(m: Member, message: string): string {
  const xpriv = getMasterXpriv(m.walletMnemonic, 48, 0, 0, 'p2wsh', 'btc');
  const identity = generateAddressKeypair(xpriv, 10, 0, 'btc');
  expect(identity.pubKey).toBe(m.walletPubKey);
  return fluxnode.signMessage(
    message,
    wifToPrivateKey(identity.privKey, 'btc'),
    true,
    '\x18Bitcoin Signed Message:\n',
  );
}

type Raw = Record<string, unknown> & {
  members: Array<Record<string, unknown>>;
};

/**
 * Tampered copies of the BTC dual vector, each re-hashed (canonical form) so
 * only the targeted rule can refuse it. Same list, same order, same expected
 * hashes as SSP Key's copy of this test.
 */
const TAMPERS: Array<{
  what: string;
  /** sha256(canonicalJson) — SSP Key's test expects the same value. */
  hash: string;
  /** This implementation's refusal reason. */
  reason: RegExp;
  tamper: (d: Raw) => void;
}> = [
  {
    what: 'orgId not lowercase',
    hash: 'ed3332497c01ac62204f72518a5f28e95c8d6284ac59b95cc9d1f84adebe3978',
    reason: /orgId is invalid/,
    tamper: (d) => {
      d.orgId = (d.orgId as string).toUpperCase();
    },
  },
  {
    what: 'vaultId not lowercase',
    hash: 'cfc2c2102d401fa1cb6bf673335ef720a1190c7b901ff30d7b5b438ca4c5fc0f',
    reason: /vaultId is invalid/,
    tamper: (d) => {
      d.vaultId = (d.vaultId as string).toUpperCase();
    },
  },
  {
    what: 'signingMode null (the server always sends the effective mode)',
    hash: '41c94aea5fe890ce1071107ae2a566ce6973554770eb48e7af88b6e2d3d4b395',
    reason: /signing mode null is not valid/,
    tamper: (d) => {
      d.signingMode = null;
    },
  },
  {
    what: 'signingMode absent',
    hash: '41c94aea5fe890ce1071107ae2a566ce6973554770eb48e7af88b6e2d3d4b395',
    reason: /signing mode null is not valid/,
    tamper: (d) => {
      delete d.signingMode;
    },
  },
  {
    what: 'members not sorted by wkIdentity',
    hash: '32d32a8458abee40ac1d46c8c9a6c8369fe97fff61f01829a14b0305ce8bd894',
    reason: /not sorted and unique/,
    tamper: (d) => {
      d.members.reverse();
    },
  },
  {
    what: 'unknown descriptor field (not hashed)',
    hash: '0fdc2aff1f51820a316854249842f12d09f038c9440361e336e44b3578ca31d2',
    reason: /unexpected field "note"/,
    tamper: (d) => {
      d.note = 'x';
    },
  },
  {
    what: 'unknown member field (not hashed)',
    hash: '0fdc2aff1f51820a316854249842f12d09f038c9440361e336e44b3578ca31d2',
    reason: /unexpected field "note"/,
    tamper: (d) => {
      d.members[0].note = 'x';
    },
  },
  {
    what: "a member attests another member's xpub (key reused)",
    hash: '50322f40c121409636a92cd36284bc17d89ebbee38b18aff5911b8a2892f5d21',
    reason: /reuses another vault key/,
    tamper: (d) => {
      const bob = member(d.members[1].wkIdentity as string);
      const reused = d.members[0].xpubWallet as string;
      d.members[1].xpubWallet = reused;
      d.members[1].walletXpubSignature = signAsWalletIdentity(
        bob,
        vaultXpubAttestationMessage(
          'wallet',
          reused,
          d.chain as string,
          d.orgIndex as number,
        ),
      );
    },
  },
];

const tampered = (index: number): Raw => {
  const d = clone(BTC.descriptor) as unknown as Raw;
  TAMPERS[index].tamper(d);
  return d;
};

describe('VD-3: descriptors SSP Wallet and SSP Key both refuse', () => {
  it.each(TAMPERS.map((t, i) => [t.what, i] as const))('%s', (_what, i) => {
    const d = tampered(i);
    // canonical form ignores unknown fields; hash it as the server would
    const hash = computeVaultDescriptorHash(d as unknown as VaultDescriptorV1);
    expect(hash).toBe(TAMPERS[i].hash);
    let refused: unknown = null;
    try {
      verifyVaultDescriptor(
        d,
        hash,
        ALICE.wkIdentity,
        'wallet',
        BTC.descriptor.members[0].xpubWallet as string,
      );
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(VaultDescriptorError);
    expect((refused as Error).message).toMatch(TAMPERS[i].reason);
  });

  it('the untampered vector still verifies', () => {
    expect(
      verifyVaultDescriptor(
        BTC.descriptor,
        BTC.descriptorHash,
        ALICE.wkIdentity,
        'wallet',
        BTC.descriptor.members[0].xpubWallet as string,
      ).hash,
    ).toBe(BTC.descriptorHash);
  });
});

describe('VD-3: request signing mode bound to the descriptor (as on SSP Key)', () => {
  const d = parseVaultDescriptor(BTC.descriptor);
  const request = {
    chain: d.chain,
    orgIndex: d.orgIndex,
    vaultIndex: d.vaultIndex,
  };

  it('accepts no mode, an empty mode, or the vault mode', () => {
    for (const signingMode of [undefined, null, '', 'dual']) {
      expect(() =>
        assertRequestMatchesDescriptor(d, { ...request, signingMode }),
      ).not.toThrow();
    }
  });

  it('refuses another mode', () => {
    for (const signingMode of ['key_only', 'wallet_only', 'sol_dual']) {
      expect(() =>
        assertRequestMatchesDescriptor(d, { ...request, signingMode }),
      ).toThrow(VaultDescriptorError);
    }
  });
});
