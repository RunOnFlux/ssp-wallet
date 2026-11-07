# Reproducible Builds for SSP Wallet

SSP Wallet uses deterministic builds to ensure complete transparency and verifiability of browser extension packages.

## For Browser Store Reviewers

### Quick Verification

```bash
# Clone repository
git clone https://github.com/RunOnFlux/ssp-wallet.git
cd ssp-wallet

# Checkout the exact version being reviewed
git checkout <VERSION_TAG>

# Build deterministically using Docker
yarn build:deterministic

# Compare the generated SHA256SUMS with the SHA256SUMS published on the
# GitHub release for <VERSION_TAG> (verify its signature first, see below).
# The zip hashes must be identical.
diff <(grep '\.zip$' SHA256SUMS) <(grep '\.zip$' /path/to/release/SHA256SUMS)
```

`yarn build:deterministic` only needs Docker on the host; it does not need a local `yarn install`.

### What Gets Built

- `ssp-wallet-chrome-<version>.zip` - Chrome Web Store package
- `ssp-wallet-firefox-<version>.zip` - Firefox Add-ons package
- `SHA256SUMS` - Hash file for verification. Its comment line records the git commit, passed into Docker as the `GIT_COMMIT` build argument (`.git` is not part of the build context). The commit never enters the zips.

### Build Environment

- **Docker Image:** `node:24.11.1-alpine` (SHA-pinned)
- **Build Date:** 2025-01-01 00:00:00 UTC (deterministic timestamp)
- **Dependencies:** `yarn install --frozen-lockfile --ignore-scripts`. Exact versions from `yarn.lock`; every downloaded package must match its lockfile integrity hash.
- **Install scripts:** none run during install (`.yarnrc` sets `ignore-scripts`). `yarn setup` then runs only the scripts allowlisted in `package.json` (`lavamoat.allowScripts`): `patch-package` and the local LavaMoat plugin build.
- **Network:** the build does use the network. It installs `zip` from the Alpine package repository and downloads npm packages from the Yarn registry. Reproducibility comes from the pinned image and the lockfile hashes, not from network isolation.
- **LavaMoat policy:** the build fails if the bundle needs a global or package that the committed `security/vite-lavamoat-policy.json` does not grant.

### Verification Process

The deterministic build ensures:
- Same source code and lockfile always produce identical packages
- The result does not depend on the builder's machine, only on Docker
- Anyone can check that a store package was built from the published source
- Complete reproducibility across different machines

### Package Differences

- **Chrome:** Uses Manifest background service_worker
- **Firefox:** Uses Manifest background scripts
- **Content:** Identical application code, slightly different manifests only

## For Developers

```bash
# Build deterministic packages
yarn build:deterministic

# Outputs in project root:
# - ssp-wallet-chrome-<version>.zip
# - ssp-wallet-firefox-<version>.zip
# - SHA256SUMS
```

## For Maintainers - Signing Releases

After building deterministic packages, maintainers must sign the SHA256SUMS file with GPG:

```bash
# Sign the SHA256SUMS file with the official SSP Wallet GPG key
gpg --armor --detach-sign --local-user F3244FFC7207DB2CAA355DF506139DA3A0B13EC1 SHA256SUMS

# This creates SHA256SUMS.asc which users can verify with:
# gpg --verify SHA256SUMS.asc SHA256SUMS
```

The signed `SHA256SUMS.asc` file must be uploaded to the GitHub release alongside the build artifacts.

## Requirements

- Docker (for deterministic builds)
- Git (for version checkout)
- GPG (for signing releases - maintainers only)

## Technical Details

The build process:
1. Uses fixed Docker environment with pinned base image
2. Sets deterministic timestamps (2025-01-01 UTC, `SOURCE_DATE_EPOCH=1735689600`) on all files
3. Sorts files before ZIP creation for consistent archives
4. Generates SHA256 hashes for verification
5. Creates unified hash file ready for PGP signing

This ensures that anyone can rebuild the exact same packages and verify the integrity of submitted browser extensions.