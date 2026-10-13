/**
 * Globals exposed by `lavamoat-lockdown.js`, the SES lockdown script that
 * production builds run before any bundle code
 * (packages/vite-plugin-lavamoat/src/lockdownRuntime.ts). They are defined
 * non-writable and non-configurable, and are absent on the dev server.
 */

export interface LavaMoatTestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  message: string;
}

export interface LavaMoatSecurityResult {
  message: string;
  type: 'pass' | 'fail' | 'warning' | 'info';
  timestamp: string;
}

export interface LavaMoatProtections {
  eval_blocked: boolean;
  function_constructor_blocked: boolean;
  prototypes_frozen: boolean;
  /** Always false: there is no global scuttling. */
  global_scuttling: boolean;
  /** Always false: the policy is checked at build time only. */
  policy_enforcement: boolean;
}

export interface LavaMoatGlobals {
  readonly __lavamoat_security_active?: boolean;
  readonly __lavamoat_lockdown_enabled?: boolean;
  readonly __lavamoat_version?: string;
  readonly __lavamoat_protections?: LavaMoatProtections;
  readonly __lavamoat_verify_hardening?: () => LavaMoatTestResult[];
  readonly __lavamoat_run_security_tests?: () => LavaMoatSecurityResult[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Window extends LavaMoatGlobals {}
}
