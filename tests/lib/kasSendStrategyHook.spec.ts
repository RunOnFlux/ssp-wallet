// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * useKasSendStrategy (the Kaspa send hook), rendered for real with React.
 *
 * Every chain call is mocked with a tiny deterministic planner (fee = rate ×
 * 1000 grams), so the tests pin the hook's own rules:
 *  - onFinish plans with the DISPLAYED fee rate and re-fetches only the UTXOs;
 *  - a plan whose amount or fee differs from what was shown is never signed:
 *    the hook refreshes UTXOs + rates + DAA score and the user re-confirms,
 *    after which the send goes through (Max no longer gets stuck);
 *  - the wallet key is decrypted and derived only after planning succeeded.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';

const SENDER = 'kaspa:psender';
const RECEIVER = 'kaspa:qreceiver';
const KAS = 100_000_000n;

const m = vi.hoisted(() => ({
  fetchKasUtxos: vi.fn(),
  fetchKasFeeRates: vi.fn(),
  planKasSend: vi.fn(),
  signKasSend: vi.fn(),
  decrypt: vi.fn(),
  generateAddressKeypair: vi.fn(),
  toast: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../src/lib/kaspa', () => ({
  fetchKasUtxos: m.fetchKasUtxos,
  fetchKasFeeRates: m.fetchKasFeeRates,
  planKasSend: m.planKasSend,
  signKasSend: m.signKasSend,
  isKasTransactionKnown: vi.fn(async () => false),
  kasRestClient: () => ({ getVirtualDaaScore: async () => 5000n }),
  kasSignedAmountLedger: () => ({ get: () => undefined, set: () => {} }),
  sumKasUtxos: (u) => u.reduce((a, x) => a + x.entry.amount, 0n),
}));
vi.mock('../../src/hooks', () => {
  const state = {
    sspState: { activeChain: 'kas', sspWalletKeyInternalIdentity: 'wk1' },
    kas: {
      wallets: { '0-0': { address: 'kaspa:psender' } },
      walletInUse: '0-0',
      xpubWallet: 'xpubW',
      xpubKey: 'xpubK',
    },
    contacts: { contacts: {} },
    fiatCryptoRates: { cryptoRates: { kas: 0.1 }, fiatRates: { USD: 1 } },
    passwordBlob: { passwordBlob: 'pwblob' },
  };
  return {
    useAppSelector: (sel) => sel(state),
    useAppDispatch: () => () => undefined,
  };
});
vi.mock('../../src/hooks/useRelayAuth', () => ({
  useRelayAuth: () => ({ createWkIdentityAuth: async () => null }),
}));
vi.mock('../../src/hooks/useSocket', () => ({
  useSocket: () => ({
    txid: '',
    clearTxid: () => {},
    txRejected: '',
    chain: '',
    clearTxRejected: () => {},
  }),
}));
vi.mock('react-router', () => ({
  useNavigate: () => () => {},
  useLocation: () => ({ state: {} }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
vi.mock('antd', () => ({
  Form: { useForm: () => [{ setFieldValue: () => {} }] },
}));
vi.mock('../../src/lib/toast', () => ({ toast: { open: m.toast } }));
vi.mock('@metamask/browser-passworder', () => ({ decrypt: m.decrypt }));
vi.mock('react-secure-storage', () => ({
  default: { getItem: () => 'xprivblob' },
}));
vi.mock('../../src/lib/fingerprint', () => ({ getFingerprint: () => 'fp' }));
vi.mock('../../src/lib/wallet', () => ({
  generateAddressKeypair: m.generateAddressKeypair,
  getScriptType: () => 0,
}));
vi.mock('../../src/lib/addressValidation', () => ({
  validateReceiverAddress: (a) => ({ valid: !!a && a.startsWith('kaspa:') }),
}));
vi.mock('../../src/lib/currency', () => ({
  formatFiatWithSymbol: () => '$0',
}));
vi.mock('../../src/store', () => ({ setContacts: () => ({}) }));
vi.mock('../../src/components/ConfirmTxKey/ConfirmTxKey', () => ({
  default: () => null,
}));
vi.mock('../../src/components/TxSent/TxSent', () => ({ default: () => null }));
vi.mock('../../src/components/TxRejected/TxRejected', () => ({
  default: () => null,
}));
vi.mock('localforage', () => ({
  default: { getItem: async () => null, setItem: async () => {} },
}));
vi.mock('axios', () => ({ default: { post: m.post } }));
vi.mock('@storage/ssp', () => ({
  sspConfig: () => ({ maxTxFeeUSD: 100, relay: 'relay', fiatCurrency: 'USD' }),
}));

import { useKasSendStrategy } from '../../src/pages/SendFlow/useKasSendStrategy';

/** UTXO set with the given amounts (sompi). */
const utxos = (...amounts: bigint[]) =>
  amounts.map((amount) => ({ entry: { amount } }));

// fee = rate × 1000 grams; sendAll → one output of (Σ − fee).
function fakePlan(p) {
  const total = p.utxos.reduce((a, u) => a + u.entry.amount, 0n);
  const fee = p.feeRate * 1000n;
  if (!p.sendAll && p.amountSompi + fee > total) {
    const e = new Error('insufficient');
    e.code = 'INSUFFICIENT_FUNDS';
    throw e;
  }
  const value = p.sendAll ? total - fee : p.amountSompi;
  return {
    plan: { final: { fee, tx: { outputs: [{ value }] } } },
    spend: {},
    sender: SENDER,
  };
}

let view;
let root;
let container;

function Harness() {
  view = useKasSendStrategy();
  return null;
}

async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount() {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(Harness));
  });
  await flush();
}

async function submit() {
  await act(async () => {
    view.onFinish({ receiver: RECEIVER, amount: view.amount.value });
  });
  await flush();
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  for (const f of Object.values(m)) f.mockReset();
  m.planKasSend.mockImplementation(async (p) => fakePlan(p));
  m.signKasSend.mockResolvedValue({
    payload: '{"bundle":1}',
    txid: 'ab'.repeat(32),
  });
  m.decrypt.mockImplementation(async (_pw, blob) =>
    blob === 'pwblob' ? 'password' : 'xprivChain',
  );
  m.generateAddressKeypair.mockReturnValue({
    privKey: '11'.repeat(32),
    pubKey: '',
  });
  m.post.mockResolvedValue({ data: {} });
  m.fetchKasFeeRates.mockResolvedValue({
    economy: 100n,
    normal: 1000n,
    fast: 3000n,
  });
  m.fetchKasUtxos.mockResolvedValue(utxos(5n * KAS));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.clearAllTimers();
});

