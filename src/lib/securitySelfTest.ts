/**
 * Security self-test shown on the hidden diagnostics page (/security-test,
 * five clicks on the version number).
 *
 * The only source of truth is what the build really enforces: SES lockdown,
 * run by `lavamoat-lockdown.js` before any bundle code
 * (packages/vite-plugin-lavamoat). That script exposes a hardened
 * `__lavamoat_run_security_tests()` which probes the lockdown from inside the
 * page. This module calls it and adds one independent check (the intrinsics
 * are frozen). It does not probe or expect anything the build does not do
 * (document.write, WebAssembly or setTimeout wrappers, innerHTML filters, ...).
 */

import type {
  LavaMoatGlobals,
  LavaMoatSecurityResult,
} from '../types/lavamoat';

export type SecurityResultType = LavaMoatSecurityResult['type'];

export interface SecuritySelfTestInput {
  /** The page's global object (window). */
  globals: LavaMoatGlobals;
  /** Whether the intrinsics of that realm are frozen (lockdownGate). */
  lockdownActive: boolean;
  /** Dev server build: lockdown is not expected, so its absence only warns. */
  isDevBuild: boolean;
  /** Clock, injectable for tests. */
  now?: () => string;
}

export interface SecuritySelfTestReport {
  results: LavaMoatSecurityResult[];
  passed: number;
  failed: number;
  /** True only when lockdown ran and no check failed. */
  ok: boolean;
}

const RESULT_TYPES: readonly SecurityResultType[] = [
  'pass',
  'fail',
  'warning',
  'info',
];

function isSecurityResult(value: unknown): value is LavaMoatSecurityResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.message === 'string' &&
    RESULT_TYPES.includes(r.type as SecurityResultType)
  );
}

export function runSecuritySelfTest({
  globals,
  lockdownActive,
  isDevBuild,
  now = () => new Date().toISOString(),
}: SecuritySelfTestInput): SecuritySelfTestReport {
  const results: LavaMoatSecurityResult[] = [];
  const add = (type: SecurityResultType, message: string) => {
    results.push({ type, message, timestamp: now() });
  };

  const missingType: SecurityResultType = isDevBuild ? 'warning' : 'fail';

  add(
    lockdownActive ? 'pass' : missingType,
    lockdownActive
      ? 'JavaScript intrinsics are frozen (checked by this page)'
      : 'JavaScript intrinsics are NOT frozen: SES lockdown did not run',
  );

  const runBuiltIn = globals.__lavamoat_run_security_tests;
  if (typeof runBuiltIn !== 'function') {
    add(
      missingType,
      isDevBuild
        ? 'SES lockdown is not loaded. Expected on the development server; production builds always run it.'
        : 'SES lockdown self-test is missing: lavamoat-lockdown.js did not run',
    );
  } else {
    let builtIn: unknown;
    let threw = false;
    try {
      builtIn = runBuiltIn();
    } catch (error) {
      threw = true;
      add(
        'fail',
        `SES lockdown self-test threw: ${(error as Error)?.message ?? String(error)}`,
      );
    }
    if (!threw) {
      if (Array.isArray(builtIn) && builtIn.every(isSecurityResult)) {
        for (const r of builtIn) add(r.type, r.message);
      } else {
        add('fail', 'SES lockdown self-test returned an unexpected result');
      }
    }
  }

  if (typeof globals.__lavamoat_version === 'string') {
    add('info', `Lockdown runtime: ${globals.__lavamoat_version}`);
  }

  const passed = results.filter((r) => r.type === 'pass').length;
  const failed = results.filter((r) => r.type === 'fail').length;
  return {
    results,
    passed,
    failed,
    ok:
      lockdownActive &&
      typeof runBuiltIn === 'function' &&
      failed === 0 &&
      passed > 0,
  };
}
