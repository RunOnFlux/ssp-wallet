import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { blockchains } from '../../src/storage/blockchains';
import common from '../../src/translations/resources/en/common.json';

/**
 * Contract for in-flight state and a11y on the wallet chrome (ConfirmTxKey,
 * WalletSwitcher, ChainSwitchModal, Navigation, AutoLogout, NodesActions,
 * TutorialTrigger). None of these can be asserted by rendering (no layout
 * engine, no React testing library here), so the tests lock the pure data each
 * one depends on plus its source-level invariant.
 */

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const confirmTxKeySource = read(
  '../../src/components/ConfirmTxKey/ConfirmTxKey.tsx',
);
const walletSwitcherSource = read(
  '../../src/components/WalletSwitcher/WalletSwitcher.tsx',
);
const walletSwitcherCss = read(
  '../../src/components/WalletSwitcher/WalletSwitcher.css',
);
const chainSwitchModalSource = read(
  '../../src/components/WalletConnect/modals/ChainSwitchModal.tsx',
);
const navigationSource = read('../../src/components/Navigation/Navigation.tsx');
const autoLogoutSource = read('../../src/components/AutoLogout/AutoLogout.tsx');
const nodesActionsSource = read('../../src/components/Nodes/NodesActions.tsx');
const tutorialTriggerSource = read(
  '../../src/components/Tutorial/TutorialTrigger.tsx',
);

describe('ConfirmTxKey — a pending request has no primary "confirm"', () => {
  it('treats "waiting and not yet expired" as the pending phase', () => {
    expect(confirmTxKeySource).toMatch(
      /const isPending =\s*phase === 'waiting' && remainingSeconds > 0;/,
    );
  });

  it('offers Close while pending and a primary Done only when terminal', () => {
    expect(confirmTxKeySource).toContain(
      "type={isPending ? 'default' : 'primary'}",
    );
    expect(confirmTxKeySource).toContain(
      "{isPending ? t('common:close') : t('common:done')}",
    );
    // the old footer: a single amber OK on every phase
    expect(confirmTxKeySource).not.toContain('<Button key="ok" type="primary"');
  });

  it('says out loud that closing does not cancel the relay action', () => {
    expect(confirmTxKeySource).toContain(
      'home:keyHandshake.close_keeps_pending',
    );
  });

  it('has the English labels the footer switches between', () => {
    expect(common.close).toBe('Close');
    expect(common.done).toBe('Done');
  });
});

