# vite-plugin-lavamoat (SSP Wallet, in-repo)

A small, private Vite plugin used by the SSP Wallet browser extension build. It is
**not** the LavaMoat project's bundler plugin and it does **not** sandbox npm
packages. It does exactly two things, and this file says precisely what they
protect against and what they do not.

## 1. Runtime: SES `lockdown()` on every extension page

`generateBundle` emits `lavamoat-lockdown.js`, and `transformIndexHtml` injects it
as the first `<script>` of every HTML entry (`index.html` for popup, side panel and
full-tab window; `camera-permission.html`). It runs before any bundle code.

The file is the `ses` package's own `dist/lockdown.umd.min.js` (version and
sha256 recorded in its header), followed by one `lockdown()` call and a
fail-closed self-check: if the intrinsics are not frozen afterwards it calls
`window.stop()` and throws.

After it runs:

- every JavaScript intrinsic (`Object.prototype`, `Array.prototype`,
  `Function.prototype`, `Promise`, `JSON`, `Math`, `Reflect`, ...) is frozen, so a
  dependency cannot poison the primordials the signing code uses (prototype
  pollution, replacing `Array.prototype.map`, `JSON.parse`, `Promise.prototype.then`,
  and so on);
- `harden()` is available;
- `eval` and `Function` are disabled by SES (`evalTaming: 'no-eval'`), on top of
  the MV3 CSP that already forbids them.

Options (`DEFAULT_LOCKDOWN_OPTIONS` in `src/lockdownRuntime.ts`):
`overrideTaming: 'severe'`, `localeTaming: 'unsafe'` (the UI formats with
`toLocaleString`/`Intl`), `errorTaming`/`consoleTaming: 'unsafe'`,
`errorTrapping`/`unhandledRejectionTrapping: 'none'`, `reporting: 'none'`.

**One change to the SES source.** SES's `severe` override taming makes inherited
data properties on frozen prototypes overridable by assignment (the JS "override
mistake"). It covers all of `Object.prototype` but not `Function.prototype.call`/
`apply` or `Promise.prototype.then`/`catch`/`finally`. Bundled npm code assigns
those on ordinary objects (viem's `tempo` actions do `getUserToken.call = call`;
without the fix the popup crashed on load). `extendSevereEnablements()` adds those
five entries to SES's own enablement table. The prototypes stay frozen, and
assigning to the prototype itself still throws. The match is exact; an `ses`
upgrade that changes the table fails the build until this is reviewed.

`globalThis.__lavamoat_run_security_tests()` reports the real state (used by the
hidden Security Test page). It is defined non-writable and non-configurable.

## 2. Build time: the committed LavaMoat policy is enforced

In `buildEnd`, the plugin feeds every module of the Rollup graph (post-transform
code, real import edges) to LavaMoat's own analyser (`lavamoat-core`
`createModuleInspector`, i.e. lavamoat-tofu/Babel). The result is a LavaMoat
policy: per package, the globals it reads or writes and the packages it imports.
Packages are named by their `node_modules` location (`a>b` for nested copies).
First-party `src/` code is trusted and not part of the policy.

- `policyMode: 'check'` (default, used by `yarn build`): the build **fails** if the
  bundle needs anything `security/vite-lavamoat-policy.json` does not grant: a new
  package, a new global (`fetch`, `chrome.storage`, `localStorage`, `crypto.subtle`,
  ...), or a new package-to-package import. The policy file is never written.
- `policyMode: 'write'` (`yarn generate-policy`): regenerate the file from a
  production build without writing `dist/`. Review the diff, then commit it.
  Every added line is a new capability for that dependency.
- `LAVAMOAT_POLICY_MODE=check|write|off` overrides the option.

CI fails if the build fails or if the committed policy changed during the build.

## What is NOT enforced

- **No per-package compartments at runtime.** All npm packages run in the same
  realm as the wallet code that decrypts the seed, with the same globals
  (`chrome`, `fetch`, `localStorage`, ...). This is not fixable inside this plugin:
  Rollup scope-hoists ES modules into shared chunk scopes, so there is no
  per-module function boundary to evaluate inside a `Compartment`, and MV3
  forbids `eval`, which `Compartment.evaluate` needs. Real per-package isolation
  needs a bundler that wraps each module at build time (for example
  `@lavamoat/webpack`, as MetaMask uses), which means replacing Vite/Rollup.
- **The policy check is static analysis.** It sees direct references
  (`fetch(...)`, `window.chrome.storage`, `globalThis.localStorage`). It does not
  see computed access (`globalThis[atob('ZmV0Y2g=')]`) or code that reaches
  globals through objects it was handed. It turns "a dependency bump silently
  gains network or storage access" into a reviewable diff; it does not stop a
  deliberately obfuscated malicious package.
- **Not covered by lockdown:** `public/scripts/background.js` (service worker),
  `contentscript.js` and `inpage.js`. They are hand-written and import no npm
  packages. `inpage.js` runs in web pages, where lockdown must not run.
- **Exfiltration:** the extension CSP allows `connect-src 'self' https: wss:`
  because users can point the relay and every chain backend at their own hosts
  (Settings), so a fixed host list would break that feature. Plaintext `http:`/
  `ws:` connections are blocked; HTTPS to any host is not.

## Files

- `src/lockdownRuntime.ts`: reads the SES shim, builds `lavamoat-lockdown.js`.
- `src/observe.ts`: Rollup module graph → LavaMoat policy.
- `src/policy.ts`: policy model, coverage check, violations, deterministic JSON.
- `src/plugin.ts`: the Vite plugin.
- `bin/generate-policy.mjs`: `yarn generate-policy`.

Tests: `tests/lib/supplyChain.spec.ts` in the wallet (runs the generated lockdown
file in a fresh `vm` realm, checks policy enforcement, CSP and the committed policy).
