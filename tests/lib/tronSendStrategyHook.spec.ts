// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * useTronSendStrategy (the TRON send hook), rendered for real with React and
 * the REAL SDK + key derivation (vector mnemonics). Only I/O is mocked: the
 * relay quote, balances, the USDT blacklist lookups, the self-pay nonce and
 * the relay action POST. Pinned rules:
 *  - the quote carries OUR signers/threshold and the canonical Call JSON; the
 *    Op is built from the quoted nonce/deadline/fee and signed with the
 *    wallet leaf; the action is `tx` with the `ssp-tron-op` v1 payload on path
 *    '0-{i}';
 *  - a quote the key would refuse (collector not pinned) is never signed;
 *  - sponsorAvailable:false blocks the sponsored send, self-pay still works
 *    (fee 0, nonce from the vault bitmap);
 *  - USDT: blacklisted recipient blocked, frozen vault blocked;
 *  - first-time recipients need an explicit confirmation;
 *  - send-max uses max:{token} and the relay's maxSendable;
 *  - not live (no sponsor pinned): nothing is quoted or sent;
 *  - CHN-9: every Op is recorded BEFORE it is posted; after any outcome other
 *    than a nonce the chain shows used (refusal, relay error, timeout, a
 *    txid that never lands) the next send of the vault reuses its nonce
 *    (sponsored and self-pay), with a banner;
 *  - KAS-7 sibling: only plain-decimal user amounts are quoted.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterEach,
  vi,
} from 'vitest';
import { createElement, act, isValidElement } from 'react';
import { createRoot } from 'react-dom/client';
import vectors from '../fixtures/tron-ssp-vectors.json';

const COLLECTOR = 'TFhcYVArFkJW6bPUDid4AFCAjKmh6Ez3vv';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const RECIPIENT = 'TGjtodRV2nm6tQd9hsxiecLNN9QmhhVbbD';
const VAULT = vectors.consumer.leaves['0-0'].address;

const m = vi.hoisted(() => ({
  net: null,
  live: null,
  notLive: null,
  quote: vi.fn(),
  blacklisted: vi.fn(),
  nonce: vi.fn(),
  keyAccount: vi.fn(),
  post: vi.fn(),
  toast: vi.fn(),
  trx: '100000000',
  usdt: '50000000',
  contacts: [],
  xpriv: '',
  pending: vi.fn(),
  record: vi.fn(),
  actual: null,
  socket: { txRejected: '', chain: '', txid: '' },
}));

