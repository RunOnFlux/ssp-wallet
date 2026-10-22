/**
 * vite-plugin-lavamoat: SES lockdown for every page plus a build-time
 * LavaMoat policy check. See README.md for what is and is not enforced.
 */

export {
  viteLavaMoat,
  viteLavaMoat as default,
  resolvePolicyMode,
  lockdownScriptTag,
  type PolicyMode,
  type ViteLavaMoatOptions,
} from './plugin';
export {
  DEFAULT_LOCKDOWN_OPTIONS,
  extendSevereEnablements,
  generateLockdownRuntime,
  readSesShim,
  validateLockdownOptions,
  type SesLockdownOptions,
  type SesShim,
} from './lockdownRuntime';
export {
  observePolicy,
  type GraphModule,
  type ObservedPolicy,
} from './observe';
export {
  cleanModuleId,
  findPolicyViolations,
  findStaleResources,
  formatViolations,
  isGlobalCovered,
  packageNameFromPath,
  stringifyPolicy,
  validatePolicy,
  type GlobalPermission,
  type LavaMoatPolicy,
  type PolicyViolation,
  type ResourcePolicy,
} from './policy';
