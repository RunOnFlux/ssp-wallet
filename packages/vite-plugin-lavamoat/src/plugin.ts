/**
 * vite-plugin-lavamoat (SSP Wallet, in-repo)
 *
 * What this plugin enforces, precisely:
 *
 * 1. Runtime: SES `lockdown()` runs before any bundle code on every HTML
 *    entry (popup, side panel, full-tab window, camera-permission page). All
 *    JavaScript intrinsics are frozen, `harden()` is available, and
 *    eval/Function are disabled (SES `no-eval`, on top of the MV3 CSP).
 *
 * 2. Build time: the LavaMoat policy (`resources[pkg].globals|packages`) is
 *    derived from the real module graph with LavaMoat's own analyser and
 *    compared against the committed, reviewed policy. A dependency that
 *    starts touching a new global (fetch, chrome, localStorage, crypto, ...)
 *    or importing a new package fails the build until the policy diff is
 *    reviewed and committed (`yarn generate-policy`).
 *
 * What it does NOT do: per-package Compartments at runtime. Rollup
 * scope-hoists ES modules into shared chunk scopes and MV3 forbids eval, so
 * modules cannot be re-evaluated inside Compartments. A malicious package
 * that reaches a global dynamically (e.g. `globalThis[atob('...')]`) is not
 * stopped by this plugin; the static policy check only flags the access
 * patterns LavaMoat's analyser can see. See README.md.
 */

import type { Plugin, ResolvedConfig } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  DEFAULT_LOCKDOWN_OPTIONS,
  generateLockdownRuntime,
  readSesShim,
  validateLockdownOptions,
  type SesLockdownOptions,
} from './lockdownRuntime';
import { observePolicy, type GraphModule } from './observe';
import {
  findPolicyViolations,
  findStaleResources,
  formatViolations,
  stringifyPolicy,
  validatePolicy,
  type LavaMoatPolicy,
} from './policy';

export type PolicyMode = 'check' | 'write' | 'off';

export interface ViteLavaMoatOptions {
  /** Committed policy, relative to the Vite root. */
  policyPath?: string;
  /**
   * 'check' (default): fail the build when the bundle needs anything the
   * committed policy does not grant. 'write': regenerate the committed policy
   * from the bundle for review. 'off': skip the policy step.
   * The env var LAVAMOAT_POLICY_MODE overrides this.
   */
  policyMode?: PolicyMode;
  /** Inject SES lockdown into every HTML entry. Default true. */
  lockdown?: boolean;
  /** SES lockdown() options. Defaults: DEFAULT_LOCKDOWN_OPTIONS. */
  lockdownOptions?: SesLockdownOptions;
  /** File name of the emitted lockdown script. */
  lockdownFileName?: string;
  /** Print policy statistics. */
  verbose?: boolean;
}

const POLICY_MODES: readonly PolicyMode[] = ['check', 'write', 'off'];

export function resolvePolicyMode(
  option: PolicyMode | undefined,
  env: string | undefined,
): PolicyMode {
  const fromEnv = env?.trim();
  if (fromEnv) {
    if (!POLICY_MODES.includes(fromEnv as PolicyMode)) {
      throw new Error(
        `vite-plugin-lavamoat: LAVAMOAT_POLICY_MODE must be one of ${POLICY_MODES.join(', ')}`,
      );
    }
    return fromEnv as PolicyMode;
  }
  return option ?? 'check';
}

/** The `<script>` that must be the first thing every page runs. */
export function lockdownScriptTag(fileName: string) {
  return {
    tag: 'script',
    attrs: { src: fileName },
    injectTo: 'head-prepend' as const,
  };
}