vi.mock('@runonflux/tron-multisig', async (importOriginal) => {
  const actual = await importOriginal();
  const base = {
    ...actual.NETWORKS.mainnet,
    name: 'ssp-vectors',
    factory: 'THEmkXNjoxz6zj7wDBtXRd1DCYeLTvRYSB',
    implementation: 'TJEfVHrNkFfPdyNVFmY8cvJPm77rDQfSn3',
  };
  m.live = actual.getNetwork({
    ...base,
    sponsor: 'TJEfVHrNkFfPdyNVFmY8cvJPm77rDQfSn3',
    feeCollector: 'TFhcYVArFkJW6bPUDid4AFCAjKmh6Ez3vv',
  });
  m.notLive = actual.getNetwork(base);
  m.net = m.live;
  return {
    ...actual,
    getNetwork: (n) => (n === 'mainnet' ? m.net : actual.getNetwork(n)),
  };
});
vi.mock('../../src/lib/tron', async (importOriginal) => {
  const actual = await importOriginal();
  m.actual = actual;
  return {
    ...actual,
    requestTronQuote: m.quote,
    isTronUsdtBlacklisted: m.blacklisted,
    pickTronSelfPayNonce: m.nonce,
    fetchTronKeyAccount: m.keyAccount,
    pendingTronOutstandingNonce: m.pending,
    recordTronOutstandingPayload: m.record,
  };
});
vi.mock('../../src/lib/balances', () => ({
  fetchAddressBalance: async () => ({ confirmed: m.trx, unconfirmed: '0' }),
  fetchAddressTokenBalances: async (_a, _c, contracts) =>
    contracts.includes(USDT) ? [{ contract: USDT, balance: m.usdt }] : [],
}));
vi.mock('../../src/hooks', () => {
  const state = {
    sspState: { activeChain: 'tron', sspWalletKeyInternalIdentity: 'wk1' },
    tron: {
      wallets: {
        '0-0': {
          address: 'TWq9eJbomJDmkME7ahC4renGL2BXacL2vd',
          activatedTokens: ['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'],
        },
      },
      walletInUse: '0-0',
      xpubWallet:
        'xpub6DugByuv8jZ582WqjRXeieyXbrsEdQvnuF6TfF2YGZW8LmrGQ6E1HGcRA7zrsX2uRLSpMEHwnpc5np6odeCJBhwcXi1MBDtwikT4MbfK8Uo',
      xpubKey:
        'xpub6EEnUgN1rd2paX4iybUKeC5qeiXxYv7jBCVawi1a3HnTfycaUGn2s2xWcBX7jcE7M18EJLw3HUJa9iG9vVRQTMa5bcZDpTzGyh8iBMARBS3',
      importedTokens: [],
    },
    get contacts() {
      return { contacts: { tron: m.contacts } };
    },
    fiatCryptoRates: {
      cryptoRates: { tron: 0.3, usdt: 1 },
      fiatRates: { USD: 1 },
    },
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
    txid: m.socket.txid ?? '',
    clearTxid: () => {},
    txRejected: m.socket.txRejected,
    chain: m.socket.chain,
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
vi.mock('antd', () => {
  const Stub = () => null;
  const Radio = Object.assign(() => null, { Group: Stub });
  return {
    Form: { useForm: () => [{ setFieldValue: () => {} }] },
    Alert: Stub,
    Checkbox: Stub,
    Modal: Stub,
    Radio,
    Typography: { Text: Stub },
    theme: { useToken: () => ({ token: {} }) },
  };
});
vi.mock('../../src/lib/toast', () => ({ toast: { open: m.toast } }));
vi.mock('@metamask/browser-passworder', () => ({
  decrypt: async (_pw, blob) => (blob === 'pwblob' ? 'password' : m.xpriv),
}));
vi.mock('react-secure-storage', () => ({
  default: { getItem: () => 'xprivblob' },
}));
vi.mock('../../src/lib/fingerprint', () => ({ getFingerprint: () => 'fp' }));
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

import * as T from '@runonflux/tron-multisig';
import { getMasterXpriv } from '../../src/lib/wallet';
import { useTronSendStrategy } from '../../src/pages/SendFlow/useTronSendStrategy';

const W =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const nowS = () => BigInt(Math.floor(Date.now() / 1000));
const quote = (over = {}) => ({
  vault: VAULT,
  deployed: true,
  nonce: '7',
  deadline: (nowS() + 1800n).toString(),
  fee: { token: T.TRX_FEE_TOKEN, amount: '6300000', recipient: COLLECTOR },
  feeOptions: [
    { token: T.TRX_FEE_TOKEN, amount: '6300000' },
    { token: USDT, amount: '3500000' },
  ],
  energy: { estimate: '102000' },
  sponsorAvailable: true,
  ...over,
});

let view;
let root;

function Harness() {
  view = useTronSendStrategy();
  return null;
}

async function flush(ms = 0) {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  }
}

async function mount() {
  root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(createElement(Harness));
  });
  await flush();
}

/** Fill in asset + recipient + amount and let the debounced quote land. */
async function compose(token, amount) {
  await act(async () => view.tokenSelect.onChange(token));
  await act(async () => view.receiver.set(RECIPIENT));
  await act(async () => view.amount.set(amount));
  await flush(120); // > 500 ms debounce overall
}

async function submit() {
  await act(async () => view.onFinish({}));
  await flush();
}

/** Walk a React element tree (props.children) for the first match. */
function findElement(node, pred) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, pred);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (pred(node)) return node;
  return findElement(node.props?.children, pred);
}

const postedAction = () => m.post.mock.calls.at(-1)[1];

beforeAll(() => {
  m.xpriv = getMasterXpriv(W, 48, 195, 0, 'p2sh', 'tron');
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  for (const f of [
    m.quote,
    m.blacklisted,
    m.nonce,
    m.keyAccount,
    m.post,
    m.toast,
    m.pending,
    m.record,
  ]) {
    f.mockReset();
  }
  m.socket = { txRejected: '', chain: '', txid: '' };
  localStorage.clear();
  m.pending.mockResolvedValue(null);
  m.net = m.live;
  m.trx = '100000000';
  m.usdt = '50000000';
  m.contacts = [{ id: 1, name: 'Bob', address: RECIPIENT }];
  m.quote.mockImplementation(async () => quote());
  m.blacklisted.mockResolvedValue(false);
  m.nonce.mockResolvedValue((1n << 28n) | 5n);
  m.keyAccount.mockResolvedValue({
    address: vectors.consumer.leaves['0-0'].keySigner,
    balance: '40000000',
  });
  m.post.mockResolvedValue({ data: {} });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.restoreAllMocks();
});

