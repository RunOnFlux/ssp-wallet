#!/bin/bash

# SSP Wallet Deterministic Build Script - Chrome and Firefox
# Usage: ./scripts/deterministic-build.sh [version]

set -euo pipefail

VERSION="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

get_version() {
    if [ -n "$VERSION" ]; then
        echo "$VERSION"
        return
    fi
    
    # Try git tag first
    if git describe --tags --exact-match HEAD >/dev/null 2>&1; then
        git describe --tags --exact-match HEAD
    elif [ -f "$ROOT_DIR/package.json" ]; then
        echo "v$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$ROOT_DIR/package.json" | cut -d'"' -f4 | head -1)"
    else
        echo "dev-$(date +%Y%m%d)"
    fi
}

build_deterministic() {
    local version=$(get_version)
    log "Building deterministic Chrome and Firefox packages for $version..."
    
    cd "$ROOT_DIR"
    
    # Docker is required for fully deterministic builds
    if ! command -v docker >/dev/null 2>&1; then
        error "Docker is required for deterministic builds"
    fi
    
    log "Building with Docker for complete deterministic environment..."
    docker build --memory=8g --target export-stage -o . .
    
    # Verify both packages were created
    if [ ! -f "ssp-wallet-chrome-deterministic.zip" ] || [ ! -f "ssp-wallet-firefox-deterministic.zip" ]; then
        error "Docker build failed to create both Chrome and Firefox packages"
    fi
    
    # Rename to include version
    mv ssp-wallet-chrome-deterministic.zip ssp-wallet-chrome-${version}.zip
    mv ssp-wallet-firefox-deterministic.zip ssp-wallet-firefox-${version}.zip
    
    # Generate individual hashes
    sha256sum ssp-wallet-chrome-${version}.zip > ssp-wallet-chrome-${version}.zip.sha256
    sha256sum ssp-wallet-firefox-${version}.zip > ssp-wallet-firefox-${version}.zip.sha256
    
    # Create unified SHA256SUMS file for signing
    log "Creating unified SHA256SUMS file..."
    cat > SHA256SUMS << EOF
# SSP Wallet ${version} - Deterministic Build Hashes
# Git Commit: $(git rev-parse HEAD)
#
# These hashes can be verified with: sha256sum -c SHA256SUMS
#
$(sha256sum ssp-wallet-chrome-${version}.zip)
$(sha256sum ssp-wallet-firefox-${version}.zip)
EOF
    
    success "Deterministic builds complete:"
    echo "  Chrome:  ssp-wallet-chrome-${version}.zip"
    echo "  Firefox: ssp-wallet-firefox-${version}.zip"
    echo "  Hashes:  SHA256SUMS"
    echo
    log "Package hashes:"
    cat SHA256SUMS | grep -E "\.zip$"
}



# Main execution - just build deterministically
build_deterministic