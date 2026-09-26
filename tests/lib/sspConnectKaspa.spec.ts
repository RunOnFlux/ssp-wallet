// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * SspConnectProvider — Kaspa request handling (contract §6), driven through
 * the real background-message listener:
 *  - every message-signing method is rejected for `kas`;
 *  - a `pay` request for `kas` that carries a message is rejected (a Kaspa
 *    vault spend has no payload, so the message would otherwise be dropped
 *    silently); without a message it is accepted as usual.
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

describe('SSP Connect — Kaspa', () => {
  it.each(['sign_message', 'sspwid_sign_message', 'wk_sign_message'])(
    'rejects %s for kas',
    async (method) => {
      await request(method, { chain: 'kas', message: 'hello' });
      expect(errors()).toEqual([
        'common:request_rejected: home:sspConnect.kas_message_unsupported',
      ]);
      expect(ctx.type).toBe('');
      expect(ctx.message).toBe('');
    },
  );

  it('rejects a kas payment that carries a message instead of dropping it', async () => {
    await request('pay', {
      chain: 'kas',
      address: 'kaspa:qr0',
      amount: '1',
      message: 'invoice 42',
    });
    expect(errors()).toEqual([
      'common:request_rejected: home:sspConnect.kas_pay_message_unsupported',
    ]);
    expect(ctx.type).toBe('');
  });

  it('accepts a kas payment without a message', async () => {
    await request('pay', { chain: 'kas', address: 'kaspa:qr0', amount: '1' });
    expect(errors()).toEqual([]);
    expect(ctx.type).toBe('pay');
    expect(ctx.chain).toBe('kas');
    expect(ctx.amount).toBe('1');
    // a blank message is no message
    await request('pay', {
      chain: 'kas',
      address: 'kaspa:qr0',
      amount: '2',
      message: '   ',
    });
    expect(errors()).toEqual([]);
    expect(ctx.amount).toBe('2');
  });

  it('leaves message payments on other chains unchanged', async () => {
    await request('pay', {
      chain: 'btc',
      address: 'bc1qxyz',
      amount: '1',
      message: 'invoice 42',
    });
    expect(errors()).toEqual([]);
    expect(ctx.type).toBe('pay');
    expect(ctx.message).toBe('invoice 42');
  });
});
