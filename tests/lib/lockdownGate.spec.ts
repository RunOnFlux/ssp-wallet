/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  LOCKDOWN_FAILURE_TITLE,
  isLockdownActive,
  renderLockdownFailure,
  shouldBlockStartup,
} from '../../src/lib/lockdownGate';

/**
 * WP12 follow-up: a production build must not mount the wallet when SES
 * lockdown did not run (lavamoat-lockdown.js missing, blocked or removed).
 */

const source = (relativePath: string): string =>
  // __dirname, not import.meta.url: under jsdom import.meta.url is not a
  // file: URL.
  readFileSync(resolve(__dirname, '../../src', relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('isLockdownActive', () => {
  it('is false in a realm where lockdown did not run', () => {
    expect(Object.isFrozen(Object.prototype)).toBe(false);
    expect(isLockdownActive()).toBe(false);
  });

  it('requires every intrinsic to be frozen', () => {
    const frozen = Object.freeze({});
    expect(isLockdownActive([frozen, Object.freeze({})])).toBe(true);
    expect(isLockdownActive([frozen, {}])).toBe(false);
  });
});

describe('shouldBlockStartup', () => {
  it('blocks a production build without lockdown', () => {
    expect(shouldBlockStartup(true, false)).toBe(true);
  });

  it('lets a production build with lockdown start', () => {
    expect(shouldBlockStartup(true, true)).toBe(false);
  });

  it('never blocks dev builds (the dev server runs without lockdown)', () => {
    expect(shouldBlockStartup(false, false)).toBe(false);
    expect(shouldBlockStartup(false, true)).toBe(false);
  });

  it('defaults to the live intrinsics, which are mutable in this test realm', () => {
    expect(shouldBlockStartup(true)).toBe(true);
    expect(shouldBlockStartup(false)).toBe(false);
  });
});

describe('renderLockdownFailure', () => {
  it('replaces the root with a static blocking alert', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p id="stale">app</p>';
    renderLockdownFailure(root);

    expect(root.querySelector('#stale')).toBeNull();
    const alert = root.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.querySelector('h1')?.textContent).toBe(
      LOCKDOWN_FAILURE_TITLE,
    );
    expect(alert?.textContent).toMatch(/do not enter your password/);
    // No buttons, inputs or links: nothing the user can continue with.
    expect(root.querySelectorAll('button, input, a, form')).toHaveLength(0);
  });
});

describe('main.tsx fails closed', () => {
  const main = source('main.tsx');

  it('gates the React mount on shouldBlockStartup(import.meta.env.PROD)', () => {
    const gate = main.indexOf('shouldBlockStartup(import.meta.env.PROD)');
    const mount = main.indexOf('ReactDOM.createRoot(');
    expect(gate).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(gate);
    // The only mount sits in the else branch of the gate.
    expect(main.match(/ReactDOM\.createRoot\(/g)).toHaveLength(1);
    const branch = main.slice(gate, mount);
    expect(branch).toContain('renderLockdownFailure(rootElement)');
    expect(branch).toMatch(/\}\s*else\s*\{\s*$/);
  });
});
