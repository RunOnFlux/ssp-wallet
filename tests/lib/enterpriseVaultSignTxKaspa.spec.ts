// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * EnterpriseVaultSignTx — the Kaspa branch, rendered for real (antd + React).
 *
 * The Kaspa library calls are mocked; the component's own gating is what is
 * under test:
 *  - Sign stays disabled (and handleSign refuses) while the trustless decode
 *    is pending or has failed; a transient failure retries by itself, and the
 *    Retry button re-runs the decode;
 *  - key_only forwards the bundle JSON untouched and never signs locally;
 *  - dual mode signs with the contract §4.7 checks (source address, proposal
 *    recipients) and the fee ceiling min($100 worth, 5 KAS);
 *  - describeTransaction warning codes render as English sentences;
 *  - every distinct input address is listed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import enHome from '../../src/translations/resources/en/home.json';
import enCommon from '../../src/translations/resources/en/common.json';

const m = vi.hoisted(() => ({
  decode: vi.fn(),
  sign: vi.fn(),
  post: vi.fn(),
  rates: { kas: 50 },
}));

vi.mock('../../src/lib/kaspa', () => ({
  decodeKasVaultProposal: m.decode,
  signKasVaultBundle: m.sign,
  kasSignedAmountLedger: () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('../../src/hooks', () => {
  const state = {
    passwordBlob: { passwordBlob: 'pwblob' },
    sspState: { sspWalletKeyInternalIdentity: 'wk1' },
    fiatCryptoRates: { cryptoRates: m.rates, fiatRates: { USD: 1 } },
  };
  return { useAppSelector: (sel) => sel(state) };
});
vi.mock('../../src/hooks/useRelayAuth', () => ({
  useRelayAuth: () => ({ createWkIdentityAuth: async () => null }),
}));
vi.mock('../../src/hooks/useSocket', () => ({
  useSocket: () => ({
    enterpriseVaultSigned: null,
    clearEnterpriseVaultSigned: () => {},
    enterpriseVaultSignRejected: null,
    clearEnterpriseVaultSignRejected: () => {},
  }),
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
  decrypt: async (_pw, blob) => (blob === 'pwblob' ? 'password' : 'seed'),
}));
vi.mock('react-secure-storage', () => ({
  default: { getItem: () => 'seedblob' },
}));
vi.mock('../../src/lib/fingerprint', () => ({ getFingerprint: () => 'fp' }));
vi.mock('../../src/lib/wallet', () => ({
  getMasterXpriv: () => 'xprivOrg',
  generateAddressKeypair: () => ({ privKey: 'aa', pubKey: 'walletpub' }),
  getScriptType: () => 0,
  deriveEVMPublicKey: () => '',
}));
vi.mock('axios', () => ({ default: { post: m.post } }));
vi.mock('@storage/ssp', () => ({
  sspConfig: () => ({ maxTxFeeUSD: 100, relay: 'relay' }),
}));

import EnterpriseVaultSignTx from '../../src/components/EnterpriseVaultSignTx/EnterpriseVaultSignTx';

const VAULT = 'kaspa:pvault';
const RECIPIENT = 'kaspa:qrecipient';
const BUNDLE = '{"format":"kaspa-core-signing-bundle"}';
const recipients = [{ address: RECIPIENT, amount: '200000000' }];
const inputDetails = [{ addressIndex: 0, redeemScript: '52ae' }];
const okDecode = {
  sender: VAULT,
  senders: [VAULT],
  recipients,
  fee: '3000',
  warnings: [],
};

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

async function render(extra = {}) {
  openAction = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(EnterpriseVaultSignTx, {
        open: true,
        chain: 'kas',
        orgIndex: 100,
        vaultIndex: 0,
        recipients: JSON.stringify(recipients),
        fee: '3000',
        memo: '',
        rawUnsignedTx: BUNDLE,
        inputDetails: JSON.stringify(inputDetails),
        vaultName: 'Treasury',
        orgName: 'Org',
        sourceAddress: VAULT,
        signingMode: 'dual',
        openAction,
        ...extra,
      }),
    );
  });
  await flush();
}

const signButton = () =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent === enHome.enterpriseVaultSignTx.sign,
  );
const buttonByText = (text) =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent === text,
  );

