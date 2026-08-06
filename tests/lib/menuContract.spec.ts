import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { getDefaultEnterpriseNotificationPreferences } from '../../src/storage/ssp';

/**
 * Contract for the wallet Menu, chrome CSS and language picker.
 *
 * The enterprise-notification defaults are plain logic and tested as such. The
 * rest lives in JSX option tables and stylesheets, which this repo has no DOM
 * or layout harness for, so they are pinned at the source level: each assertion
 * names the exact declaration the behaviour depends on.
 */

const read = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

describe('batch E — enterprise notification defaults', () => {
  it('leaves marketing OFF and every wallet alert ON', () => {
    // Marketing was defaulted to true and POSTed verbatim on subscribe while
    // nothing in the UI disclosed it, and the only way off it was a full
    // unsubscribe (a fresh 2-of-2 signature that also killed the alerts the
    // user wanted).
    expect(getDefaultEnterpriseNotificationPreferences()).toEqual({
      incomingTx: true,
      outgoingTx: true,
      largeTransactions: true,
      lowBalance: true,
      weeklyReport: true,
      marketing: false,
    });
  });

  it('hands back a fresh object each call so callers cannot mutate the defaults', () => {
    const first = getDefaultEnterpriseNotificationPreferences();
    first.marketing = true;
    expect(getDefaultEnterpriseNotificationPreferences().marketing).toBe(false);
  });

  it('offers a switch for every preference key', () => {
    const settings = read('components/Settings/Settings.tsx');
    for (const key of Object.keys(
      getDefaultEnterpriseNotificationPreferences(),
    )) {
      expect(settings).toContain(`key: '${key}'`);
    }
    expect(settings).toContain('preferences: preferencesPayload');
  });

  it('keeps preferences editable after subscribing via a partial-diff save', () => {
    // Before this existed, the switches only rendered in the NOT-subscribed
    // branch — the only way to change a preference post-subscribe was a full
    // unsubscribe/resubscribe (two fresh 2-of-2 signatures).
    const settings = read('components/Settings/Settings.tsx');
    expect(settings).toContain('/v1/enterprise/preferences');
    expect(settings).toContain('buildEnterprisePreferenceDiff');
    expect(settings).toContain('minTxNotificationUsd');
  });

  it('login chain-sync re-subscribe omits preferences so stored choices survive', () => {
    // The server preserves stored preferences when the field is absent; this
    // hook used to re-POST all-on defaults over choices made in Settings or
    // the SSP Enterprise app whenever it back-filled missing chain xpubs.
    const hook = read('hooks/useEnterpriseNotificationSync.ts');
    expect(hook).not.toContain('getDefaultEnterpriseNotificationPreferences');
    const payload = hook.slice(
      hook.indexOf('const subscribeData'),
      hook.indexOf('subscribeAuth'),
    );
    expect(payload.length).toBeGreaterThan(0);
    expect(payload).not.toContain('preferences:');
  });
});

describe('batch E — language picker labels', () => {
  const selector = read('components/LanguageSelector/LanguageSelector.tsx');

  it('labels every language with its endonym, never an English exonym', () => {
    const endonyms: Record<string, string> = {
      nl: 'Nederlands',
      no: 'Norsk',
      pl: 'Polski',
      ro: 'Română',
      sk: 'Slovenčina',
      sv: 'Svenska',
    };
    for (const [code, endonym] of Object.entries(endonyms)) {
      expect(selector).toContain(
        `{ value: '${code}', label: '${code}', desc: '${endonym}' }`,
      );
    }
    for (const exonym of [
      'Dutch',
      'Norwegian',
      'Polish',
      'Romanian',
      'Slovak',
      'Swedish',
    ]) {
      expect(selector).not.toContain(`desc: '${exonym}'`);
    }
  });

  it('writes Traditional Chinese in traditional characters', () => {
    // 繁体 uses the SIMPLIFIED form of 體 — the one script distinction that
    // defines that entry.
    expect(selector).toContain("desc: '繁體中文'");
    expect(selector).not.toContain('繁体中文');
  });
});

describe('batch E — chrome stylesheets', () => {
  it('hides the Windows/Linux scrollbar with declarations that apply', () => {
    const css = read('scrollbar.css');
    // scrollbar-width belongs on the scroll container; on the
    // ::-webkit-scrollbar pseudo-element it is inert.
    expect(css).not.toMatch(
      /::-webkit-scrollbar\s*\{[^}]*scrollbar-width[^}]*\}/,
    );
    expect(css).toMatch(/\*\s*\{[^}]*scrollbar-width:\s*none/);
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });

  it('pins the side-panel identity bar like the nav rail', () => {
    const css = read('components/IdentityBar/IdentityBar.css');
    const panelBlock = css.slice(css.indexOf('body.extension-sidepanel'));
    expect(panelBlock).toMatch(/position:\s*sticky/);
    expect(panelBlock).toMatch(/top:\s*0/);
    // Opaque, per theme — content scrolls underneath, never through.
    expect(panelBlock).toMatch(/background:\s*#fafaf9/);
    expect(panelBlock).toMatch(/background:\s*#0c0a09/);
  });

  it('guards the identity bar transitions for reduced motion', () => {
    const css = read('components/IdentityBar/IdentityBar.css');
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('lets a long localized rail label ellipsis inside the 128px rail', () => {
    const css = read('components/TabBar/TabBar.css');
    const label = css.slice(
      css.indexOf('body.extension-sidepanel .tab-bar-label'),
    );
    const rule = label.slice(0, label.indexOf('}'));
    expect(rule).toMatch(/min-width:\s*0/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });
});

describe('batch E — help affordances are keyboard reachable', () => {
  const settings = read('components/Settings/Settings.tsx');

  it('never hangs a tooltip off a bare lucide <svg>', () => {
    // An <svg> has no tabIndex, so antd's focus trigger never fires on it.
    expect(settings).not.toMatch(/<Tooltip[^>]*>\s*<CircleHelpIcon\s+style=/);
  });

  it('opens the row help on keyboard focus, not hover alone', () => {
    expect(settings).toContain("trigger={['hover', 'focus']}");
    expect(settings).toContain("trigger={['hover', 'focus', 'click']}");
  });
});
