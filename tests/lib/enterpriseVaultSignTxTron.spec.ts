// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * EnterpriseVaultSignTx — the TRON branch, rendered for real (antd + React),
 * with the REAL wallet derivation and SDK (only I/O is mocked). A dual 2-of-2
 * vault at org 100 from the cross-repo vectors: this wallet is mnemonic W.
 *
 * Contract §3/§5 rules under test:
 *  - the Op in `tronOp` must derive to its vault, hash to rawUnsignedTx and
 *    match the proposal recipients — otherwise Sign is disabled and nothing is
 *    signed or posted;
 *  - this wallet's leaf m/48'/195'/100'/0'/0/0 must be a signer;
 *  - the wallet signs the digest (65 bytes) and returns it in
 *    walletSignatures; walletSignedHex is never set; tronOp is threaded to Key;
 *  - key_only forwards without a wallet signature;
 *  - the Key's reply signature must recover to another vault signer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import enHome from '../../src/translations/resources/en/home.json';
import enCommon from '../../src/translations/resources/en/common.json';
import vectors from '../fixtures/tron-ssp-vectors.json';

const W =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const Kk =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const S3 =
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';
const Z = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

const m = vi.hoisted(() => ({
  post: vi.fn(),
  socket: {
    enterpriseVaultSigned: null,
    clearEnterpriseVaultSigned: () => {},
    enterpriseVaultSignRejected: null,
    clearEnterpriseVaultSignRejected: () => {},
  },
}));

vi.mock('@runonflux/tron-multisig', async (importOriginal) => {
  const actual = await importOriginal();
  const vectorNet = actual.getNetwork({
    ...actual.NETWORKS.mainnet,
    name: 'ssp-vectors',
    factory: 'THEmkXNjoxz6zj7wDBtXRd1DCYeLTvRYSB',
    implementation: 'TJEfVHrNkFfPdyNVFmY8cvJPm77rDQfSn3',
    sponsor: 'TJEfVHrNkFfPdyNVFmY8cvJPm77rDQfSn3',
    feeCollector: 'TFhcYVArFkJW6bPUDid4AFCAjKmh6Ez3vv',
  });
  return {
    ...actual,
    getNetwork: (n) => (n === 'mainnet' ? vectorNet : actual.getNetwork(n)),
  };
});
vi.mock('../../src/hooks', () => {
  const state = {
    passwordBlob: { passwordBlob: 'pwblob' },
    sspState: { sspWalletKeyInternalIdentity: 'wk1' },
    fiatCryptoRates: { cryptoRates: { tron: 0.3 }, fiatRates: { USD: 1 } },
  };
  return { useAppSelector: (sel) => sel(state) };
});
vi.mock('../../src/hooks/useRelayAuth', () => ({
  useRelayAuth: () => ({ createWkIdentityAuth: async () => null }),
}));
vi.mock('../../src/hooks/useSocket', () => ({
  useSocket: () => ({ ...m.socket }),
}));
vi.mock('react-i18next', () => {
  const lookup = (key: string) => {
    const [ns, path] = key.includes(':') ? key.split(':') : ['home', key];
    const root = ns === 'common' ? enCommon : enHome;
    const v = path.split('.').reduce((o, k) => (o ? o[k] : undefined), root);
    return typeof v === 'string' ? v : key;
  };
  return { useTranslation: () => ({ t: lookup }) };
});
vi.mock('../../src/components/HandshakeAnimation/HandshakeAnimation', () => ({
  default: () => null,
}));
vi.mock('../../src/components/EnterpriseVaultSignTx/VaultRiskStrip', () => ({
  default: () => null,
}));
vi.mock('@metamask/browser-passworder', () => ({
  decrypt: async (_pw, blob) =>
    blob === 'pwblob'
      ? 'password'
      : 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
}));
vi.mock('react-secure-storage', () => ({
  default: { getItem: () => 'seedblob' },
}));
vi.mock('../../src/lib/fingerprint', () => ({ getFingerprint: () => 'fp' }));
vi.mock('../../src/lib/wkSign', () => ({ generateRequestId: () => 'req-1' }));
vi.mock('axios', () => ({ default: { post: m.post } }));
vi.mock('@storage/ssp', () => ({
  sspConfig: () => ({ maxTxFeeUSD: 100, relay: 'relay' }),
}));

import * as T from '@runonflux/tron-multisig';
import EnterpriseVaultSignTx from '../../src/components/EnterpriseVaultSignTx/EnterpriseVaultSignTx';
import { getMasterXpriv, generateAddressKeypair } from '../../src/lib/wallet';
import { tronLeafAddress, tronNetwork } from '../../src/lib/tron';

const chain = 'tron';
const ORG = 100;
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const RECIPIENT = 'TGjtodRV2nm6tQd9hsxiecLNN9QmhhVbbD';
const COLLECTOR = 'TFhcYVArFkJW6bPUDid4AFCAjKmh6Ez3vv';
const leafKey = (mnemonic) =>
  generateAddressKeypair(
    getMasterXpriv(mnemonic, 48, 195, ORG, 'p2sh', chain),
    0,
    0,
    chain,
  );

