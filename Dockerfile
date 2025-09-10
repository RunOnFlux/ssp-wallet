# Deterministic Build Dockerfile for SSP Wallet
# This Dockerfile ensures reproducible builds for Firefox review compliance

FROM node:22.17.1-alpine@sha256:5539840ce9d013fa13e3b9814c9353024be7ac75aca5db6d039504a56c04ea59

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

# Install exact dependencies using frozen lockfile
RUN yarn install --frozen-lockfile --production=false --cache-folder /tmp/yarn-cache

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
RUN npm run build:all

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
    echo "# Git Commit: $(git rev-parse HEAD)" >> SHA256SUMS && \
    echo "#" >> SHA256SUMS && \
    sha256sum ssp-wallet-chrome-deterministic.zip >> SHA256SUMS && \
    sha256sum ssp-wallet-firefox-deterministic.zip >> SHA256SUMS

# Output stage for extracting build artifacts
FROM scratch AS export-stage
COPY --from=0 /app/ssp-wallet-chrome-deterministic.zip /
COPY --from=0 /app/ssp-wallet-firefox-deterministic.zip /
COPY --from=0 /app/SHA256SUMS /