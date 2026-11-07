# Deterministic Build Dockerfile for SSP Wallet
# This Dockerfile ensures reproducible builds for Firefox review compliance

# Base image pinned by digest (multi-arch index of node:24.11.1-alpine). The
# tag itself is re-pushed upstream; the digest never changes.
FROM node:24.11.1-alpine@sha256:2867d550cf9d8bb50059a0fff528741f11a84d985c732e60e19e8e75c7239c43

# .git is excluded from the build context, so the commit is passed in:
#   docker build --build-arg GIT_COMMIT=$(git rev-parse HEAD) ...
# It only appears in the SHA256SUMS comment line, never in the zips.
ARG GIT_COMMIT=unknown

# Set deterministic environment variables
ENV NODE_ENV=production
ENV npm_config_fund=false
ENV npm_config_audit=false
ENV npm_config_optional=false
ENV SOURCE_DATE_EPOCH=1735689600
ENV TZ=UTC
ENV LANG=C
ENV LC_ALL=C
ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV VITE_BUILD_TIMESTAMP=1735689600

# Install zip utility for creating deterministic archives
RUN apk add --no-cache zip

# Create app directory with specific user (node user already exists in this image)
WORKDIR /app
RUN chown node:node /app

# Switch to node user for security
USER node

# Copy all source code first
COPY --chown=node:node . .

# Install exact dependencies using frozen lockfile. No dependency install
# script runs here (also enforced by .yarnrc ignore-scripts).
RUN yarn install --frozen-lockfile --ignore-scripts --production=false --cache-folder /tmp/yarn-cache

# Run only the install scripts allowlisted in package.json "lavamoat"
# (@lavamoat/allow-scripts): the root postinstall, i.e. patch-package and the
# local vite-plugin-lavamoat build. Fails on any unconfigured install script.
RUN yarn setup

# Verify that react-secure-storage patch was applied successfully
RUN echo "Verifying patches were applied..." && \
    if grep -q "localStorage.getItem.*canvas" node_modules/react-secure-storage/dist/fingerprint.lib.js; then \
        echo "✓ react-secure-storage patch applied successfully"; \
    else \
        echo "✗ react-secure-storage patch FAILED to apply!" && exit 1; \
    fi

# Normalize all file timestamps to SOURCE_DATE_EPOCH for reproducibility  
RUN find . -type f -not -path "./node_modules/*" -exec touch -d @${SOURCE_DATE_EPOCH} {} +

# Build application and create browser packages using existing build system
RUN yarn build:all

# Normalize timestamps again after build
RUN find dist dist-zip -type f -exec touch -d @${SOURCE_DATE_EPOCH} {} + 2>/dev/null || true

# Copy the generated zip files and extract them to deterministic build folders
RUN unzip -q dist-zip/ssp-wallet-chrome-v*.zip -d dist-chrome && \
    unzip -q dist-zip/ssp-wallet-firefox-v*.zip -d dist-firefox

# Create deterministic Chrome zip
RUN cd dist-chrome && \
    find . -type f -exec touch -d @${SOURCE_DATE_EPOCH} {} + && \
    find . -type f | sort | zip -X -r ../ssp-wallet-chrome-deterministic.zip -@

# Create deterministic Firefox zip  
RUN cd dist-firefox && \
    find . -type f -exec touch -d @${SOURCE_DATE_EPOCH} {} + && \
    find . -type f | sort | zip -X -r ../ssp-wallet-firefox-deterministic.zip -@

# Generate unified SHA256SUMS directly
RUN echo "# SSP Wallet Deterministic Build Hashes" > SHA256SUMS && \
    echo "# Git Commit: ${GIT_COMMIT}" >> SHA256SUMS && \
    echo "#" >> SHA256SUMS && \
    sha256sum ssp-wallet-chrome-deterministic.zip >> SHA256SUMS && \
    sha256sum ssp-wallet-firefox-deterministic.zip >> SHA256SUMS

# Output stage for extracting build artifacts
FROM scratch AS export-stage
COPY --from=0 /app/ssp-wallet-chrome-deterministic.zip /
COPY --from=0 /app/ssp-wallet-firefox-deterministic.zip /
COPY --from=0 /app/SHA256SUMS /