const DUAL = vectors.enterpriseDual2of2;
const network = tronNetwork(chain);
const nowS = BigInt(Math.floor(Date.now() / 1000));

function proposal(
  over: {
    signers?: string[];
    threshold?: number;
    calls?: unknown[];
  } = {},
) {
  const signers = over.signers ?? DUAL.signers;
  const threshold = over.threshold ?? DUAL.threshold;
  const config = T.buildConfig(signers, threshold);
  const vault = T.deriveVault(network, config).address;
  const op = T.buildOp({
    calls: over.calls ?? [T.trc20TransferCall(USDT, RECIPIENT, 25_000_000n)],
    nonce: 11n,
    deadline: nowS + 7n * 86400n,
    fee: T.trxFee(6_300_000n, COLLECTOR),
  });
  const digest = T.opDigest(network.chainId, vault, op);
  return {
    vault,
    op,
    digest,
    tronOp: JSON.stringify({
      network: 'mainnet',
      vault,
      signers: [...config.signers],
      threshold,
      op: T.opToJson(op),
    }),
    rawUnsignedTx: T.to0x(digest),
  };
}

let root;
let container;
let openAction;

async function flush(ms = 0) {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  }
}

let lastProps;
async function render(extra = {}) {
  openAction = vi.fn();
  const p = proposal();
  lastProps = {
    open: true,
    chain,
    orgIndex: ORG,
    vaultIndex: 0,
    recipients: JSON.stringify([{ address: RECIPIENT, amount: '25000000' }]),
    fee: '6300000',
    memo: '',
    rawUnsignedTx: p.rawUnsignedTx,
    inputDetails: JSON.stringify([{ addressIndex: 0 }]),
    vaultName: 'Treasury',
    orgName: 'Org',
    sourceAddress: p.vault,
    tronOp: p.tronOp,
    signingMode: 'dual',
    openAction,
    ...extra,
  };
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root.render(createElement(EnterpriseVaultSignTx, lastProps));
  });
  await flush();
}

async function rerender() {
  await act(async () => {
    root.render(createElement(EnterpriseVaultSignTx, { ...lastProps }));
  });
  await flush();
}

const signButton = () =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent === enHome.enterpriseVaultSignTx.sign,
  );
const postedPayload = () => JSON.parse(m.post.mock.calls[0][1].payload);

const realWarn = console.warn;
const realError = console.error;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const quiet =
    (real) =>
    (...args) => {
      if (typeof args[0] === 'string' && args[0].startsWith('Warning: [antd'))
        return;
      real(...args);
    };
  console.warn = quiet(realWarn);
  console.error = quiet(realError);
  window.matchMedia ??= () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  m.post.mockReset();
  m.post.mockResolvedValue({ data: {} });
  m.socket.enterpriseVaultSigned = null;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container = undefined;
  document.body.innerHTML = '';
  console.warn = realWarn;
  console.error = realError;
});

