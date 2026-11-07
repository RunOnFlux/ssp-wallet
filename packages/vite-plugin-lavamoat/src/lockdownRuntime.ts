/**
 * Builds `lavamoat-lockdown.js`, the first script every extension page runs.
 *
 * It is the SES (`ses` npm package) lockdown shim, copied verbatim from
 * `ses/dist/lockdown.umd.min.js`, followed by one real `lockdown()` call and a
 * fail-closed self-check. After it runs, every JavaScript intrinsic
 * (Object.prototype, Array.prototype, Function.prototype, Promise, JSON, Math,
 * Reflect, ...) is frozen, so no dependency loaded later can poison the
 * primordials that the signing code relies on.
 *
 * What it does NOT do: it does not put each npm package into its own
 * Compartment. See README.md in this package for why that is not possible
 * in an MV3 extension built with Vite/Rollup.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

/** Options handed to SES `lockdown()`. Only SES-supported keys. */
export interface SesLockdownOptions {
  errorTaming?: 'safe' | 'unsafe' | 'unsafe-debug';
  consoleTaming?: 'safe' | 'unsafe';
  stackFiltering?: 'concise' | 'omit-frames' | 'shorten-paths' | 'verbose';
  overrideTaming?: 'moderate' | 'min' | 'severe';
  localeTaming?: 'safe' | 'unsafe';
  regExpTaming?: 'safe' | 'unsafe';
  evalTaming?: 'safe-eval' | 'unsafe-eval' | 'no-eval';
  errorTrapping?: 'platform' | 'exit' | 'abort' | 'report' | 'none';
  unhandledRejectionTrapping?: 'report' | 'none';
  reporting?: 'platform' | 'console' | 'none';
  legacyRegeneratorRuntimeTaming?: 'safe' | 'unsafe-ignore';
}

/**
 * Defaults chosen for a browser-extension UI bundle full of npm code:
 * - overrideTaming 'severe': avoids the JS "override mistake" (assigning
 *   `Foo.prototype.toString = ...` throws once Object.prototype is frozen).
 *   MetaMask ships with the same setting.
 * - localeTaming 'unsafe': the UI formats amounts and dates with
 *   toLocaleString / Intl; 'safe' would silently replace them.
 * - evalTaming 'no-eval': the MV3 CSP forbids eval and new Function anyway;
 *   this makes the failure an explicit SES error instead of a CSP report.
 * - errorTaming/consoleTaming 'unsafe': keep normal stack traces and console
 *   (production builds strip console calls from app code).
 * - errorTrapping/unhandledRejectionTrapping 'none': do not install SES's
 *   global error handlers; the app keeps its own behaviour.
 * - reporting 'none': no "Removing unpermitted intrinsics" console noise.
 */
export const DEFAULT_LOCKDOWN_OPTIONS: Readonly<SesLockdownOptions> =
  Object.freeze({
    errorTaming: 'unsafe',
    consoleTaming: 'unsafe',
    stackFiltering: 'verbose',
    overrideTaming: 'severe',
    localeTaming: 'unsafe',
    evalTaming: 'no-eval',
    errorTrapping: 'none',
    unhandledRejectionTrapping: 'none',
    reporting: 'none',
    legacyRegeneratorRuntimeTaming: 'unsafe-ignore',
  });

const SUPPORTED_KEYS = new Set<string>([
  'errorTaming',
  'consoleTaming',
  'stackFiltering',
  'overrideTaming',
  'localeTaming',
  'regExpTaming',
  'evalTaming',
  'errorTrapping',
  'unhandledRejectionTrapping',
  'reporting',
  'legacyRegeneratorRuntimeTaming',
]);

export interface SesShim {
  /** Minified SES UMD source that defines globalThis.lockdown/harden. */
  source: string;
  /** Version of the `ses` package the shim was read from. */
  version: string;
  /** sha256 of `source`, recorded in the generated file header. */
  sha256: string;
}

