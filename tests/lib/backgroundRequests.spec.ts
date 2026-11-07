// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test harness over a plain service-worker script
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { webcrypto } from 'crypto';

/**
 * Behaviour of public/scripts/background.js's dApp request routing (security
 * review WEXT-3). The REAL script runs in a VM against a mocked extension API.
 *
 * Before the fix the background kept ONE response slot: a second tab's
 * request overwrote it, so the first request's answer (vault xpubs, WK
 * signatures, a payment txid) was delivered to the second page, and any page
 * could close the wallet popup of another request by sending an unknown
 * method.
 */

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'scripts', 'background.js'),
  'utf8',
);

const EXT_ID = 'ext-id';
const EXT_BASE = `chrome-extension://${EXT_ID}/`;

const uiSender = { id: EXT_ID, url: `${EXT_BASE}index.html` };
const pageSender = (tabId: number, origin: string, frameId = 0) => ({
  id: EXT_ID,
  tab: { id: tabId, url: `${origin}/page`, windowId: 1 },
  url: `${origin}/page`,
  origin,
  frameId,
});

const flush = async (ms = 0) => {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
};

function loadBackground() {
  const onMessage: Array<(m, s, r) => unknown> = [];
  const onConnect: Array<(port) => void> = [];
  const onWindowRemoved: Array<(id: number) => void> = [];
  const onTabRemoved: Array<(id: number) => void> = [];
  const broadcast: unknown[] = [];
  let nextWindowId = 100;

  const chrome = {
    runtime: {
      id: EXT_ID,
      getURL: (p: string) => `${EXT_BASE}${p}`,
      onMessage: { addListener: (f) => onMessage.push(f) },
      onConnect: { addListener: (f) => onConnect.push(f) },
      onInstalled: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
      sendMessage: vi.fn((message) => {
        broadcast.push(message);
        return Promise.resolve();
      }),
    },
    storage: {
      local: { get: async () => ({}), set: async () => undefined },
    },
    action: {
      onClicked: { addListener: () => undefined },
      setPopup: async () => undefined,
      openPopup: async () => undefined,
    },
    contextMenus: {
      removeAll: (cb?: () => void) => cb?.(),
      create: () => undefined,
      update: async () => undefined,
      onClicked: { addListener: () => undefined },
    },
    windows: {
      create: vi.fn(async () => ({ id: nextWindowId++ })),
      update: vi.fn(async () => ({})),
      get: vi.fn(async (id) => ({ id })),
      getLastFocused: async () => ({ top: 0, left: 0, width: 1200 }),
      getCurrent: async () => ({ id: 1 }),
      remove: vi.fn(async () => undefined),
      onRemoved: { addListener: (f) => onWindowRemoved.push(f) },
    },
    tabs: { onRemoved: { addListener: (f) => onTabRemoved.push(f) } },
    scripting: { registerContentScripts: async () => undefined },
  };

  vm.runInNewContext(source, {
    chrome,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    console: { log: () => undefined, warn: () => undefined },
    URL,
    Date,
    Set,
    Map,
    Uint8Array,
    Array,
    Promise,
  });

  /** Deliver a runtime message to every listener, like Chrome does. */
  const send = (message, sender) => {
    const sendResponse = vi.fn();
    const returned = onMessage.map((listener) =>
      listener(message, sender, sendResponse),
    );
    return { sendResponse, keptOpen: returned.includes(true) };
  };

  const connectUI = () => {
    const disconnect: Array<() => void> = [];
    const port = {
      name: 'ssp-ui',
      onDisconnect: { addListener: (f) => disconnect.push(f) },
    };
    onConnect.forEach((listener) => listener(port));
    return { disconnect: () => disconnect.forEach((f) => f()) };
  };

  const dappRequest = (tabId: number, origin: string, method: string) =>
    send({ method, params: { message: 'hello' } }, pageSender(tabId, origin));

  /** Requests the background forwarded to the UI. */
  const forwarded = () =>
    broadcast.filter(
      (m) => (m as { origin: string }).origin === 'ssp-background',
    );

  return {
    chrome,
    send,
    connectUI,
    dappRequest,
    forwarded,
    uiReady: () => send({ origin: 'ssp-ui-ready' }, uiSender),
    uiReply: (requestId, data) =>
      send({ origin: 'ssp', requestId, data }, uiSender),
    closeWindow: (id: number) => onWindowRemoved.forEach((f) => f(id)),
    closeTab: (id: number) => onTabRemoved.forEach((f) => f(id)),
  };
}