describe('EnterpriseVaultSignTx — TRON', () => {
  it("the vector vault contains this wallet leaf (m/48'/195'/100'/0'/0/0)", () => {
    const own = T.addressFromPublicKey(T.hexToBytes(leafKey(W).pubKey));
    expect(DUAL.signers).toContain(own);
    expect(proposal().vault).toBe(DUAL.address);
    // the same leaf from W's org-100 account xpub (what the backend derives)
    expect(
      tronLeafAddress(vectors.enterpriseSingle2of3.signerXpubs[0], 0, 0, chain),
    ).toBe(own);
  });

  it('dual: signs the digest, returns walletSignatures, never walletSignedHex', async () => {
    await render();
    const text = document.body.textContent;
    expect(text).toContain(RECIPIENT);
    expect(text).toContain('25 USDT');
    expect(text).toContain('6.3 TRX');
    expect(signButton().disabled).toBe(false);
    await act(async () => signButton().click());
    await flush();
    expect(m.post).toHaveBeenCalledTimes(1);
    const payload = postedPayload();
    expect(payload.walletSignedHex).toBeUndefined();
    expect(payload.tronOp).toBe(lastProps.tronOp);
    expect(payload.rawUnsignedTx).toBe(lastProps.rawUnsignedTx);
    expect(payload.walletSignatures).toHaveLength(1);
    const sig = payload.walletSignatures[0];
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
    const own = T.addressFromPublicKey(T.hexToBytes(leafKey(W).pubKey));
    expect(
      T.recoverSigner(T.hexToBytes(lastProps.rawUnsignedTx), T.hexToBytes(sig)),
    ).toBe(own);
    expect(openAction).not.toHaveBeenCalled();

    // Key replies with its own 65-byte signature over the same digest.
    const keySig = T.to0x(
      T.localSigner(T.hexToBytes(leafKey(Kk).privKey)).signDigest(
        T.hexToBytes(lastProps.rawUnsignedTx),
      ),
    );
    m.socket.enterpriseVaultSigned = {
      keySignature: keySig,
      keyPubKey: leafKey(Kk).pubKey,
      requestId: 'req-1',
    };
    await rerender();
    expect(openAction).toHaveBeenCalledTimes(1);
    const [arg] = openAction.mock.calls[0];
    expect(arg.status).toBe('SUCCESS');
    expect(arg.result.walletSignatures).toEqual([sig]);
    expect(arg.result.keySignatures).toEqual([keySig]);
    expect(arg.result.signedHex).toBeUndefined();
  });

  it('refuses a Key reply signed by a non-member', async () => {
    await render();
    await act(async () => signButton().click());
    await flush();
    const stranger = T.to0x(
      T.localSigner(new Uint8Array(32).fill(7)).signDigest(
        T.hexToBytes(lastProps.rawUnsignedTx),
      ),
    );
    m.socket.enterpriseVaultSigned = {
      keySignature: stranger,
      keyPubKey: 'x',
      requestId: 'req-1',
    };
    await rerender();
    expect(openAction).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ERROR',
        data: enHome.enterpriseVaultSignTx.tron_key_signature_invalid,
      }),
    );
  });

  it.each([
    [
      'rawUnsignedTx is not the digest of the Op',
      () => ({ rawUnsignedTx: T.to0x(new Uint8Array(32).fill(1)) }),
    ],
    [
      'the vault does not derive from signers/threshold',
      () => {
        const p = proposal();
        const env = JSON.parse(p.tronOp);
        env.vault = vectors.enterpriseSingle2of3.address;
        return { tronOp: JSON.stringify(env) };
      },
    ],
    [
      'the proposal recipients differ from the Op',
      () => ({
        recipients: JSON.stringify([
          { address: RECIPIENT, amount: '26000000' },
        ]),
      }),
    ],
    [
      'the Op approves a spender (enterprise policy off)',
      () => {
        const p = proposal({
          calls: [T.approveCall(USDT, RECIPIENT, 10n)],
        });
        return {
          tronOp: p.tronOp,
          rawUnsignedTx: p.rawUnsignedTx,
          recipients: '[]',
        };
      },
    ],
  ])('blocks signing when %s', async (_why, make) => {
    await render(make());
    expect(document.body.textContent).toContain(
      enHome.enterpriseVaultSignTx.tron_verify_failed,
    );
    const sign = signButton();
    expect(sign.disabled).toBe(true);
    await act(async () => sign.click());
    await flush();
    expect(m.post).not.toHaveBeenCalled();
  });

  it('blocks a proposal without tronOp', async () => {
    await render({ tronOp: undefined });
    expect(document.body.textContent).toContain(
      enHome.enterpriseVaultSignTx.tron_op_missing,
    );
    expect(signButton().disabled).toBe(true);
  });

  it('refuses to sign when this wallet is not a signer', async () => {
    // 2-of-3 over Kk, S3, Z only
    const others = [Kk, S3, Z].map((mn) =>
      T.addressFromPublicKey(T.hexToBytes(leafKey(mn).pubKey)),
    );
    const p = proposal({ signers: others, threshold: 2 });
    await render({
      tronOp: p.tronOp,
      rawUnsignedTx: p.rawUnsignedTx,
      sourceAddress: p.vault,
    });
    expect(signButton().disabled).toBe(false);
    await act(async () => signButton().click());
    await flush();
    expect(m.post).not.toHaveBeenCalled();
    expect(openAction).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ERROR',
        data: enHome.enterpriseVaultSignTx.tron_not_member,
      }),
    );
  });

  it('key_only forwards the Op without a wallet signature', async () => {
    await render({ signingMode: 'key_only' });
    await act(async () => signButton().click());
    await flush();
    expect(m.post).toHaveBeenCalledTimes(1);
    const payload = postedPayload();
    expect(payload.signingMode).toBe('key_only');
    expect(payload.walletSignatures).toEqual([]);
    expect(payload.walletSignedHex).toBeUndefined();
    expect(payload.tronOp).toBe(lastProps.tronOp);
  });

  it('shows a vault self-call (on-chain nonce invalidation) as an action', async () => {
    const p = proposal();
    const cancel = proposal({
      calls: [
        T.selfCall(p.vault, {
          action: 'invalidateNonces',
          word: 0n,
          mask: 1n << 11n,
        }),
      ],
    });
    await render({
      tronOp: cancel.tronOp,
      rawUnsignedTx: cancel.rawUnsignedTx,
      recipients: '[]',
    });
    expect(document.body.textContent).toContain(
      enHome.enterpriseVaultSignTx.tron_vault_action,
    );
    expect(document.body.textContent).toContain('invalidateNonces');
    expect(signButton().disabled).toBe(false);
    await act(async () => signButton().click());
    await flush();
    expect(m.post).toHaveBeenCalledTimes(1);
  });
});
