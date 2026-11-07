// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * TRON activity rows: history is served only_confirmed (solidified), and
 * TRC-20 / internal rows carry no block number, so a stored TRON row reads as
 * confirmed — never tip − height. A fee paid in USDT is shown in USDT with 6
 * decimals, and the explorer link is Tronscan's hash route.
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
  return container;
}

const row = (over = {}) => ({
  txid: 'cd'.repeat(32),
  blockheight: 1,
  timestamp: 1727300000000,
  fee: '6300000',
  amount: '-25000000',
  message: '',
  receiver: 'TGjtodRV2nm6tQd9hsxiecLNN9QmhhVbbD',
  type: 'token',
  decimals: 6,
  tokenSymbol: 'USDT',
  ...over,
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe('TxDetails — TRON', () => {
  it('shows a stored TRON row as confirmed, not tip − height', async () => {
    const el = await render({ tx: row(), chain: 'tron', tipHeight: 70000000 });
    const text = el.textContent;
    expect(text).toContain('home:transactionsTable.tron_confirmed');
    expect(text).not.toContain('70,000,000');
    expect(text).not.toContain('home:transactionsTable.block_height');
  });

  it('shows a TRX fee with 6 decimals and no sat/B suffix', async () => {
    const el = await render({
      tx: row({ fee: '6300000' }),
      chain: 'tron',
      chainFiatRate: 0.3,
    });
    expect(el.textContent).toContain('6.3 TRX');
    expect(el.textContent).not.toContain('sat/');
  });

  it('shows a USDT fee in USDT (feeSymbol / feeDecimals)', async () => {
    const el = await render({
      tx: row({ fee: '3500000', feeSymbol: 'USDT', feeDecimals: 6 }),
      chain: 'tron',
      chainFiatRate: 0.3,
    });
    expect(el.textContent).toContain('3.5 USDT');
    expect(el.textContent).not.toContain('3.5 TRX');
  });

  it('links to Tronscan #/transaction/', async () => {
    const el = await render({ tx: row(), chain: 'tron' });
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.href);
    expect(hrefs).toContain(
      `https://tronscan.org/#/transaction/${'cd'.repeat(32)}`,
    );
  });
});