describe('background.js — one dApp request in flight, keyed by request id', () => {
  let bg: ReturnType<typeof loadBackground>;

  beforeEach(() => {
    bg = loadBackground();
  });

  it('forwards the request with a request id once the UI is ready', async () => {
    const a = bg.dappRequest(
      1,
      'https://enterprise.sspwallet.com',
      'enterprise_vault_xpub',
    );
    expect(a.keptOpen).toBe(true);
    await flush();
    expect(bg.chrome.windows.create).toHaveBeenCalledTimes(1);
    bg.uiReady();
    const [delivered] = bg.forwarded();
    expect(typeof delivered.requestId).toBe('string');
    expect(delivered.requestId.length).toBeGreaterThanOrEqual(32);
    expect(delivered.data.params.verifiedOrigin).toBe(
      'https://enterprise.sspwallet.com',
    );
  });

  it('forwards enterprise_vault_address (VD-5) to the wallet UI instead of refusing it', async () => {
    // The UI (sspConnectContext ENTERPRISE_ONLY_METHODS) restricts it to the
    // SSP Enterprise origins; the background only needs to let it through.
    const a = bg.dappRequest(
      1,
      'https://enterprise.sspwallet.com',
      'enterprise_vault_address',
    );
    expect(a.keptOpen).toBe(true);
    expect(a.sendResponse).not.toHaveBeenCalled();
    await flush();
    bg.uiReady();
    const [delivered] = bg.forwarded();
    expect(delivered.data.method).toBe('enterprise_vault_address');
    expect(delivered.data.params.verifiedOrigin).toBe(
      'https://enterprise.sspwallet.com',
    );
  });

  it('refuses a second request as busy instead of taking over the slot', async () => {
    const a = bg.dappRequest(
      1,
      'https://enterprise.sspwallet.com',
      'enterprise_vault_xpub',
    );
    await flush();
    bg.uiReady();
    const requestIdA = bg.forwarded()[0].requestId;

    // Another tab (or an embedded iframe) asks for something harmless.
    const b = bg.dappRequest(2, 'https://evil.example', 'chains_info');
    expect(b.sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR', errorCode: 'BUSY' }),
    );
    expect(b.keptOpen).toBe(false);

    // The Key answers request A: it reaches A, never B.
    const xpubs = { status: 'SUCCESS', result: { xpubWallet: 'xpubW' } };
    bg.uiReply(requestIdA, xpubs);
    expect(a.sendResponse).toHaveBeenCalledWith(xpubs);
    expect(b.sendResponse).toHaveBeenCalledTimes(1);
  });

  it('ignores an answer carrying another request id (or none)', async () => {
    const a = bg.dappRequest(1, 'https://a.example', 'sign_message');
    await flush();
    bg.uiReady();
    const requestIdA = bg.forwarded()[0].requestId;

    bg.uiReply('not-the-id', { status: 'SUCCESS', signature: 'forged' });
    bg.uiReply(undefined, { status: 'SUCCESS', signature: 'forged' });
    expect(a.sendResponse).not.toHaveBeenCalled();
    expect(bg.chrome.windows.remove).not.toHaveBeenCalled();

    bg.uiReply(requestIdA, { status: 'SUCCESS', signature: 'real' });
    expect(a.sendResponse).toHaveBeenCalledWith({
      status: 'SUCCESS',
      signature: 'real',
    });
  });

  it('only resolves a request once', async () => {
    const a = bg.dappRequest(1, 'https://a.example', 'sign_message');
    await flush();
    bg.uiReady();
    const requestId = bg.forwarded()[0].requestId;
    bg.uiReply(requestId, { status: 'SUCCESS' });
    bg.uiReply(requestId, { status: 'SUCCESS', again: true });
    expect(a.sendResponse).toHaveBeenCalledTimes(1);
  });

  it('closes the popup it opened only for the owning request', async () => {
    bg.dappRequest(1, 'https://a.example', 'sign_message');
    await flush();
    bg.uiReady();
    const requestId = bg.forwarded()[0].requestId;

    // A page answering itself is not the UI: ignored.
    bg.send(
      { origin: 'ssp', requestId, data: { status: 'ERROR' } },
      pageSender(2, 'https://evil.example'),
    );
    expect(bg.chrome.windows.remove).not.toHaveBeenCalled();

    bg.uiReply(requestId, { status: 'SUCCESS' });
    expect(bg.chrome.windows.remove).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown method without opening or closing any window', async () => {
    const a = bg.dappRequest(1, 'https://a.example', 'sign_message');
    await flush();
    const windowsOpened = bg.chrome.windows.create.mock.calls.length;

    const junk = bg.dappRequest(
      2,
      'https://evil.example',
      'definitely_not_a_method',
    );
    expect(junk.sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR' }),
    );
    expect(junk.keptOpen).toBe(false);
    await flush();
    expect(bg.chrome.windows.create.mock.calls.length).toBe(windowsOpened);
    expect(bg.chrome.windows.remove).not.toHaveBeenCalled();
    expect(a.sendResponse).not.toHaveBeenCalled();
  });

  it('answers the in-flight request when its popup is closed, then accepts new ones', async () => {
    const a = bg.dappRequest(1, 'https://a.example', 'sign_message');
    await flush();
    bg.closeWindow(100);
    expect(a.sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR', code: 4001 }),
    );
    const b = bg.dappRequest(2, 'https://b.example', 'chains_info');
    expect(b.keptOpen).toBe(true);
  });

  it('frees the slot when the requesting tab closes', async () => {
    const a = bg.dappRequest(7, 'https://a.example', 'sign_message');
    await flush();
    bg.closeTab(7);
    expect(a.sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR' }),
    );
    expect(bg.dappRequest(8, 'https://b.example', 'chains_info').keptOpen).toBe(
      true,
    );
  });

  it('routes to an already-open side panel without a window, and keeps it open on reply', async () => {
    bg.connectUI();
    const a = bg.dappRequest(1, 'https://a.example', 'user_addresses');
    await flush(40);
    expect(bg.chrome.windows.create).not.toHaveBeenCalled();
    const [delivered] = bg.forwarded();
    expect(delivered.requestId).toBeTruthy();
    bg.uiReply(delivered.requestId, { status: 'SUCCESS' });
    expect(a.sendResponse).toHaveBeenCalledWith({ status: 'SUCCESS' });
    expect(bg.chrome.windows.remove).not.toHaveBeenCalled();
  });

  it('answers the in-flight request when the UI it was shown in goes away', async () => {
    const ui = bg.connectUI();
    const a = bg.dappRequest(1, 'https://a.example', 'user_addresses');
    await flush(40);
    ui.disconnect();
    expect(a.sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR', code: 4001 }),
    );
  });

  it('resolves a pay request only with an answer that echoes its id', async () => {
    const pay = bg.dappRequest(1, 'https://shop.example', 'pay');
    await flush();
    bg.uiReady();
    const requestId = bg.forwarded()[0].requestId;

    // The old id-less send-flow answer is no longer accepted, not even for pay.
    bg.uiReply(undefined, { status: 'SUCCESS', txid: 'forged' });
    bg.uiReply('', { status: 'SUCCESS', txid: 'forged' });
    bg.uiReply('not-the-id', { status: 'SUCCESS', txid: 'forged' });
    expect(pay.sendResponse).not.toHaveBeenCalled();

    bg.uiReply(requestId, { status: 'SUCCESS', txid: 'abc' });
    expect(pay.sendResponse).toHaveBeenCalledWith({
      status: 'SUCCESS',
      txid: 'abc',
    });
  });

  it('never lets a page raise a UI-only message', () => {
    const forged = bg.send(
      { origin: 'ssp-ui-ready' },
      pageSender(1, 'https://evil.example'),
    );
    expect(forged.keptOpen).toBe(false);
    expect(bg.forwarded()).toHaveLength(0);
  });
});
