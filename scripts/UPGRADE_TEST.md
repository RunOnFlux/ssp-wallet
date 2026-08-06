# Upgrade-in-place release gate

Proves that upgrading the SSP Wallet extension over an existing browser
profile **never loses wallet state** — after an upgrade the user must only
re-enter their password. No re-onboarding, no SSP Key re-pair, no
restore-from-seed.

## What it does

`scripts/upgrade-in-place.mjs`:

1. **Builds the OLD version** in a temporary git worktree
   (`.upgrade-test/worktree`). By default the old ref is resolved
   automatically as the most recent commit whose `package.json` version
   differs from HEAD's (i.e. the previous release state). `yarn install` +
   `yarn build` run inside the worktree, so the first run is slow.
2. **Creates real state on the old build**: launches headful Chromium via
   Playwright `launchPersistentContext` with a fresh profile
   (`.upgrade-test/profile`) and the old build loaded as an unpacked
   extension from a **fixed staging path** (`.upgrade-test/ext`). It drives
   the Restore flow with the public BIP39 test-vector mnemonic (throwaway —
   never fund it), sets password `UpgradeTest#123`, pairs the SSP Key via
   the manual-xpub sync path, captures the receive address shown on Home,
   and switches the theme to dark.
3. **Swaps in the NEW build**: builds HEAD (`yarn build`, or reuses `dist/`
   with `--reuse-dist`), copies `dist/` over the **same** staging path —
   the unpacked-extension ID derives from the path, and the extension's
   storage origin derives from the ID, so the path must not change — and
   relaunches Chromium with the **same** user-data-dir.
4. **Asserts continuity**:
   - app opens on `/login` ("Welcome back!"), **not** `/welcome` (which
     would mean storage loss);
   - the extension ID is unchanged;
   - the pre-upgrade password unlocks the wallet;
   - Home shows the **same** receive address, with no "Dual Factor SSP Key"
     re-pair modal;
   - settings survived: `themeMode` is still `dark` (applied as
     `html[data-theme="dark"]`) and `activeChain` is unchanged.
5. **Cleanup**: removes the worktree, staging dir and temp profile on
   success. On failure everything is kept under `.upgrade-test/` for
   debugging and the script exits non-zero.

## Usage

```bash
# one-time setup (browser binary is not committed)
npx playwright install chromium

# full gate: previous release -> HEAD
yarn test:upgrade

# explicit old ref
yarn test:upgrade v1.39.1
yarn test:upgrade 85347098

# skip rebuilding HEAD if dist/ is already current
yarn test:upgrade --reuse-dist

# keep temp dirs even on success
yarn test:upgrade --keep
```

Notes:

- This is a **local/manual release gate**, not a CI job — Chrome extensions
  require headful Chromium, so a display is needed.
- Runtime is dominated by the old-version `yarn install` + two production
  builds; expect several minutes.
- The mnemonic used is the well-known BIP39 test vector
  (`abandon ... about`) and the "SSP Key" xpub is the public BIP32 test
  vector — both are throwaway public values. Nothing sensitive is written
  to logs or artifacts.
- The script never touches `src/`, the manifest or the build config; it
  only builds and loads them.

## Manual equivalent for ssp-key (mobile)

There is no automated harness for the mobile app; run this checklist before
each ssp-key release:

1. Install the **previous release** APK (Android) / IPA via TestFlight (iOS)
   on a device or emulator.
2. Complete key setup and **pair with an SSP Wallet** (sync via QR), set a
   non-default setting (e.g. dark theme, alternative currency).
3. Install the **release candidate over the existing install** (adb
   `install -r` / TestFlight update — do NOT uninstall first).
4. Verify after upgrade:
   - app opens on the unlock screen (not onboarding);
   - the existing password/biometrics unlock works;
   - the pairing with SSP Wallet is intact — sign a test transaction or
     re-sync without re-scanning the wallet QR;
   - settings (theme, currency, etc.) are preserved.
5. Any deviation is a release blocker.
