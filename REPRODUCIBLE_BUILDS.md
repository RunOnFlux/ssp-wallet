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
npm run build:deterministic

# Verify hashes match our submission
sha256sum -c SHA256SUMS
```

### What Gets Built

- `ssp-wallet-chrome-v1.26.1.zip` - Chrome Web Store package
- `ssp-wallet-firefox-v1.26.1.zip` - Firefox Add-ons package  
- `SHA256SUMS` - Hash file for verification

### Build Environment

- **Docker Image:** `node:22.17.1-alpine` (SHA-pinned)
- **Build Date:** 2025-01-01 00:00:00 UTC (deterministic timestamp)
- **Dependencies:** Frozen via `yarn.lock`
- **Environment:** Isolated container with no network access

### Verification Process

The deterministic build ensures:
- Same source code always produces identical binaries
- No build environment dependencies 
- No hidden code injection possible
- Complete reproducibility across different machines

### Package Differences

- **Chrome:** Uses Manifest background service_worker
- **Firefox:** Uses Manifest background scripts
- **Content:** Identical application code, slightly different manifests only

## For Developers

```bash
# Build deterministic packages
npm run build:deterministic

# Outputs in project root:
# - ssp-wallet-chrome-v1.26.1.zip
# - ssp-wallet-firefox-v1.26.1.zip  
# - SHA256SUMS
```

## Requirements

- Docker (for deterministic builds)
- Git (for version checkout)

## Technical Details

The build process:
1. Uses fixed Docker environment with pinned base image
2. Sets deterministic timestamps (2021-01-01 UTC) on all files
3. Sorts files before ZIP creation for consistent archives
4. Generates SHA256 hashes for verification
5. Creates unified hash file ready for PGP signing

This ensures that anyone can rebuild the exact same packages and verify the integrity of submitted browser extensions.