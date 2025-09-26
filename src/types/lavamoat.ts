/**
 * Type definitions for LavaMoat global APIs
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
  global_scuttling: boolean;
  policy_enforcement?: boolean;
}

export interface LavaMoatGlobals {
  __lavamoat_security_active?: boolean;
  __lavamoat_lockdown_enabled?: boolean;
  __lavamoat_enhanced_protection?: boolean;
  __lavamoat_version?: string;
  __lavamoat_protections?: LavaMoatProtections;
  __lavamoat_policy?: Record<string, unknown>;
  __lavamoat_verify_hardening?: () => LavaMoatTestResult[];
  __lavamoat_run_security_tests?: () => LavaMoatSecurityResult[];
  __lavamoat_enforceModulePolicy?: (
    moduleName: string,
    requiredPermissions: string[],
  ) => boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Window extends LavaMoatGlobals {}
}

export type SecurityTestFunction = () => LavaMoatSecurityResult[];
export type HardeningTestFunction = () => LavaMoatTestResult[];
