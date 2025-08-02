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

# Install zip utility for creating deterministic archives
RUN apk add --no-cache zip

# Create app directory with specific user (node user already exists in this image)
WORKDIR /app
RUN chown node:node /app

# Switch to node user for security
USER node

# Copy package files with exact permissions
COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock ./

# Install exact dependencies using frozen lockfile
RUN yarn install --frozen-lockfile --production=false --cache-folder /tmp/yarn-cache

# Copy source code
COPY --chown=node:node . .

# Build both Chrome and Firefox packages
RUN npm run build:chrome && \
    cp -r dist dist-chrome && \
    npm run build:firefox && \
    cp -r dist dist-firefox

# Create deterministic Chrome zip
RUN cd dist-chrome && \
    find . -type f -exec touch -t 202501010000.00 {} \; && \
    find . -type f | sort | zip -X -r ../ssp-wallet-chrome-deterministic.zip -@

# Create deterministic Firefox zip  
RUN cd dist-firefox && \
    find . -type f -exec touch -t 202501010000.00 {} \; && \
    find . -type f | sort | zip -X -r ../ssp-wallet-firefox-deterministic.zip -@

# Generate individual hashes and unified SHA256SUMS
RUN sha256sum ssp-wallet-chrome-deterministic.zip > ssp-wallet-chrome-deterministic.zip.sha256 && \
    sha256sum ssp-wallet-firefox-deterministic.zip > ssp-wallet-firefox-deterministic.zip.sha256 && \
    echo "# SSP Wallet Deterministic Build Hashes" > SHA256SUMS && \
    echo "# Generated: $(date -u --iso-8601=seconds)" >> SHA256SUMS && \
    echo "#" >> SHA256SUMS && \
    cat ssp-wallet-chrome-deterministic.zip.sha256 >> SHA256SUMS && \
    cat ssp-wallet-firefox-deterministic.zip.sha256 >> SHA256SUMS

# Output stage for extracting build artifacts
FROM scratch AS export-stage
COPY --from=0 /app/ssp-wallet-chrome-deterministic.zip /
COPY --from=0 /app/ssp-wallet-chrome-deterministic.zip.sha256 /
COPY --from=0 /app/ssp-wallet-firefox-deterministic.zip /
COPY --from=0 /app/ssp-wallet-firefox-deterministic.zip.sha256 /
COPY --from=0 /app/SHA256SUMS /