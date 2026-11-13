// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * EnterpriseVaultSignTx, Kaspa branch: signed-amount ledger refusals
 * (reviews KAS-2 / KAS-6), rendered for real inside an antd <App>.
 *
 * signKasVaultBundle resolves a ledger conflict by PROOF first
 * (getFundingTransaction, see kaspaVaultLedger.spec.ts); what reaches the
 * component is only what proof could not settle. The component must:
 *  - offer a warned, explicitly confirmed reset of exactly the UNPROVABLE
 *    coins, and keep the request open so the user can sign again afterwards;
 *  - offer the warned full reset for an unreadable record;
 *  - refuse with no reset on offer when the chain PROVES the claim false,
 *    when the record is full, or when the cross-page lock is unavailable;
 *  - never reset anything without the explicit OK.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp } from 'antd';
import enHome from '../../src/translations/resources/en/home.json';
import enCommon from '../../src/translations/resources/en/common.json';
import enSend from '../../src/translations/resources/en/send.json';

const m = vi.hoisted(() => ({
  decode: vi.fn(),
  sign: vi.fn(),
  post: vi.fn(),
  resetCorrupt: vi.fn(),
  resetOutpoints: vi.fn(),
  ledger: { kasPersistentLedger: true },
}));

vi.mock('../../src/lib/kaspa', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    decodeKasVaultProposal: m.decode,
    signKasVaultBundle: m.sign,
    kasSignedAmountLedger: () => m.ledger,
    resetCorruptKasLedger: m.resetCorrupt,
    resetKasLedgerOutpoints: m.resetOutpoints,
  };
});
vi.mock('../../src/hooks', () => {
  const state = {
    passwordBlob: { passwordBlob: 'pwblob' },
    sspState: { sspWalletKeyInternalIdentity: 'wk1' },
    fiatCryptoRates: { cryptoRates: { kas: 50 }, fiatRates: { USD: 1 } },
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
  const roots = { common: enCommon, home: enHome, send: enSend };
  const lookup = (key: string, vars?: Record<string, string>) => {
    const [ns, path] = key.includes(':') ? key.split(':') : ['home', key];
    const v = path
      .split('.')
      .reduce((o, k) => (o ? o[k] : undefined), roots[ns] ?? enHome);
    if (typeof v !== 'string') return key;
    return v.replace(/\{\{(\w+)\}\}/g, (_, n) => vars?.[n] ?? '');
  };
  return { useTranslation: () => ({ t: lookup }) };
});
vi.mock('../../src/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), open: vi.fn() },
}));
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
import {
  KasLedgerConflictError,
  KasLedgerCorruptError,
  KasLedgerFullError,
  KasLedgerLockError,
} from '../../src/lib/kaspa';
import { toast } from '../../src/lib/toast';

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
const COIN = `${'09'.repeat(32)}:0`;
const PROVEN = `${'08'.repeat(32)}:1`;

let root;
let container;
let openAction;

async function flush(ms = 0) {
  for (let i = 0; i < 8; i++) {
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
      createElement(
        AntApp,
        null,
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
      ),
    );
  });
  await flush();
}

const buttonByText = (text) =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent === text,
  );
const signButton = () => buttonByText(enHome.enterpriseVaultSignTx.sign);
const dialogText = () =>
  [...document.body.querySelectorAll('.ant-modal-confirm')]
    .map((d) => d.textContent)
    .join('\n');

async function clickSign() {
  await act(async () => signButton().click());
  await flush();
}

const realWarn = console.warn;
const realError = console.error;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const quiet =
    (real) =>
    (...args) => {
      if (typeof args[0] === 'string' && args[0].startsWith('Warning: [antd'))
        return;
      if (
        typeof args[0] === 'string' &&
        args[0].startsWith('[EnterpriseVaultSignTx] Error')
      )
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
  m.decode.mockResolvedValue(okDecode);
  m.sign.mockReset();
  m.post.mockReset();
  m.post.mockResolvedValue({ data: {} });
  m.resetCorrupt.mockReset();
  m.resetOutpoints.mockReset();
  vi.mocked(toast.success).mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
  console.warn = realWarn;
  console.error = realError;
});

