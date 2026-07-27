import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import home from '../../src/translations/resources/en/home.json';

/**
 * Contract for the wallet/portfolio/activity surfaces (Portfolio tab, Home's
 * Activity sub-tab, the shared activity row, Receive, TokenBox). Layout and
 * rendered contrast need a browser, so these lock what is pure data: the
 * English copy contract, the measurable colour maths, and the source-level
 * invariants those surfaces rely on.
 */

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const portfolioSource = read('../../src/pages/Portfolio/Portfolio.tsx');
const portfolioCss = read('../../src/pages/Portfolio/Portfolio.css');
const pendingSource = read(
  '../../src/components/Transactions/PendingTransactionsTable.tsx',
);
const transactionsSource = read(
  '../../src/components/Transactions/Transactions.tsx',
);
const activityRowSource = read(
  '../../src/components/ActivityRow/ActivityRow.tsx',
);
const receiveSource = read('../../src/components/Receive/Receive.tsx');
const tokenBoxSource = read('../../src/components/TokensEVM/TokenBox.tsx');

// WCAG 2.1 relative luminance + contrast ratio (sRGB, 8-bit hex).
const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string) =>
  0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
  0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
  0.0722 * channel(parseInt(hex.slice(5, 7), 16));

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Page backgrounds, index.css :root[data-theme=…]
const LIGHT_BG = '#fafaf9';
const DARK_BG = '#0c0a09';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Declarations of `property` inside the rule(s) with exactly this selector. */
const declared = (css: string, selector: string, property: string) => {
  const rules = css.matchAll(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'g'),
  );
  const values: string[] = [];
  for (const rule of rules) {
    const found = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`).exec(
      rule[1],
    );
    if (found) values.push(found[1].trim());
  }
  return values;
};

describe('wallet/portfolio copy contract (en)', () => {
  it('spells synchronize/organization one way (-ize, as the rest of SSP does)', () => {
    const values = JSON.stringify(home);
    expect(values).not.toMatch(/synchronis/i);
    expect(values).not.toMatch(/organis/i);
    expect(home.key.err_sync_fail).toContain('Synchronization failed');
    expect(home.enterpriseVaultXpub.org_name).toBe('Organization');
    expect(home.enterpriseVaultSignTx.org_name).toBe('Organization');
  });

  it('never tells the user to "re-pair" — nothing in the UI is called Pair', () => {
    expect(JSON.stringify(home)).not.toMatch(/re-pair/i);
    // the chain-verification gate points back at the sync flow it came from
    expect(home.key.verify_words_body).toContain('start the sync again');
    expect(home.key.verify_mismatch_warning).toContain('start the sync again');
  });

  it('keeps "pairing" for WalletConnect sessions only', () => {
    // the SSP Key sync flow speaks of syncing, never of pairing
    expect(JSON.stringify(home.key).toLowerCase()).not.toContain('pair');
    expect(JSON.stringify(home.walletconnect).toLowerCase()).toContain(
      'pairing',
    );
  });

  it('has copy for both new portfolio states', () => {
    expect(home.portfolio.activating).toBe('Activating…');
    expect(home.portfolio.refresh_failed).toBe(
      "Couldn't refresh — showing the last saved values.",
    );
    // reused by the Portfolio switch failure — same string as the switcher
    expect(home.chainSelect.unable_switch_chain).toBe(
      'Unable to switch chain.',
    );
  });
});

describe('Portfolio chain activation reports its state', () => {
  it('surfaces a failed switch instead of console.log only', () => {
    expect(portfolioSource).toContain(
      "displayMessage('error', t('home:chainSelect.unable_switch_chain'))",
    );
  });

  it('guards re-entrancy and marks the tapped row busy', () => {
    expect(portfolioSource).toContain('if (switching) return;');
    expect(portfolioSource).toContain('setSwitching(chain);');
    // both lists: every row inert while one switch runs
    expect(
      portfolioSource.match(/disabled=\{switching !== null\}/g),
    ).toHaveLength(2);
    expect(
      portfolioSource.match(/aria-busy=\{switching === c\.chain\}/g),
    ).toHaveLength(2);
    expect(portfolioSource).toContain("t('home:portfolio.activating'");
  });

  it('tells the user when a manual refresh failed', () => {
    expect(portfolioSource).toContain("'home:portfolio.refresh_failed'");
    // load() now reports its outcome instead of swallowing it
    expect(portfolioSource).toContain('Promise<boolean>');
  });

  it('uses the same refresh glyph and spin as the Activity tab', () => {
    expect(portfolioSource).toContain('RotateCw as RotateCwIcon');
    expect(portfolioSource).not.toContain('RefreshCw');
    expect(portfolioSource).toContain(
      "className={refreshing ? 'lucide-spin' : ''}",
    );
    // the bespoke half-opacity treatment and keyframes are gone
    expect(portfolioCss).not.toContain('portfolio-spin');
    expect(declared(portfolioCss, '.portfolio-refresh', 'opacity')).toEqual([]);
  });
});

describe('Portfolio "not yet activated" rows clear AA in both themes', () => {
  it('does not stack a row opacity on top of the sub-line opacity', () => {
    expect(portfolioCss).not.toMatch(
      /\.portfolio-row-inactive\s*\{[^}]*opacity/,
    );
    // only the logo is dimmed
    expect(
      declared(portfolioCss, '.portfolio-row-inactive .ant-image', 'opacity'),
    ).toEqual(['0.6']);
    expect(
      declared(
        portfolioCss,
        '.portfolio-row-inactive .portfolio-row-crypto',
        'opacity',
      ),
    ).toEqual(['1']);
  });

  it('gives the name and the activation hint explicit per-theme colours', () => {
    const [hintLight] = declared(
      portfolioCss,
      '.portfolio-row-inactive .portfolio-row-crypto',
      'color',
    );
    const [nameLight] = declared(
      portfolioCss,
      '.portfolio-row-inactive .portfolio-row-name',
      'color',
    );
    const [hintDark] = declared(
      portfolioCss,
      ":root[data-theme='dark'] .portfolio-row-inactive .portfolio-row-crypto",
      'color',
    );
    const [nameDark] = declared(
      portfolioCss,
      ":root[data-theme='dark'] .portfolio-row-inactive .portfolio-row-name",
      'color',
    );

    expect(contrast(hintLight, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(nameLight, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hintDark, DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(nameDark, DARK_BG)).toBeGreaterThanOrEqual(4.5);

    // documented ratios (the pre-fix composite was 2.25:1 for the hint)
    expect(contrast(hintLight, LIGHT_BG).toFixed(2)).toBe('5.43');
    expect(contrast(nameLight, LIGHT_BG).toFixed(2)).toBe('9.84');
    expect(contrast(hintDark, DARK_BG).toFixed(2)).toBe('7.83');
    expect(contrast(nameDark, DARK_BG).toFixed(2)).toBe('13.26');
  });

  it('aligns row content with the page gutter without shrinking the target', () => {
    expect(declared(portfolioCss, '.portfolio-row', 'margin')).toEqual([
      '0 -10px',
    ]);
    expect(declared(portfolioCss, '.portfolio-row', 'width')).toEqual([
      'calc(100% + 20px)',
    ]);
    expect(declared(portfolioCss, '.portfolio-row', 'padding')).toEqual([
      '10px',
    ]);
    // section title shares the same gutter as the title/total/allocation bar
    expect(
      declared(portfolioCss, '.portfolio-section-title', 'margin'),
    ).toEqual(['16px 0 6px']);
  });
});

describe('pending approval rows', () => {
  it('does not mirror props into state behind a dependency-less effect', () => {
    expect(pendingSource).not.toContain('useEffect');
    expect(pendingSource).not.toContain('useState<pendingTransaction[]>');
    // rendered straight from the props the parent owns
    expect(pendingSource).toContain('props.transactions.filter(');
    expect(pendingSource).toContain('props.fiatRate');
  });

  it('drops an expired approval for good instead of resetting local state', () => {
    expect(pendingSource).toContain('onFinishCountDown(record.expireAt)');
    expect(pendingSource).toContain(
      '(record) => !expiredKeys.includes(record.expireAt)',
    );
  });

  it('names the countdown for assistive tech', () => {
    expect(pendingSource).toContain('role="timer"');
    expect(pendingSource).toContain(
      "aria-label={t('home:transactionsTable.tx_pending')}",
    );
  });
});

describe('Home activity sub-tab', () => {
  it('shows a skeleton before its first read, not "no transaction history"', () => {
    expect(transactionsSource).toContain('const [loading, setLoading]');
    expect(transactionsSource).toContain('{loading && txs.length === 0 ? (');
    expect(transactionsSource).toContain(
      '<Skeleton active paragraph={{ rows: 5 }} title={false} />',
    );
    // settles from the cache read and from the live fetch, either outcome
    expect(transactionsSource.match(/setLoading\(false\)/g)?.length).toBe(3);
  });
});

describe('activity row status is in the accessible tree', () => {
  it('labels the confirmed/unconfirmed chip, not just the tooltip', () => {
    expect(activityRowSource).toContain('role="img"');
    expect(activityRowSource).toContain('aria-label={statusLabel}');
    expect(activityRowSource).toContain('<Tooltip title={statusLabel}>');
  });
});

describe('Receive modal never clips the network disclaimer', () => {
  it('fits the QR to the scrollable body instead of overflowing it', () => {
    expect(receiveSource).toContain('const QR_MAX_SIZE = 232;');
    expect(receiveSource).toContain('const QR_MIN_SIZE = 160;');
    expect(receiveSource).toContain('size={qrSize}');
    expect(receiveSource).toContain("closest('.ant-modal-body')");
    expect(receiveSource).toContain(
      'Math.max(QR_MIN_SIZE, Math.min(QR_MAX_SIZE, Math.floor(available))),',
    );
  });
});

describe('token rows', () => {
  it('does not badge a chain logo onto that chain native asset', () => {
    expect(tokenBoxSource).toMatch(
      /\{props\.tokenInfo\.contract && \(\s*<img\s*className="token-row-logo-badge"/,
    );
  });
});