describe('WalletSwitcher — one chain switch at a time', () => {
  it('guards re-entrancy with a ref, not only with state', () => {
    expect(walletSwitcherSource).toContain(
      'if (switchInFlight.current) return;',
    );
    expect(walletSwitcherSource).toContain('switchInFlight.current = true;');
    // released in finally so a failed switch cannot wedge the sheet
    expect(walletSwitcherSource).toMatch(
      /} finally \{\s*switchInFlight\.current = false;\s*setSwitchingChain\(null\);/,
    );
  });

  it('disables every row while a switch is in flight', () => {
    expect(walletSwitcherSource).toContain(
      'const rowsDisabled = switchingChain !== null;',
    );
    // network rows
    expect(walletSwitcherSource).toContain('disabled={rowsDisabled}');
    // wallet rows are role=button divs — aria-disabled + guarded handlers
    expect(walletSwitcherSource).toContain(
      'aria-disabled={rowsDisabled || undefined}',
    );
    expect(walletSwitcherSource).toMatch(
      /onClick=\{\(\) => \{\s*if \(rowsDisabled\) return;\s*void selectWallet\(id\);/,
    );
    // wallet management writes the same per-chain keys
    expect(walletSwitcherSource).toContain(
      'disabled={rowsDisabled || walletIds.length >= 20}',
    );
  });

  it('marks the row being switched as busy with a spinner', () => {
    expect(walletSwitcherSource).toContain(
      'aria-busy={chain === switchingChain || undefined}',
    );
    expect(walletSwitcherSource).toContain(
      '{chain === switchingChain && <Spin size="small" />}',
    );
  });

  it('styles the inert rows so they read as inert', () => {
    expect(walletSwitcherCss).toContain(
      ".switcher-wallet[aria-disabled='true']",
    );
    expect(walletSwitcherCss).toContain('.switcher-chain:disabled');
    expect(walletSwitcherCss).toContain(
      '.switcher-chain:disabled.switcher-chain-switching',
    );
    expect(walletSwitcherCss).toContain('cursor: not-allowed;');
  });

  it('keeps the switch indicator legible and reduced-motion safe', () => {
    // antd's Spin dots default to colorPrimary (1.7:1 on the light surface)
    expect(walletSwitcherCss).toContain(
      '.switcher-chain.switcher-chain-switching .ant-spin.ant-spin-section',
    );
    expect(walletSwitcherCss).toContain('color: #b45309;');
    const [, reducedMotion] = walletSwitcherCss.split(
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(reducedMotion).toContain('.ant-spin-dot-item');
    expect(reducedMotion).toContain('animation: none;');
    expect(reducedMotion).toContain('opacity: 1;');
  });
});

describe('ChainSwitchModal — Approve reports its state and its failures', () => {
  it('shows the in-flight state its four sibling modals show', () => {
    expect(chainSwitchModalSource).toContain('confirmLoading={isApproving}');
    expect(chainSwitchModalSource).toContain('if (isApproving) return;');
  });

  it('never rejects silently after the user pressed Approve', () => {
    expect(chainSwitchModalSource).toMatch(
      /toast\.error\([\s\S]*?\);\s*void onReject\(request\);/,
    );
  });

  it('handles the unsupported chain in an effect, not during render', () => {
    const [, afterEffect] = chainSwitchModalSource.split('modal.error({');
    expect(afterEffect).toBeDefined();
    const beforeEffect = chainSwitchModalSource.slice(
      0,
      chainSwitchModalSource.indexOf('modal.error({'),
    );
    expect(beforeEffect).toContain('useEffect(');
    // fires once per request id
    expect(chainSwitchModalSource).toContain(
      'rejectedRequestId.current = request.id;',
    );
  });

  it('gives the error dialog a title distinct from its body', () => {
    expect(chainSwitchModalSource).toMatch(
      /title: t\('home:walletconnect\.switch_chain_request'\),\s*content: t\('home:walletconnect\.unsupported_chain_id', \{ chainId \}\),/,
    );
  });
});

describe('Navigation — a disabled Buy/Sell tile explains itself', () => {
  it('has no chain where the old "mainnet without onramp" branch applied', () => {
    // onramperNetwork is absent on the chains that have no onramp at all
    const chainConfigs = Object.values(blockchains) as {
      symbol: string;
      onramperNetwork?: string;
    }[];
    const withoutOnramp = chainConfigs.filter(
      (chain) => !chain.onramperNetwork,
    );
    expect(withoutOnramp.length).toBeGreaterThan(0);
    // every one of them is a test network, which is why the old tooltip
    // condition (!onramperNetwork && !symbol.includes('TEST')) was dead code
    for (const chain of withoutOnramp) {
      expect(chain.symbol).toContain('TEST');
    }
  });

  it('gates the tooltip on exactly what gates the unavailable state', () => {
    // aria-disabled, NOT the `disabled` attribute: a natively disabled button
    // leaves the tab order, which made the tooltip explaining WHY the tile is
    // unavailable hover-only. The invariant this test exists for is unchanged —
    // the tooltip and the unavailable state are driven by the same expression.
    expect(navigationSource).toContain(
      'aria-disabled={buySellUnavailable || undefined}',
    );
    expect(navigationSource).not.toMatch(/\sdisabled=\{buySellUnavailable\}/);
    expect(navigationSource).toMatch(
      /buySellAvailable &&\s*\(buySellUnavailable \?/,
    );
    expect(navigationSource).not.toContain('buySellComingSoon');
  });

  it('keeps the unavailable tile focusable and its tooltip focus-triggered', () => {
    // Both halves are required: aria-disabled alone would leave the tooltip
    // hover-only, and a focus trigger alone would have nothing to fire on.
    expect(navigationSource).toMatch(/trigger=\{\['hover', 'focus'\]\}/);
    expect(navigationSource).toContain('if (buySellUnavailable) return;');
  });

  it('gives test networks their own reason', () => {
    expect(navigationSource).toContain(
      'home:buy_sell_crypto.not_on_test_networks',
    );
    expect(navigationSource).toContain('home:buy_sell_crypto.coming_soon');
  });
});

describe('AutoLogout — keyboard activity counts', () => {
  it('listens for the whole keyboard path, not just clicks', () => {
    for (const event of ['click', 'keydown', 'input', 'focusin', 'scroll']) {
      expect(autoLogoutSource).toContain(`'${event}',`);
    }
    // the old single registration
    expect(autoLogoutSource).not.toContain(
      "document.addEventListener('click', refresh)",
    );
  });

  it('registers and removes the same stable handler', () => {
    expect(autoLogoutSource).toContain(
      'const onActivity = onActivityRef.current;',
    );
    expect(autoLogoutSource).toMatch(
      /document\.removeEventListener\(event, onActivity, true\);/,
    );
    expect(autoLogoutSource).toMatch(
      /document\.addEventListener\(event, onActivity, \{\s*capture: true,\s*passive: true,\s*\}\);/,
    );
  });

  it('throttles the per-keystroke work and warns before locking', () => {
    expect(autoLogoutSource).toContain('const refreshThrottleMs = 5 * 1000;');
    expect(autoLogoutSource).toContain('const warningLeadMs = 60 * 1000;');
    expect(autoLogoutSource).toContain(
      'warningTimeout = setTimeout(warnBeforeLogout, tenMins - warningLeadMs);',
    );
    // mount must arm the timers even inside the throttle window
    expect(autoLogoutSource).toContain('refresh(true);');
  });
});

describe('icon-only controls carry an accessible name', () => {
  it('names the Nodes overflow trigger', () => {
    expect(nodesActionsSource).toMatch(
      /icon=\{<EllipsisVerticalIcon \/>\}\s*aria-label=\{t\('home:nodesTable\.node_actions'/,
    );
    expect(nodesActionsSource).toMatch(
      /title=\{t\('home:nodesTable\.node_actions'/,
    );
  });
});

describe('TutorialTrigger — the welcome surface is a real dialog', () => {
  it('replaces the hand-rolled fixed scrim with antd Modal', () => {
    expect(tutorialTriggerSource).not.toContain("position: 'fixed'");
    expect(tutorialTriggerSource).not.toContain('zIndex: 99999');
    expect(tutorialTriggerSource).not.toContain('<Card');
    expect(tutorialTriggerSource).toMatch(
      /<Modal\s+open=\{showWelcome\}\s+title=\{t\('home:tutorial\.tutorial_help'\)\}\s+onCancel=\{handleDismissWelcome\}/,
    );
  });

  it('drops the unnamed close button along with it', () => {
    // antd Modal renders its own labelled close control
    expect(tutorialTriggerSource).not.toContain('icon={<XIcon />}');
    expect(tutorialTriggerSource).not.toContain('X as XIcon');
  });
});