describe('EnterpriseVaultSignTx — Kaspa signed-amount ledger', () => {
  it('signs against the persistent ledger (reconciled by proof inside signKasVaultBundle)', async () => {
    m.sign.mockResolvedValue('{"signed":true}');
    await render();
    await clickSign();
    expect(m.sign).toHaveBeenCalledTimes(1);
    expect(m.sign.mock.calls[0][0].signedAmounts).toBe(m.ledger);
    expect(m.post).toHaveBeenCalledTimes(1);
  });

  it('unprovable coins: warned dialog, reset only those coins on explicit OK, then sign again', async () => {
    m.sign.mockRejectedValueOnce(new KasLedgerConflictError([], [COIN]));
    m.resetOutpoints.mockResolvedValue(1);
    await render();
    await clickSign();

    // Nothing was signed or sent; the request stays open.
    expect(m.post).not.toHaveBeenCalled();
    expect(openAction).not.toHaveBeenCalled();
    const text = dialogText();
    expect(text).toContain(enSend.kas_ledger_conflict_title);
    expect(text).toContain(enSend.kas_ledger_conflict_desc);
    expect(text).toContain(COIN);
    expect(text).not.toMatch(/earlier network answer was wrong/);
    expect(document.body.textContent).toContain(
      enSend.kas_ledger_conflict_title,
    );
    expect(m.resetOutpoints).not.toHaveBeenCalled();

    const ok = buttonByText(enSend.kas_ledger_reset_outpoints);
    expect(ok.className).toContain('dangerous');
    await act(async () => ok.click());
    await flush();
    expect(m.resetOutpoints).toHaveBeenCalledTimes(1);
    expect(m.resetOutpoints).toHaveBeenCalledWith([COIN]);
    expect(toast.success).toHaveBeenCalledWith(
      enSend.kas_ledger_reset_outpoints_done.replace('{{n}}', '1'),
    );

    // Signing again re-runs every check and now goes through.
    m.sign.mockResolvedValueOnce('{"signed":true}');
    expect(signButton().disabled).toBe(false);
    await clickSign();
    expect(m.sign).toHaveBeenCalledTimes(2);
    expect(m.post).toHaveBeenCalledTimes(1);
    expect(openAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR' }),
    );
  });

  it('cancelling the dialog resets nothing and keeps refusing', async () => {
    m.sign.mockRejectedValue(new KasLedgerConflictError([], [COIN]));
    await render();
    await clickSign();
    const dialogCancel = [
      ...document.body.querySelectorAll('.ant-modal-confirm button'),
    ].find((b) => b.textContent === enCommon.cancel);
    await act(async () => dialogCancel.click());
    await flush();
    expect(m.resetOutpoints).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
    expect(openAction).not.toHaveBeenCalled();
  });

  it('a proven conflict next to unprovable coins: refused, no reset offered for any coin', async () => {
    // The backend was just caught lying about PROVEN: its amount for COIN is
    // not trusted either — a reset would re-open the fee inflation.
    m.sign.mockRejectedValue(new KasLedgerConflictError([PROVEN], [COIN]));
    await render();
    await clickSign();
    expect(dialogText()).toBe('');
    expect(document.body.textContent).not.toContain(
      enSend.kas_ledger_reset_outpoints,
    );
    expect(m.resetOutpoints).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
    expect(openAction).toHaveBeenCalledWith({
      status: 'ERROR',
      data: enSend.err_kas_ledger_conflict_proven,
      errorCode: 'SIGNING_ERROR',
    });
  });

  it('a conflict the chain PROVES is refused with no reset offer', async () => {
    m.sign.mockRejectedValue(new KasLedgerConflictError([PROVEN], []));
    await render();
    await clickSign();
    expect(dialogText()).toBe('');
    expect(m.resetOutpoints).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
    expect(openAction).toHaveBeenCalledWith({
      status: 'ERROR',
      data: enSend.err_kas_ledger_conflict_proven,
      errorCode: 'SIGNING_ERROR',
    });
  });

  it('an unreadable record: warned full reset on explicit OK only', async () => {
    m.sign.mockRejectedValueOnce(new KasLedgerCorruptError());
    m.resetCorrupt.mockResolvedValue(true);
    await render();
    await clickSign();
    expect(dialogText()).toContain(enSend.kas_ledger_corrupt_title);
    expect(dialogText()).toContain(enSend.kas_ledger_corrupt_desc);
    expect(openAction).not.toHaveBeenCalled();
    expect(m.resetCorrupt).not.toHaveBeenCalled();
    await act(async () => buttonByText(enSend.kas_ledger_reset).click());
    await flush();
    expect(m.resetCorrupt).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(enSend.kas_ledger_reset_done);
  });

  it('a reset that fails is reported and nothing is signed', async () => {
    m.sign.mockRejectedValueOnce(new KasLedgerConflictError([], [COIN]));
    m.resetOutpoints.mockRejectedValue(new Error('quota'));
    await render();
    await clickSign();
    await act(async () =>
      buttonByText(enSend.kas_ledger_reset_outpoints).click(),
    );
    await flush();
    expect(document.body.textContent).toContain(
      enSend.err_kas_ledger_reset_failed,
    );
    expect(m.post).not.toHaveBeenCalled();
  });

  it('a full record or an unavailable cross-page lock is refused with no reset offer', async () => {
    for (const [err, text] of [
      [new KasLedgerFullError(), enSend.err_kas_ledger_full],
      [new KasLedgerLockError('unavailable'), enSend.err_kas_ledger_lock],
      [new KasLedgerLockError('timeout'), enSend.err_kas_ledger_lock],
    ]) {
      m.sign.mockRejectedValueOnce(err);
      await render();
      await clickSign();
      expect(dialogText()).toBe('');
      expect(openAction).toHaveBeenCalledWith({
        status: 'ERROR',
        data: text,
        errorCode: 'SIGNING_ERROR',
      });
      await act(async () => root.unmount());
      document.body.innerHTML = '';
    }
    expect(m.resetCorrupt).not.toHaveBeenCalled();
    expect(m.resetOutpoints).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
  });

  it('other signing errors keep the existing path (no ledger dialog)', async () => {
    m.sign.mockRejectedValue(new Error('Wallet key did not sign every input'));
    await render();
    await clickSign();
    expect(dialogText()).toBe('');
    expect(openAction).toHaveBeenCalledWith({
      status: 'ERROR',
      data: 'Wallet key did not sign every input',
      errorCode: 'SIGNING_ERROR',
    });
  });
});
