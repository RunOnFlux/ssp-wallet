// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * Kaspa activity rows: the stored "height" is the accepting block's blue
 * score, which grows ~10 per second, so tip − height would be a huge,
 * meaningless confirmation count. An accepted Kaspa row reads as confirmed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }),
}));

import TxDetails from '../../src/components/ActivityRow/TxDetails';

let root;
let container;

async function render(props) {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(TxDetails, props));
  });
  return container.textContent;
}

const row = (type, blockheight) => ({
  txid: 'aa'.repeat(32),
  blockheight,
  timestamp: 1727300000000,
  fee: '10000',
  amount: '100000000',
  message: '',
  receiver: 'kaspa:qr',
  type,
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe('TxDetails — Kaspa confirmations', () => {
  it('shows an accepted Kaspa row as confirmed, not tip − blue score', async () => {
    const text = await render({
      tx: row('kas', 123456789),
      chain: 'kas',
      tipHeight: 123999999,
    });
    expect(text).toContain('home:transactionsTable.kas_accepted');
    expect(text).not.toContain('543,211');
    expect(text).not.toContain('home:transactionsTable.block_height');
  });

  it('shows nothing for an unaccepted Kaspa row', async () => {
    const text = await render({
      tx: row('kas', 0),
      chain: 'kas',
      tipHeight: 123999999,
    });
    expect(text).not.toContain('home:transactionsTable.kas_accepted');
    expect(text).not.toContain('home:transactionsTable.confirmations');
  });

  it('keeps the live count for other chains', async () => {
    const text = await render({
      tx: row(undefined, 100),
      chain: 'btc',
      tipHeight: 105,
    });
    expect(text).toContain('home:transactionsTable.confirmations');
    expect(text).toContain('6');
  });
});