export function viteLavaMoat(options: ViteLavaMoatOptions = {}): Plugin {
  const policyPath = options.policyPath ?? './lavamoat-policy.json';
  const lockdownEnabled = options.lockdown ?? true;
  const lockdownOptions = options.lockdownOptions ?? DEFAULT_LOCKDOWN_OPTIONS;
  const lockdownFileName = options.lockdownFileName ?? 'lavamoat-lockdown.js';
  const policyMode = resolvePolicyMode(
    options.policyMode,
    process.env.LAVAMOAT_POLICY_MODE,
  );
  validateLockdownOptions(lockdownOptions);

  let config: ResolvedConfig;

  return {
    name: 'vite-plugin-lavamoat',
    apply: 'build',

    config(userConfig) {
      // Tree-shaking settings this bundle has always been built and tested
      // with. Kept unchanged so adopting real lockdown does not also change
      // which module side effects survive.
      userConfig.build = userConfig.build || {};
      userConfig.build.target = userConfig.build.target || 'es2020';
      userConfig.build.rollupOptions = userConfig.build.rollupOptions || {};
      userConfig.build.rollupOptions.treeshake = {
        moduleSideEffects: true,
        propertyReadSideEffects: true,
        annotations: false,
      };
    },

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    buildEnd(error) {
      if (error || policyMode === 'off') return;

      const modules: GraphModule[] = [];
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id);
        if (!info) continue;
        modules.push({
          id,
          code: info.code,
          importedIds: info.importedIds,
          dynamicallyImportedIds: info.dynamicallyImportedIds,
        });
      }
      const observed = observePolicy(modules);
      const absPolicyPath = resolve(config.root, policyPath);
      const shownPath = relative(config.root, absPolicyPath);

      if (options.verbose) {
        this.info(
          `LavaMoat: inspected ${observed.modulesInspected} dependency modules, ` +
            `${Object.keys(observed.policy.resources).length} packages`,
        );
        const incompatible = Object.entries(observed.sesIncompatible);
        if (incompatible.length) {
          this.info(
            `LavaMoat: packages that assign to primordials (check under SES): ${incompatible
              .map(([name, n]) => `${name} (${n})`)
              .join(', ')}`,
          );
        }
      }

      if (policyMode === 'write') {
        mkdirSync(dirname(absPolicyPath), { recursive: true });
        writeFileSync(absPolicyPath, stringifyPolicy(observed.policy));
        this.info(
          `LavaMoat: wrote ${shownPath}. Review the diff before committing it.`,
        );
        return;
      }

      if (!existsSync(absPolicyPath)) {
        this.error(
          `LavaMoat: committed policy ${shownPath} is missing. Run "yarn generate-policy", review it and commit it.`,
        );
      }
      let committed: unknown;
      try {
        committed = JSON.parse(readFileSync(absPolicyPath, 'utf8'));
      } catch (e) {
        this.error(
          `LavaMoat: ${shownPath} is not valid JSON: ${(e as Error).message}`,
        );
      }
      if (!validatePolicy(committed)) {
        this.error(`LavaMoat: ${shownPath} is not a valid LavaMoat policy`);
      }
      const committedPolicy = committed as LavaMoatPolicy;
      const violations = findPolicyViolations(observed.policy, committedPolicy);
      if (violations.length) {
        this.error(
          `LavaMoat: the bundle needs ${violations.length} permission(s) that ${shownPath} does not grant:\n` +
            `${formatViolations(violations)}\n` +
            'If these come from a reviewed dependency change, run "yarn generate-policy" and commit the reviewed policy diff.',
        );
      }
      const stale = findStaleResources(observed.policy, committedPolicy);
      if (stale.length && options.verbose) {
        this.info(
          `LavaMoat: ${stale.length} policy entries are no longer used (run "yarn generate-policy" to prune): ${stale.join(', ')}`,
        );
      }
    },

    generateBundle() {
      if (!lockdownEnabled) return;
      const shim = readSesShim();
      this.emitFile({
        type: 'asset',
        fileName: lockdownFileName,
        source: generateLockdownRuntime(shim, lockdownOptions),
      });
    },

    transformIndexHtml(html) {
      if (!lockdownEnabled) return html;
      return { html, tags: [lockdownScriptTag(lockdownFileName)] };
    },
  };
}