/**
 * Read the SES lockdown shim from the installed `ses` package. `ses` does not
 * export its dist files, so resolve its package.json and go from there.
 */
export function readSesShim(fromDir: string = __dirname): SesShim {
  const req = createRequire(join(fromDir, 'noop.js'));
  const pkgJsonPath = req.resolve('ses/package.json');
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
    version: string;
  };
  const source = readFileSync(
    join(dirname(pkgJsonPath), 'dist', 'lockdown.umd.min.js'),
    'utf8',
  );
  if (!/\blockdown\b/.test(source) || !/\bharden\b/.test(source)) {
    throw new Error(
      'vite-plugin-lavamoat: ses/dist/lockdown.umd.min.js does not look like the SES lockdown shim',
    );
  }
  return {
    source,
    version: pkg.version,
    sha256: createHash('sha256').update(source).digest('hex'),
  };
}

/**
 * SES's `overrideTaming: 'severe'` turns selected data properties of frozen
 * prototypes into accessors so that `obj.prop = x` on an object that merely
 * INHERITS `prop` defines an own property instead of throwing (the JS
 * "override mistake"). It covers all of Object.prototype but only
 * constructor/bind/toString on Function.prototype and only constructor on
 * Promise.prototype.
 *
 * The bundled npm code also overrides these on ordinary objects:
 * - `fn.call = ...` on functions (viem `tempo` actions use TypeScript
 *   namespace merging: `getUserToken.call = call`), which made the popup
 *   crash on load under lockdown;
 * - `promise.then = ...` on Promise instances.
 *
 * We extend SES's own severe enablement table for exactly those properties.
 * This uses SES's sanctioned mechanism: the conversion happens after SES's
 * permit check and the intrinsics stay frozen; assigning to the prototype
 * itself still throws. The match must be exact: an SES upgrade that changes
 * this table fails the build so the patch is reviewed again.
 */
export const SEVERE_ENABLEMENTS_ORIGINAL =
  'severeEnablements={...moderateEnablements,"%ObjectPrototype%":"*","%TypedArrayPrototype%":"*","%MapPrototype%":"*","%SetPrototype%":"*"}';
export const SEVERE_ENABLEMENTS_EXTENDED =
  'severeEnablements={...moderateEnablements,"%ObjectPrototype%":"*","%TypedArrayPrototype%":"*","%MapPrototype%":"*","%SetPrototype%":"*",' +
  '"%FunctionPrototype%":{constructor:!0,bind:!0,toString:!0,call:!0,apply:!0},' +
  '"%PromisePrototype%":{constructor:!0,then:!0,catch:!0,finally:!0}}';

export function extendSevereEnablements(source: string): string {
  const occurrences = source.split(SEVERE_ENABLEMENTS_ORIGINAL).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `vite-plugin-lavamoat: expected exactly one SES severeEnablements table, found ${occurrences}. ` +
        'The ses package changed; review extendSevereEnablements() before upgrading.',
    );
  }
  return source.replace(
    SEVERE_ENABLEMENTS_ORIGINAL,
    SEVERE_ENABLEMENTS_EXTENDED,
  );
}

/** Reject option keys SES would reject at runtime, at build time instead. */
export function validateLockdownOptions(options: SesLockdownOptions): void {
  for (const key of Object.keys(options)) {
    if (!SUPPORTED_KEYS.has(key)) {
      throw new Error(
        `vite-plugin-lavamoat: unsupported SES lockdown option "${key}"`,
      );
    }
  }
}

/**
 * Generate the full text of `lavamoat-lockdown.js`.
 *
 * The self-check after `lockdown()` fails closed: if the intrinsics are not
 * frozen it stops the page from loading any further script (window.stop) and
 * throws, so the wallet UI never runs without the lockdown it expects.
 */