describe('useTronSendStrategy', () => {
  it('sponsored USDT send: quotes our signers, signs the quoted Op, posts ssp-tron-op', async () => {
    await mount();
    await compose(USDT, '25');

    expect(m.quote).toHaveBeenCalled();
    const req = m.quote.mock.calls.at(-1)[0];
    expect(req).toEqual({
      chain: 'tron',
      signers: vectors.consumer.leaves['0-0'].signers,
      threshold: 2,
      calls: vectors.consumerOp.op.calls,
    });
    expect(view.feeDisplay).toBe('6.3');
    expect(view.feeSymbol).toBe('TRX');
    expect(view.feeLabel).toBe('send:tron_fee_sponsored');
    expect(view.feeReady).toBe(true);
    // USDT send with a TRX fee: no single total
    expect(view.totalDisplay).toBeNull();
    expect(view.validateCompose()).toBeNull();

    await submit();
    expect(m.toast).not.toHaveBeenCalled();
    expect(m.post).toHaveBeenCalledTimes(1);
    const [url, action] = m.post.mock.calls[0];
    expect(url).toBe('https://relay/v1/action');
    expect(action).toMatchObject({
      action: 'tx',
      chain: 'tron',
      path: '0-0',
      wkIdentity: 'wk1',
    });
    const payload = JSON.parse(action.payload);
    expect(Object.keys(payload)).toEqual([
      'format',
      'version',
      'network',
      'vault',
      'signers',
      'threshold',
      'op',
      'walletSignature',
    ]);
    const q = m.quote.mock.results.at(-1).value;
    const quoted = await q;
    expect(payload).toMatchObject({
      format: 'ssp-tron-op',
      version: 1,
      network: 'mainnet',
      vault: VAULT,
      signers: vectors.consumer.leaves['0-0'].signers,
      threshold: 2,
    });
    expect(payload.op).toEqual({
      calls: vectors.consumerOp.op.calls,
      nonce: '7',
      deadline: quoted.deadline,
      fee: {
        token: T.TRX_FEE_TOKEN,
        amount: '6300000',
        recipient: COLLECTOR,
      },
    });
    const digest = T.opDigest(728126428n, VAULT, T.opFromJson(payload.op));
    expect(T.recoverSigner(digest, T.hexToBytes(payload.walletSignature))).toBe(
      vectors.consumer.leaves['0-0'].walletSigner,
    );
    // USDT: vault and recipient blacklist checked before signing
    expect(m.blacklisted.mock.calls.map(([a]) => a)).toEqual(
      expect.arrayContaining([VAULT, RECIPIENT]),
    );
    expect(view.pendingApproval).toBe(true);
  });

  it('a first-time recipient must be confirmed before anything is signed', async () => {
    m.contacts = [];
    await mount();
    await compose(USDT, '25');
    await submit();
    expect(m.post).not.toHaveBeenCalled();
    const modal = findElement(
      view.modals,
      (el) => el.props?.okText === 'send:tron_new_recipient_confirm',
    );
    expect(modal.props.open).toBe(true);
    await act(async () => modal.props.onOk());
    await flush();
    expect(m.post).toHaveBeenCalledTimes(1);
  });

  it('warns about a lookalike of a known address (same first/last 4)', async () => {
    const lookalike =
      RECIPIENT.slice(0, 4) + 'x'.repeat(26) + RECIPIENT.slice(-4);
    m.contacts = [{ id: 2, name: 'Exchange', address: lookalike }];
    await mount();
    await compose(USDT, '25');
    const alert = findElement(
      view.composeExtra,
      (el) => el.props?.message === 'send:tron_lookalike_warning',
    );
    expect(alert).toBeTruthy();
    // still a first-time recipient: confirmation required before signing
    await submit();
    expect(m.post).not.toHaveBeenCalled();
    const modal = findElement(
      view.modals,
      (el) => el.props?.okText === 'send:tron_new_recipient_confirm',
    );
    expect(modal.props.open).toBe(true);
  });

  it('blocks a USDT send to a blacklisted recipient', async () => {
    m.blacklisted.mockImplementation(async (a) => a === RECIPIENT);
    await mount();
    await compose(USDT, '25');
    await submit();
    expect(m.post).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        content: 'send:err_tron_recipient_blacklisted',
      }),
    );
  });

  it('a frozen (blacklisted) vault cannot send USDT', async () => {
    m.blacklisted.mockImplementation(async (a) => a === VAULT);
    await mount();
    await compose(USDT, '25');
    expect(view.validateCompose()).toBe('send:err_tron_vault_frozen');
    await submit();
    expect(m.post).not.toHaveBeenCalled();
  });

  it('never signs a quote whose fee is not paid to the pinned collector', async () => {
    m.quote.mockImplementation(async () =>
      quote({
        fee: {
          token: T.TRX_FEE_TOKEN,
          amount: '6300000',
          recipient: RECIPIENT,
        },
      }),
    );
    await mount();
    await compose(USDT, '25');
    await submit();
    expect(m.post).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'send:err_tron_quote_invalid' }),
    );
  });

  it('sponsorAvailable:false blocks the sponsored send; self-pay still works', async () => {
    m.trx = '0';
    m.quote.mockImplementation(async () =>
      quote({
        sponsorAvailable: false,
        unavailableReason: 'INSUFFICIENT_FEE_BALANCE: 0 TRX',
      }),
    );
    await mount();
    await compose(USDT, '25');
    expect(view.feeReady).toBe(false);
    expect(view.validateCompose()).toBe('send:tron_sponsor_insufficient_fee');
    await submit();
    expect(m.post).not.toHaveBeenCalled();

    const toggle = findElement(
      view.feeSection,
      (el) => el.props?.children === 'send:tron_self_pay_toggle',
    );
    await act(async () => toggle.props.onChange({ target: { checked: true } }));
    await flush();
    expect(view.feeLabel).toBe('send:tron_fee_self');
    expect(view.feeReady).toBe(true);
    const quotesBefore = m.quote.mock.calls.length;
    await submit();
    expect(m.quote.mock.calls.length).toBe(quotesBefore);
    expect(m.nonce).toHaveBeenCalledWith(VAULT, 'tron');
    const payload = JSON.parse(postedAction().payload);
    expect(payload.op.fee).toEqual({
      token: T.TRX_FEE_TOKEN,
      amount: '0',
      recipient: T.ZERO_ADDRESS,
    });
    expect(payload.op.nonce).toBe(((1n << 28n) | 5n).toString());
    expect(m.keyAccount).toHaveBeenCalled();
  });

  it('send-max asks the relay with max:{token} and uses maxSendable', async () => {
    m.quote.mockImplementation(async (req) =>
      req.max
        ? quote({ maxSendable: { token: 'TRX', amount: '93700000' } })
        : quote(),
    );
    await mount();
    await act(async () => view.receiver.set(RECIPIENT));
    await flush();
    await act(async () => view.amount.onMax());
    await flush(120);
    const maxReq = m.quote.mock.calls.find(([r]) => r.max)[0];
    expect(maxReq.max).toEqual({ token: 'TRX' });
    expect(maxReq.calls).toEqual([
      {
        to: RECIPIENT,
        value: '100000000',
        data: '0x',
        tokenId: '0',
        tokenValue: '0',
      },
    ]);
    expect(view.amount.value).toBe('93.7');
    // TRX send with a TRX fee: amount + fee total
    expect(view.totalDisplay).toBe('100');
  });

  it('not live (sponsor/fee collector unpinned): nothing is quoted or sent', async () => {
    m.net = m.notLive;
    await mount();
    await compose('', '1');
    expect(view.validateCompose()).toBe('send:err_tron_not_live');
    expect(view.feeReady).toBe(false);
    expect(view.receiver.disabled).toBe(true);
    expect(m.quote).not.toHaveBeenCalled();
    await submit();
    expect(m.post).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'send:err_tron_not_live' }),
    );
  });

  it('CHN-9: a refused Op is recorded; the next send reuses its nonce (sponsored and self-pay)', async () => {
    await mount();
    await compose(USDT, '25');
    await submit();
    const first = postedAction().payload;
    expect(JSON.parse(first).op.nonce).toBe('7');

    // SSP Key reports the relay's refusal: the Op we sent is recorded, and
    // the record (still valid, unused on chain) is re-read for the banner.
    const deadline = nowS() + 1500n;
    m.pending.mockResolvedValue({ nonce: 3n, deadline });
    m.socket = { txRejected: first, chain: 'tron' };
    await act(async () => root.render(createElement(Harness)));
    await flush();
    expect(m.record).toHaveBeenCalledWith(first, 'tron');

    // The next sponsored send must carry ITS nonce (3), not the relay's
    // freshly quoted one (7).
    m.socket = { txRejected: '', chain: '' };
    await act(async () => root.render(createElement(Harness)));
    await compose(USDT, '24');
    const banner = findElement(
      view.composeExtra,
      (el) => el.props?.message === 'send:tron_refused_pending_title',
    );
    expect(banner).not.toBeNull();
    await submit();
    const second = JSON.parse(postedAction().payload);
    expect(second.op.nonce).toBe('3');
    expect(m.pending).toHaveBeenCalledWith({ chain: 'tron', vault: VAULT });
    // the reviewed fee from the quote is kept
    expect(second.op.fee.amount).toBe('6300000');

    // Self-pay reuses it too, instead of a fresh self-pay nonce.
    const toggle = findElement(
      view.feeSection,
      (el) => el.props?.children === 'send:tron_self_pay_toggle',
    );
    await act(async () => toggle.props.onChange({ target: { checked: true } }));
    await flush();
    await submit();
    expect(JSON.parse(postedAction().payload).op.nonce).toBe('3');
    expect(m.nonce).not.toHaveBeenCalled();
  });

  it.each([
    ['a relay error when posting', 'post-error'],
    ['a timeout (no answer from SSP Key at all)', 'timeout'],
    ['a fake success txid that is not on chain', 'fake-txid'],
  ])(
    'CHN-9: after %s, the next send reuses the nonce until the chain shows it used',
    async (_label, kind) => {
      // The REAL record + lookup, against a fake TRON node of this wallet.
      const used = new Set();
      const node = {
        hasCode: vi.fn(async () => true),
        isNonceUsed: vi.fn(async (_v, n) => used.has(n)),
      };
      m.record.mockImplementation((payload, chain) =>
        m.actual.recordTronOutstandingPayload(payload, chain),
      );
      m.pending.mockImplementation((p) =>
        m.actual.pendingTronOutstandingNonce({ ...p, client: node }),
      );
      await mount();
      await compose(USDT, '25');
      if (kind === 'post-error') {
        m.post.mockRejectedValueOnce(
          new Error('Request failed with status code 502'),
        );
      }
      await submit();
      expect(m.post).toHaveBeenCalledTimes(1);
      // recorded BEFORE it was posted
      expect(m.record.mock.invocationCallOrder[0]).toBeLessThan(
        m.post.mock.invocationCallOrder[0],
      );
      const first = JSON.parse(m.post.mock.calls[0][1].payload);
      expect(first.op.nonce).toBe('7');
      if (kind === 'fake-txid') {
        m.socket = { txRejected: '', chain: 'tron', txid: 'ab'.repeat(32) };
        await act(async () => root.render(createElement(Harness)));
        await flush();
        m.socket = { txRejected: '', chain: '', txid: '' };
        await act(async () => root.render(createElement(Harness)));
      }

      // The relay now quotes a FRESH nonce; the send must not use it.
      m.quote.mockImplementation(async () => quote({ nonce: '8' }));
      await compose(USDT, '24');
      await submit();
      expect(JSON.parse(postedAction().payload).op.nonce).toBe('7');
      expect(node.isNonceUsed).toHaveBeenCalledWith(VAULT, 7n);

      // Once this wallet's node shows nonce 7 used, the quoted one is used.
      used.add(7n);
      await compose(USDT, '23');
      await submit();
      expect(JSON.parse(postedAction().payload).op.nonce).toBe('8');
    },
  );

  it('CHN-9: an Op whose record cannot be saved is never posted', async () => {
    await mount();
    await compose(USDT, '25');
    m.record.mockImplementation(() => {
      throw Object.assign(new Error('Could not save'), {
        code: 'OUTSTANDING_OPS_UNWRITABLE',
      });
    });
    await submit();
    expect(m.record).toHaveBeenCalledTimes(1);
    expect(m.post).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    );
  });

  it('CHN-9: an unreadable outstanding-op record refuses the send (never forgets it)', async () => {
    await mount();
    await compose(USDT, '25');
    m.pending.mockRejectedValue(
      Object.assign(new Error('paused until 12:00'), {
        code: 'OUTSTANDING_OPS_UNREADABLE',
      }),
    );
    await submit();
    expect(m.post).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    );
  });

  it('KAS-7 sibling: hex / exponent amounts are not quoted or sent', async () => {
    await mount();
    for (const bad of ['0x10', '1e2', '+1', ' 1']) {
      await compose('', bad);
      expect(view.validateCompose()).toBe('send:err_invalid_amount');
    }
    expect(m.quote).not.toHaveBeenCalled();
  });
});
