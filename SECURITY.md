# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability
reporting for this repository (Security tab → "Report a vulnerability"). Do not
open a public issue for a security problem.

## Supply chain

SSP Wallet's extension UI bundles several hundred npm packages. This section
states what the build enforces and what it does not.

### Enforced

| Control | Where | What it guarantees |
|---|---|---|
| SES `lockdown()` | `lavamoat-lockdown.js`, first script on every extension page | All JavaScript intrinsics are frozen before any dependency loads: no prototype pollution, no replacing built-ins such as `JSON.parse` or `Promise.prototype.then`. `eval`/`Function` are disabled. The page stops loading if lockdown did not apply. |
| LavaMoat policy check | `security/vite-lavamoat-policy.json`, checked by every `yarn build` | The policy is generated from the real bundle by LavaMoat's analyser: per package, the globals it uses and the packages it imports. The build fails if a dependency starts using a global or package that the committed policy does not grant. Changes need `yarn generate-policy` plus a reviewed diff. |
| No install scripts | `.yarnrc` (`ignore-scripts true`), `package.json` `lavamoat.allowScripts`, `yarn setup` | Dependency install scripts never run. `yarn setup` (@lavamoat/allow-scripts) runs only the allowlisted ones: today only the root `postinstall` (patch-package and the local plugin build). An unconfigured install script fails `yarn setup`. |
| Exact versions, frozen lockfile | `package.json`, `yarn.lock`, CI `--frozen-lockfile` | CI and release builds install exactly what `yarn.lock` lists. |
| Extension CSP | `public/manifest.json` | `script-src 'self' 'wasm-unsafe-eval'` (no remote or inline script, no eval). `connect-src 'self' https: wss:`: no plaintext `http:`/`ws:` connections. |
| Pinned CI | `.github/workflows` | Actions pinned by commit SHA, least-privilege `permissions:`, user input passed via `env:`. Releases run behind the `release` environment. |

### Not enforced (known limits)

- **No per-package compartments.** Every npm package in the UI bundle runs in
  the same JavaScript realm as the code that decrypts the seed, with the same
  globals (`chrome`, `fetch`, storage). A malicious version of a dependency can
  read secrets in memory. The Vite/Rollup bundle has no per-module boundary to
  isolate, and MV3 forbids the `eval` that runtime Compartments need. Real
  isolation would require a bundler that wraps each module at build time (for
  example `@lavamoat/webpack`).
- **The policy check is static analysis.** It catches direct new uses of
  globals. It does not catch computed access such as
  `globalThis[atob('...')]`.
- **`connect-src` allows any HTTPS host.** The relay and every chain backend
  are user-configurable in Settings, so the CSP cannot list fixed hosts.
  Default hosts: `relay.sspwallet.io`, `*.sspwallet.io` chain backends,
  `abe.zelcore.io` (swaps), `fusion.runonflux.io`, `api.runonflux.io`,
  `storage.runonflux.io` (Flux nodes), `api.devnet.solana.com` (devnet), and
  WalletConnect (`wss://relay.walletconnect.org`, `verify.walletconnect.org`,
  `verify.walletconnect.com`, `pulse.walletconnect.org`). If custom hosts are
  ever dropped, `connect-src` should be narrowed to exactly this list.
- **Not locked down:** the service worker (`scripts/background.js`) and the
  content/inpage scripts. They are hand-written and import no npm packages;
  lockdown must not run inside web pages.

## Data at rest

The seed and extended private keys are stored in two layers:

1. **Password layer (the real protection).** `@metamask/browser-passworder`:
   PBKDF2-derived key, AES-GCM, per-blob salt and IV.
2. **Outer `react-secure-storage` layer (obfuscation only).** Its key is
   derived from a browser/device fingerprint. To stop the key from drifting
   (monitor change, HDR, language change), the wallet's patch
   (`patches/react-secure-storage+1.3.2.patch`) caches the fingerprint inputs
   `screenPrint`, `language`, `systemLanguage`, `cookieEnabled` and `canvas`
   in **plain `localStorage`**. The same holds for the canvas print that
   `src/lib/fingerprint.ts` uses for the `randomParams` key.

   Consequence: anyone who can read the browser profile (a copied profile
   directory, malware running as the user, another extension with
   profile-level access) can recompute this outer key. The outer layer does
   **not** bind the data to the original device. Against an offline attacker,
   the only barrier is the password KDF. Use a strong, unique wallet password.

   A real device binding would need a non-extractable WebCrypto `CryptoKey`
   stored in IndexedDB, used for wrapping instead of a fingerprint string.
   That is a format migration and is not done yet.

## Verifying a release

Each release on GitHub (built by `.github/workflows/deterministic-build.yml`)
publishes:

- `ssp-wallet-chrome-<version>.zip`, `ssp-wallet-firefox-<version>.zip` and
  `SHA256SUMS`. Check with `sha256sum -c SHA256SUMS`.
- A GitHub build provenance attestation. Check with
  `gh attestation verify ssp-wallet-chrome-<version>.zip --repo RunOnFlux/ssp-wallet`.
- `SHA256SUMS.asc`, only when a release GPG key is configured. Check with
  `gpg --verify SHA256SUMS.asc SHA256SUMS`. If a release has no `.asc`, it
  was not GPG-signed.

To reproduce: `git checkout <version> && yarn build:deterministic` (Docker,
digest-pinned `node:24.11.1-alpine` base image), then compare `SHA256SUMS`.