export function generateLockdownRuntime(
  shim: SesShim,
  options: SesLockdownOptions = DEFAULT_LOCKDOWN_OPTIONS,
): string {
  validateLockdownOptions(options);
  const opts = JSON.stringify(options);
  const source =
    options.overrideTaming === 'severe'
      ? extendSevereEnablements(shim.source)
      : shim.source;
  return `/*! SSP Wallet lockdown: SES ${shim.version} lockdown.umd.min.js sha256:${shim.sha256} (Apache-2.0, https://github.com/endojs/endo).
 * Only change to the SES source: severe override enablements extended with
 * Function.prototype.call/apply and Promise.prototype.then/catch/finally
 * (see extendSevereEnablements in packages/vite-plugin-lavamoat). */
${source}
;(function () {
  'use strict';
  var fail = function (reason) {
    try {
      if (typeof window !== 'undefined' && typeof window.stop === 'function') {
        window.stop();
      }
    } catch (_e) {
      /* ignore */
    }
    throw new Error('SSP lockdown failed: ' + reason);
  };
  if (typeof lockdown !== 'function') {
    fail('SES shim did not define lockdown()');
  }
  try {
    lockdown(${opts});
  } catch (e) {
    fail(String(e && e.message ? e.message : e));
  }
  var mustBeFrozen = [
    Object,
    Object.prototype,
    Array.prototype,
    Function.prototype,
    Promise.prototype,
    String.prototype,
    JSON,
    Math,
    Reflect,
  ];
  for (var i = 0; i < mustBeFrozen.length; i += 1) {
    if (!Object.isFrozen(mustBeFrozen[i])) {
      fail('intrinsic #' + i + ' is not frozen');
    }
  }
  if (typeof harden !== 'function') {
    fail('harden() is missing after lockdown');
  }

  var now = function () {
    return new Date().toISOString();
  };
  var blocked = function (fn) {
    try {
      fn();
      return false;
    } catch (_e) {
      return true;
    }
  };
  var protections = harden({
    eval_blocked: blocked(function () {
      return (0, eval)('1');
    }),
    function_constructor_blocked: blocked(function () {
      return new Function('return 1')();
    }),
    prototypes_frozen: true,
    global_scuttling: false,
    policy_enforcement: false,
  });
  var runSecurityTests = harden(function () {
    var r = [];
    var add = function (type, message) {
      r.push({ type: type, message: message, timestamp: now() });
    };
    add('pass', 'SES ${shim.version} lockdown() applied: JavaScript intrinsics are frozen');
    add(
      blocked(function () {
        Object.prototype.__ssp_pollution_probe = 1;
      }) && !('__ssp_pollution_probe' in {})
        ? 'pass'
        : 'fail',
      'Prototype pollution of Object.prototype is blocked',
    );
    add(
      protections.eval_blocked ? 'pass' : 'fail',
      'eval() is blocked (SES no-eval + MV3 CSP)',
    );
    add(
      protections.function_constructor_blocked ? 'pass' : 'fail',
      'Function constructor is blocked (SES no-eval + MV3 CSP)',
    );
    add(
      'info',
      'Per-package compartments are NOT enforced at runtime. The LavaMoat policy is checked at build time only (static analysis).',
    );
    return r;
  });
  var verifyHardening = harden(function () {
    return [
      { name: 'lockdown', status: 'PASS', message: 'SES lockdown applied' },
      {
        name: 'eval',
        status: protections.eval_blocked ? 'PASS' : 'FAIL',
        message: 'eval() blocked',
      },
      {
        name: 'Function',
        status: protections.function_constructor_blocked ? 'PASS' : 'FAIL',
        message: 'Function constructor blocked',
      },
    ];
  });
  var expose = function (name, value) {
    Object.defineProperty(globalThis, name, {
      value: value,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  };
  expose('__lavamoat_security_active', true);
  expose('__lavamoat_lockdown_enabled', true);
  expose('__lavamoat_version', 'ses-${shim.version}');
  expose('__lavamoat_protections', protections);
  expose('__lavamoat_run_security_tests', runSecurityTests);
  expose('__lavamoat_verify_hardening', verifyHardening);
})();
`;
}
