/**
 * Vite Plugin LavaMoat - Main Entry Point
 *
 * This module exports the main plugin function and related types
 * for LavaMoat security integration with Vite.
 */

import { viteLavaMoat, type ViteLavaMoatOptions } from './plugin';

export {
  viteLavaMoat,
  viteLavaMoat as default,
  type ViteLavaMoatOptions,
} from './plugin';
export {
  initializeLockdown,
  scuttleGlobalThis,
  verifySecurityHardening,
  runSecurityTests,
  exposeSecurityGlobals,
  type LockdownOptions,
  type ScuttleOptions,
} from './lockdown';
export {
  createSecureCompartment,
  wrapModuleForCompartment,
  compartmentRegistry,
  CompartmentRegistry,
  type CompartmentOptions,
  type PolicyRule,
  type LavaMoatPolicy,
} from './compartment';
export {
  generatePolicy,
  loadPolicy,
  savePolicy,
  type PolicyGenerationOptions,
} from './buildtime/policyGenerator';
export {
  generateRuntimeCode,
  generateModuleWrapper,
  type RuntimeOptions,
} from './runtime/runtime';

// Re-export for convenience
export const lavamoat = viteLavaMoat;

// Version information
export const version = '1.0.0';
