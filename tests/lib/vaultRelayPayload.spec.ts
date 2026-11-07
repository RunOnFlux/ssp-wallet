// VD-2 cross-repo contract, wallet side: the relay action payloads SSP Wallet
// builds for SSP Key, and the rejection payloads SSP Key posts back.
//
// fixtures/vd-relay-payloads.json is shared byte for byte with SSP Key
// (tests/lib/fixtures/vd-relay-payloads.json, checked by
// tests/lib/vaultRelayPayloadContract.test.ts there) and
// ~/repos/sec-2026-10/vd-relay-payloads.json. Here: the REAL builders
// reproduce every `payload` exactly, the descriptor travels as an object, and
// SSP Key's rejection payloads map to the errorCode returned to SSP Enterprise.
// There: SSP Key's parser routes, verifies and (for UTXO / Flux) signs every
// `payload`, and produces every rejection `payload`.
import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  parseVaultDescriptor,
  verifyVaultDescriptor,
} from '../../src/lib/vaultDescriptor';
import {
  checkFluxCollateralAgainstDescriptor,
  checkVaultSignRequest,
} from '../../src/lib/vaultDescriptorDerive';
import {
  buildFluxNodeStartRelayPayload,
  buildVaultSignRelayPayload,
  type FluxNodeStartRelayPayloadInput,
  type VaultSignRelayPayloadInput,
} from '../../src/lib/vaultRelayPayload';
import {
  keyRejectionRequestId,
  vaultErrorCodeFromKey,
} from '../../src/lib/vaultGate';
import { messageDigestMatches } from '../../src/lib/userOpVerify';

interface PayloadCase {
  name: string;
  vector: string;
  action: 'enterprisevaultsign' | 'enterprisefluxnodestart';
  keyDevice: string;
  input: Record<string, unknown>;
  payload: string;
}

interface RejectionCase {
  name: string;
  action: string;
  requestId: string;
  errorCode: string | null;
  payload: string;
}

const readJson = <T>(file: string): T =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as T;

const fixture = readJson<{
  cases: PayloadCase[];
  rejections: RejectionCase[];
}>('vd-relay-payloads.json');
const vectors = readJson<{
  vectors: Array<{
    name: string;
    descriptor: Record<string, unknown>;
    descriptorHash: string;
    derived: Array<{ addressIndex: number; address: string }>;
  }>;
  members: Array<{ name: string; wkIdentity: string }>;
}>('vd-vectors.json');

const vectorOf = (name: string) =>
  vectors.vectors.find((v) => v.name === name)!;
const caseOf = (name: string) => fixture.cases.find((c) => c.name === name)!;
const parsed = (c: PayloadCase) =>
  JSON.parse(c.payload) as Record<string, unknown>;

const build = (c: PayloadCase): string =>
  JSON.stringify(
    c.action === 'enterprisevaultsign'
      ? buildVaultSignRelayPayload(
          c.input as unknown as VaultSignRelayPayloadInput,
        )
      : buildFluxNodeStartRelayPayload(
          c.input as unknown as FluxNodeStartRelayPayloadInput,
        ),
  );