describe('useKasSendStrategy', () => {
  it('Max: shows balance − fee, then signs exactly that with the displayed rate', async () => {
    await mount();
    await act(async () => view.receiver.set(RECEIVER));
    await act(async () => view.amount.onMax());
    await flush();
    // normal rate 1000 → fee 1,000,000 sompi = 0.01 KAS
    expect(view.amount.value).toBe('4.99');
    expect(view.feeDisplay).toBe('0.01');

    const ratesCallsBefore = m.fetchKasFeeRates.mock.calls.length;
    await submit();

    // rates are NOT re-fetched on submit; only the UTXOs are
    expect(m.fetchKasFeeRates.mock.calls.length).toBe(ratesCallsBefore);
    const submitPlan = m.planKasSend.mock.calls.at(-1)[0];
    expect(submitPlan).toMatchObject({ sendAll: true, feeRate: 1000n });
    expect(m.signKasSend).toHaveBeenCalledTimes(1);
    expect(m.post).toHaveBeenCalledTimes(1);
    expect(m.toast).not.toHaveBeenCalled();
  });

  it('rate refresh: a changed fee is never signed; state refreshes and the retry succeeds', async () => {
    await mount();
    await act(async () => view.receiver.set(RECEIVER));
    await act(async () => view.amount.set('1'));
    await flush();
    expect(view.feeDisplay).toBe('0.01');

    // Between review and submit, the planner would price the send differently
    // (e.g. a different coin set). Simulate by making the submit-time plan's
    // fee differ once; the refresh also brings new network rates.
    m.planKasSend.mockImplementationOnce(async (p) => {
      const r = fakePlan(p);
      r.plan.final.fee += 1n;
      return r;
    });
    m.fetchKasFeeRates.mockResolvedValue({
      economy: 100n,
      normal: 2000n,
      fast: 3000n,
    });
    await submit();

    expect(m.signKasSend).not.toHaveBeenCalled();
    expect(m.decrypt).not.toHaveBeenCalled();
    expect(m.generateAddressKeypair).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        content: 'send:err_kas_review_changed',
      }),
    );
    // refreshed: the new rate is displayed and must be re-confirmed
    expect(view.feeDisplay).toBe('0.02');

    await submit();
    expect(m.planKasSend.mock.calls.at(-1)[0].feeRate).toBe(2000n);
    expect(m.signKasSend).toHaveBeenCalledTimes(1);
  });

  it('amount changed: Max after the balance moved asks to re-confirm, then sends the new max', async () => {
    await mount();
    await act(async () => view.receiver.set(RECEIVER));
    await act(async () => view.amount.onMax());
    await flush();
    expect(view.amount.value).toBe('4.99');

    // A new coin arrived: the submit-time sweep would send more than shown.
    m.fetchKasUtxos.mockResolvedValue(utxos(5n * KAS, 1n * KAS));
    await submit();
    expect(m.signKasSend).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'send:err_kas_review_changed' }),
    );
    // refreshed state re-planned the Max amount
    expect(view.amount.value).toBe('5.99');

    m.toast.mockReset();
    await submit();
    expect(m.signKasSend).toHaveBeenCalledTimes(1);
    expect(m.toast).not.toHaveBeenCalled();
  });

  it('derives the wallet key only after planning succeeded', async () => {
    await mount();
    await act(async () => view.receiver.set(RECEIVER));
    await act(async () => view.amount.set('1'));
    await flush();

    const order: string[] = [];
    m.planKasSend.mockImplementationOnce(async (p) => {
      order.push('plan');
      return fakePlan(p);
    });
    m.decrypt.mockImplementation(async (_pw, blob) => {
      order.push('decrypt');
      return blob === 'pwblob' ? 'password' : 'xprivChain';
    });
    m.generateAddressKeypair.mockImplementation(() => {
      order.push('derive');
      return { privKey: '11'.repeat(32), pubKey: '' };
    });
    await submit();
    expect(order).toEqual(['plan', 'decrypt', 'decrypt', 'derive']);

    // a failing plan never touches the key at all
    m.decrypt.mockClear();
    m.generateAddressKeypair.mockClear();
    m.planKasSend.mockImplementationOnce(async () => {
      const e = new Error('insufficient');
      e.code = 'INSUFFICIENT_FUNDS';
      throw e;
    });
    await submit();
    expect(m.decrypt).not.toHaveBeenCalled();
    expect(m.generateAddressKeypair).not.toHaveBeenCalled();
  });
});
