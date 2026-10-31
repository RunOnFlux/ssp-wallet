import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import {
  generateLockdownRuntime,
  readSesShim,
} from '../../packages/vite-plugin-lavamoat/src/lockdownRuntime';
import { isLockdownActive } from '../../src/lib/lockdownGate';
import { runSecuritySelfTest } from '../../src/lib/securitySelfTest';
import type { LavaMoatGlobals } from '../../src/types/lavamoat';

/**
 * The hidden /security-test page reports only what the build enforces (SES
 * lockdown via lavamoat-lockdown.js). It used to probe cosmetic monkeypatches
 * WP12 removed (document.write, WebAssembly size filter, setTimeout wrapper,
 * innerHTML filter) and so showed FAIL on a correctly locked-down build.
 */

const pluginDir = fileURLToPath(
  new URL('../../packages/vite-plugin-lavamoat/src', import.meta.url),
);
const now = () => '2026-10-12T00:00:00.000Z';

/** A fresh realm that ran the real generated lavamoat-lockdown.js. */
function lockedDownRealm() {
  const context = vm.createContext({});
  vm.runInContext(generateLockdownRuntime(readSesShim(pluginDir)), context);
  const run = <T>(src: string): T => vm.runInContext(src, context) as T;
  return {
    globals: run<LavaMoatGlobals>('globalThis'),
    lockdownActive: isLockdownActive(
      run<object[]>('[Object.prototype, Function.prototype, Array.prototype]'),
    ),
  };
}

describe('runSecuritySelfTest', () => {
  it('passes with no failures on a real lockdown realm', () => {
    const { globals, lockdownActive } = lockedDownRealm();
    expect(lockdownActive).toBe(true);

    const report = runSecuritySelfTest({
      globals,
      lockdownActive,
      isDevBuild: false,
      now,
    });

    expect(report.ok).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.results.filter((r) => r.type === 'fail')).toEqual([]);
    expect(report.passed).toBeGreaterThanOrEqual(4);
    const messages = report.results.map((r) => r.message).join('\n');
    expect(messages).toMatch(/Prototype pollution/);
    expect(messages).toMatch(/eval\(\) is blocked/);
    expect(messages).toMatch(/Lockdown runtime: ses-/);
  });

  it('fails a production build where lockdown did not run', () => {
    const report = runSecuritySelfTest({
      globals: {},
      lockdownActive: false,
      isDevBuild: false,
      now,
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toBe(2);
    expect(report.results.every((r) => r.type === 'fail')).toBe(true);
  });

  it('only warns on the dev server, but still never reports ok', () => {
    const report = runSecuritySelfTest({
      globals: {},
      lockdownActive: false,
      isDevBuild: true,
      now,
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toBe(0);
    expect(report.results.every((r) => r.type === 'warning')).toBe(true);
  });

  it('fails when the self-test is present but the intrinsics are not frozen', () => {
    const { globals } = lockedDownRealm();
    const report = runSecuritySelfTest({
      globals,
      lockdownActive: false,
      isDevBuild: false,
      now,
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toBe(1);
  });

  it('fails when the built-in self-test throws', () => {
    const report = runSecuritySelfTest({
      globals: {
        __lavamoat_run_security_tests: () => {
          throw new Error('boom');
        },
      },
      lockdownActive: true,
      isDevBuild: false,
      now,
    });
    expect(report.ok).toBe(false);
    expect(report.results.some((r) => /threw: boom/.test(r.message))).toBe(
      true,
    );
  });

  it('fails on a malformed built-in result', () => {
    const report = runSecuritySelfTest({
      globals: {
        __lavamoat_run_security_tests: () =>
          [{ type: 'ok', message: 1 }] as unknown as ReturnType<
            NonNullable<LavaMoatGlobals['__lavamoat_run_security_tests']>
          >,
      },
      lockdownActive: true,
      isDevBuild: false,
      now,
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toBe(1);
  });

  it('propagates a failure reported by the built-in self-test', () => {
    const report = runSecuritySelfTest({
      globals: {
        __lavamoat_run_security_tests: () => [
          { type: 'pass', message: 'lockdown', timestamp: now() },
          { type: 'fail', message: 'eval() is blocked', timestamp: now() },
        ],
      },
      lockdownActive: true,
      isDevBuild: false,
      now,
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toBe(1);
  });
});

describe('SecurityTest page', () => {
  const page = readFileSync(
    new URL('../../src/pages/SecurityTest/SecurityTest.tsx', import.meta.url),
    'utf8',
  );

  it('relies on the lockdown self-test, not removed monkeypatch probes', () => {
    expect(page).toContain('runSecuritySelfTest(');
    expect(page).toContain('isLockdownActive()');
    for (const stale of [
      'document.write',
      'WebAssembly',
      'innerHTML',
      'byteLength',
      'string code blocked by LavaMoat',
      '__maliciousFlag',
    ]) {
      expect(page).not.toContain(stale);
    }
  });
});