const realWarn = console.warn;
const realError = console.error;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // antd deprecation notices are noise here; everything else still prints.
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
  m.decode.mockReset();
  m.sign.mockReset();
  m.post.mockReset();
  m.post.mockResolvedValue({ data: {} });
  m.rates.kas = 50;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
  console.warn = realWarn;
  console.error = realError;
});

describe('EnterpriseVaultSignTx — Kaspa', () => {
  it('disables Sign on a decode error, never signs, and Retry re-runs the decode', async () => {
    m.decode.mockResolvedValue({
      sender: '',
      senders: [],
      recipients: [],
      fee: '0',
      error: 'Kaspa proposal must spend exactly one vault address',
    });
    await render();
    expect(document.body.textContent).toContain('exactly one vault address');
    const sign = signButton();
    expect(sign.disabled).toBe(true);
    await act(async () => sign.click());
    await flush();
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();

    m.decode.mockResolvedValue(okDecode);
    const retry = buttonByText(enHome.enterpriseVaultSignTx.kas_retry_decode);
    expect(retry).toBeTruthy();
    await act(async () => retry.click());
    await flush();
    expect(m.decode).toHaveBeenCalledTimes(2);
    expect(signButton().disabled).toBe(false);
  });

  it('retries a transient REST failure by itself', async () => {
    m.decode
      .mockResolvedValueOnce({
        sender: '',
        senders: [],
        recipients: [],
        fee: '0',
        error: 'request timed out',
        transient: true,
      })
      .mockResolvedValue(okDecode);
    await render();
    expect(signButton().disabled).toBe(true);
    await flush(400); // backoff is 2 s for the first retry
    expect(m.decode).toHaveBeenCalledTimes(2);
    expect(signButton().disabled).toBe(false);
  });

  it('passes the source address, recipients and fee ceiling to the decode', async () => {
    m.decode.mockResolvedValue(okDecode);
    await render();
    const [bundle, chain, details, opts] = m.decode.mock.calls[0];
    expect(bundle).toBe(BUNDLE);
    expect(chain).toBe('kas');
    expect(details).toEqual(inputDetails);
    // $100 at $50/KAS = 2 KAS, below the 5 KAS chain cap
    expect(opts).toEqual({
      expectedSourceAddress: VAULT,
      expectedRecipients: recipients,
      maxFee: 200000000n,
    });
  });

  it('key_only forwards the bundle JSON to Key and never signs locally', async () => {
    m.decode.mockResolvedValue(okDecode);
    await render({ signingMode: 'key_only' });
    await act(async () => signButton().click());
    await flush();
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.post).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(m.post.mock.calls[0][1].payload);
    expect(payload.signingMode).toBe('key_only');
    expect(payload.walletSignedHex).toBe(BUNDLE);
    expect(payload.walletSignatures).toEqual([BUNDLE]);
  });

  it('dual mode signs with the §4.7 checks and min($100, 5 KAS) as maxFee', async () => {
    m.rates.kas = 0.1; // $100 = 1000 KAS → the 5 KAS cap applies
    m.decode.mockResolvedValue(okDecode);
    m.sign.mockResolvedValue('{"signed":true}');
    await render();
    await act(async () => signButton().click());
    await flush();
    expect(m.sign).toHaveBeenCalledTimes(1);
    expect(m.sign.mock.calls[0][0]).toMatchObject({
      bundleJson: BUNDLE,
      chain: 'kas',
      inputDetails,
      vaultXpriv: 'xprivOrg',
      vaultIndex: 0,
      expectedSourceAddress: VAULT,
      expectedRecipients: recipients,
      maxFee: 500000000n,
    });
    const payload = JSON.parse(m.post.mock.calls[0][1].payload);
    expect(payload.walletSignedHex).toBe('{"signed":true}');
    expect(payload.sourceAddress).toBe(VAULT);
  });

  it('shows warnings as English sentences and lists every input address', async () => {
    m.decode.mockResolvedValue({
      ...okDecode,
      senders: [VAULT, 'kaspa:pother'],
      warnings: ['fee-above-threshold', 'foreign-input'],
    });
    await render();
    const text = document.body.textContent;
    expect(text).toContain(
      enHome.enterpriseVaultSignTx.kas_warn_fee_above_threshold,
    );
    expect(text).toContain(enHome.enterpriseVaultSignTx.kas_warn_foreign_input);
    expect(text).not.toContain('fee-above-threshold');
    expect(text).toContain(VAULT);
    expect(text).toContain('kaspa:pother');
  });
});
