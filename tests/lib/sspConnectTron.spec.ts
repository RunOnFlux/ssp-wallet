// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * SspConnectProvider — TRON request handling (contract §7), driven through
 * the real background-message listener:
 *  - every message-signing method is rejected for `tron` / `tronNile`;
 *  - a `pay` request with a message is rejected (a vault Op has no memo);
 *    without one it is accepted, including a whitelisted TRC-20 contract;
 *  - `enterprise_vault_sign_tx` threads the `tronOp` JSON string into the
 *    context (like evmUserOp) and clears it on the next request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act, useContext } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../../src/hooks', () => ({
  useAppSelector: (sel) =>
    sel({
      sspState: {
        sspWalletExternalIdentity: 'ext',
        sspWalletKeyInternalIdentity: 'wk1',
        identityChain: 'btc',
      },
    }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

import {
  SspConnectProvider,
  SspConnectContext,
} from '../../src/contexts/sspConnectContext';

const VAULT = 'TWq9eJbomJDmkME7ahC4renGL2BXacL2vd';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

let listener;
let sendMessage;
let ctx;
let root;

function Probe() {
  ctx = useContext(SspConnectContext);
  return null;
}

async function mount() {
  root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(createElement(SspConnectProvider, null, createElement(Probe)));
  });
}

async function request(method, params) {
  await act(async () => {
    listener({ origin: 'ssp-background', data: { method, params } });
  });
}

const errors = () =>
  sendMessage.mock.calls
    .map(([msg]) => msg?.data)
    .filter((d) => d?.status === 'ERROR')
    .map((d) => d.result);

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  sendMessage = vi.fn(async () => undefined);
  listener = undefined;
  window.chrome = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (fn) => {
          listener = fn;
        },
        removeListener: () => {},
      },
      connect: () => ({
        onDisconnect: { addListener: () => {} },
        disconnect: () => {},
      }),
    },
  };
  await mount();
  expect(listener).toBeTypeOf('function');
});
afterEach(async () => {
  await act(async () => root.unmount());
  delete window.chrome;
  vi.restoreAllMocks();
});

describe('SSP Connect — TRON', () => {
  it.each([
    ['sign_message', 'tron'],
    ['sspwid_sign_message', 'tron'],
    ['wk_sign_message', 'tron'],
    ['sign_message', 'tronNile'],
  ])('rejects %s for %s', async (method, chain) => {
    await request(method, { chain, message: 'hello' });
    expect(errors()).toEqual([
      'common:request_rejected: home:sspConnect.tron_message_unsupported',
    ]);
    expect(ctx.type).toBe('');
    expect(ctx.message).toBe('');
  });

  it('rejects a tron payment that carries a message', async () => {
    await request('pay', {
      chain: 'tron',
      address: VAULT,
      amount: '1',
      message: 'invoice 42',
    });
    expect(errors()).toEqual([
      'common:request_rejected: home:sspConnect.tron_pay_message_unsupported',
    ]);
    expect(ctx.type).toBe('');
  });

  it('accepts a tron USDT payment without a message', async () => {
    await request('pay', {
      chain: 'tron',
      address: VAULT,
      amount: '5',
      contract: USDT,
    });
    expect(errors()).toEqual([]);
    expect(ctx.type).toBe('pay');
    expect(ctx.chain).toBe('tron');
    expect(ctx.contract).toBe(USDT);
  });

  it('refuses a TRC-20 contract that is not whitelisted (case-sensitive)', async () => {
    await request('pay', {
      chain: 'tron',
      address: VAULT,
      amount: '5',
      contract: USDT.toLowerCase(),
    });
    expect(errors()).toEqual([
      'common:request_rejected: home:sspConnect.unsupported_contract',
    ]);
  });

  it('threads tronOp through enterprise_vault_sign_tx', async () => {
    const tronOp = JSON.stringify({
      network: 'mainnet',
      vault: VAULT,
      signers: [],
      threshold: 2,
      op: {},
    });
    const base = {
      chain: 'tron',
      orgIndex: 100,
      vaultIndex: 0,
      recipients: '[]',
      fee: '6300000',
      rawUnsignedTx: '0x' + 'ab'.repeat(32),
      inputDetails: '[{"addressIndex":0}]',
      vaultName: 'V',
      orgName: 'O',
    };
    await request('enterprise_vault_sign_tx', { ...base, tronOp });
    expect(errors()).toEqual([]);
    expect(ctx.type).toBe('enterprise_vault_sign_tx');
    expect(ctx.tronOp).toBe(tronOp);
    expect(ctx.evmUserOp).toBeUndefined();

    // a request without tronOp never inherits the previous one
    await request('enterprise_vault_sign_tx', base);
    expect(ctx.tronOp).toBeUndefined();
  });
});