describe('VD-2 relay payloads (shared fixture with SSP Key)', () => {
  it('is byte-identical to the shared vd-relay-payloads.json when present', () => {
    const shared = new URL('../../../vd-relay-payloads.json', import.meta.url);
    if (!existsSync(shared)) return;
    expect(
      readFileSync(
        new URL('./fixtures/vd-relay-payloads.json', import.meta.url),
        'utf8',
      ),
    ).toBe(readFileSync(shared, 'utf8'));
  });

  it('covers vault sign (UTXO + EVM message) and Flux node start', () => {
    expect(fixture.cases.map((c) => c.name)).toEqual([
      'btc-utxo-sign-dual',
      'btc-utxo-sign-change-at-source',
      'btc-utxo-sign-other-vault-address',
      'eth-evm-message-sign',
      'flux-node-start-key-only',
    ]);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    '%s: the wallet builder reproduces the payload SSP Key is tested with',
    (_name, c) => {
      expect(build(c)).toBe(c.payload);
    },
  );

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    '%s: descriptor travels as the OBJECT SSP Enterprise sent, hash verbatim',
    (_name, c) => {
      const vector = vectorOf(c.vector);
      const payload = parsed(c);
      expect(typeof payload.vaultDescriptor).toBe('object');
      expect(Array.isArray(payload.vaultDescriptor)).toBe(false);
      expect(payload.vaultDescriptor).toEqual(vector.descriptor);
      expect(payload.vaultDescriptorHash).toBe(vector.descriptorHash);
      expect(payload.vaultDescriptorHash).toMatch(/^[0-9a-f]{64}$/);
      // the request names the descriptor's vault (SSP Key binds the two)
      expect(payload.chain).toBe(vector.descriptor.chain);
      expect(payload.orgIndex).toBe(vector.descriptor.orgIndex);
      expect(payload.vaultIndex).toBe(vector.descriptor.vaultIndex);
      expect(typeof payload.requestId).toBe('string');
    },
  );

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    '%s: the forwarded descriptor verifies on the wallet side too',
    (_name, c) => {
      const payload = parsed(c);
      const member = vectors.members.find((m) => m.name === c.keyDevice)!;
      const own = parseVaultDescriptor(payload.vaultDescriptor).members.find(
        (m) => m.wkIdentity === member.wkIdentity,
      )!;
      const verified = verifyVaultDescriptor(
        payload.vaultDescriptor,
        payload.vaultDescriptorHash,
        member.wkIdentity,
        'wallet',
        own.xpubWallet ?? '',
      );
      expect(verified.hash).toBe(payload.vaultDescriptorHash);
    },
  );

  it('UTXO: inputs derive from the descriptor; change rule outcome per case', () => {
    const outputsOf = (name: string) => {
      const payload = parsed(caseOf(name));
      const d = parseVaultDescriptor(payload.vaultDescriptor);
      const check = checkVaultSignRequest(d, {
        isMessageSign: false,
        rawUnsignedTx: payload.rawUnsignedTx as string,
        inputDetails: payload.inputDetails as unknown[],
      });
      return check.utxo!.outputs.map((o) => o.vaultAddressIndex);
    };
    // honest builder change: back to the source address (or address 0)
    expect(outputsOf('btc-utxo-sign-dual')).toEqual([null, 0]);
    expect(outputsOf('btc-utxo-sign-change-at-source')).toEqual([null, 2]);
    // another address of the same vault: listed with its index (SSP Key
    // shows it as a recipient instead); never hidden, never refused
    expect(outputsOf('btc-utxo-sign-other-vault-address')).toEqual([null, 5]);
  });

  it('EVM message: digest of the shown text, signing as vault address 0', () => {
    const c = caseOf('eth-evm-message-sign');
    const payload = parsed(c);
    expect(
      messageDigestMatches(payload.signMessage, payload.rawUnsignedTx),
    ).toBe(true);
    const check = checkVaultSignRequest(
      parseVaultDescriptor(payload.vaultDescriptor),
      {
        isMessageSign: true,
        rawUnsignedTx: payload.rawUnsignedTx as string,
        inputDetails: payload.inputDetails as unknown[],
      },
    );
    expect(check.sourceAddress).toBe(vectorOf(c.vector).derived[0].address);
    // EVM payloads carry no walletSignedHex (UTXO progressive signing only)
    expect(payload).not.toHaveProperty('walletSignedHex');
    expect(Array.isArray(payload.allSignerKeys)).toBe(true);
  });

  it('Flux node start: the collateral is the derived vault address', () => {
    const payload = parsed(caseOf('flux-node-start-key-only'));
    const derived = checkFluxCollateralAgainstDescriptor(
      parseVaultDescriptor(payload.vaultDescriptor),
      payload.addressIndex as number,
      payload.redeemScript as string,
      payload.collateralAddress as string,
    );
    expect(derived.address).toBe(payload.collateralAddress);
  });
});

describe("SSP Key's rejection payloads -> errorCode for SSP Enterprise", () => {
  it.each(fixture.rejections.map((r) => [r.name, r] as const))(
    '%s',
    (_name, r) => {
      expect(vaultErrorCodeFromKey(r.payload)).toBe(r.errorCode);
      expect(keyRejectionRequestId(r.payload)).toBe(r.requestId);
      // what EnterpriseVaultSignTx / EnterpriseFluxNodeStart return
      expect(vaultErrorCodeFromKey(r.payload) ?? 'KEY_REJECTED').toBe(
        r.errorCode ?? 'KEY_REJECTED',
      );
    },
  );

  it('an older SSP Key rejection names no request and carries no code', () => {
    expect(keyRejectionRequestId('{}')).toBeNull();
    expect(keyRejectionRequestId('enterprisevaultsignrejected')).toBeNull();
    expect(vaultErrorCodeFromKey('{}')).toBeNull();
  });
});
