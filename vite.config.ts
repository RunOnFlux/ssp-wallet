import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteLavaMoat } from 'vite-plugin-lavamoat';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    // Inject Node-style globals (Buffer, process, global) into chunks that
    // reference them bare. Build-time injection via @rollup/plugin-inject,
    // so vendor chunks no longer race against runtime window.process =
    // assignment. Replaces the hand-rolled polyfill <script> blocks that
    // used to live in index.html. resolve.alias entries below still apply
    // to explicit imports — this plugin only adds the global layer.
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    // Only enable LavaMoat in production builds
    ...(command === 'build'
      ? [
          viteLavaMoat({
            policyPath: './security/vite-lavamoat-policy.json',
            lockdown: true,
            generatePolicy: true, // Static policy - use npm run generate-policy to update
            diagnostics: true,
            scuttleGlobalThis: {
              enabled: true,
              exceptions: ['chrome', 'browser', 'global', 'self'],
            },
          }),
        ]
      : []),
  ],

  // Hot reload loop prevention is handled internally by the LavaMoat plugin
  resolve: {
    alias: {
      stream: 'stream-browserify',
      crypto: 'crypto-browserify',
      process: 'process/browser',
      '@assets': '/src/assets',
      '@storage': '/src/storage',
      '@components': '/src/components',
      '@pages': '/src/pages',
      '@utils': '/src/utils',
      '@lib': '/src/lib',
      '@types': '/src/types',
      '@hooks': '/src/hooks',
      '@context': '/src/context',
      '@config': '/src/config',
      '@constants': '/src/constants',
      '@services': '/src/services',
      '@styles': '/src/styles',
      '@routes': '/src/routes',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Function-form manualChunks (Vite 8 / Rolldown compatible).
        //
        // Each chunk matches packages by node_modules path. No fallback
        // bucket — anything unmatched falls to the entry chunk, where it's
        // guaranteed to be evaluated before any named chunk runs. That's
        // what prevents the vendor↔topical TDZ cycles we hit earlier.
        //
        // Polyfilled packages (buffer/crypto-browserify/stream-browserify/
        // process/etc.) are deliberately not matched — they stay in entry
        // because vite-plugin-node-polyfills injects cross-chunk imports
        // of them.
        //
        // React's full ecosystem (react-redux, react-router, react-i18next,
        // i18next, scheduler, use-sync-external-store) lives in one chunk
        // because react-redux's CJS internals call into React at module
        // init — cross-chunk lookups would TDZ.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            /node_modules[\\/](react|react-dom|react-router|react-redux|react-i18next|i18next|react-secure-storage|react-countdown-circle-timer|scheduler|use-sync-external-store)[\\/]/.test(
              id,
            )
          )
            return 'vendor-react';
          if (/node_modules[\\/]@reduxjs[\\/]/.test(id)) return 'vendor-react';

          if (/node_modules[\\/](antd|rc-[a-z-]+)[\\/]/.test(id))
            return 'vendor-ui';
          if (/node_modules[\\/]@ant-design[\\/]/.test(id)) return 'vendor-ui';

          if (/node_modules[\\/](bchaddrjs)[\\/]/.test(id))
            return 'vendor-crypto';
          if (/node_modules[\\/]@scure[\\/](bip32|bip39)[\\/]/.test(id))
            return 'vendor-crypto';

          if (
            /node_modules[\\/]@runonflux[\\/](utxo-lib|flux-sdk)[\\/]/.test(id)
          )
            return 'vendor-utxo';

          if (/node_modules[\\/](viem|ethers)[\\/]/.test(id))
            return 'vendor-eth';
          if (
            /node_modules[\\/]@runonflux[\\/]aa-schnorr-multisig-sdk[\\/]/.test(
              id,
            )
          )
            return 'vendor-eth';
          if (/node_modules[\\/]@alchemy[\\/]/.test(id)) return 'vendor-eth';

          if (/node_modules[\\/]@solana[\\/]/.test(id)) return 'vendor-solana';
          if (/node_modules[\\/]@coral-xyz[\\/]/.test(id))
            return 'vendor-solana';
          if (/node_modules[\\/]@runonflux[\\/]solana-multisig[\\/]/.test(id))
            return 'vendor-solana';

          // NOTE: vendor-wc (@reown/@walletconnect) was attempted but
          // crashed at runtime — shared transitive subdeps (safe-buffer)
          // shifted into vendor-wc and broke utxo-lib's init order.
          // Function form doesn't track transitive deps the way object
          // form does, so we keep WC in entry to preserve utxo's
          // safe-buffer placement.

          // Unmatched node_modules → entry (no fallback chunk).
          return;
        },
        entryFileNames: 'assets/[name]-[hash:8].js',
        chunkFileNames: 'assets/[name]-[hash:8].js',
        assetFileNames: 'assets/[name]-[hash:8].[ext]',
      },
    },
    // Improve chunk loading by using dynamic imports
    dynamicImportVarsOptions: {
      warnOnError: true,
    },
  },
  define: {
    'process.env': {
      // mainly disable user agent to prevent, we use static canvas
      VITE_SECURE_LOCAL_STORAGE_DISABLED_KEYS:
        'UserAgent|Plugins|TimeZone|Canvas',
      REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS:
        'UserAgent|Plugins|TimeZone|Canvas',
      SECURE_LOCAL_STORAGE_DISABLED_KEYS: 'UserAgent|Plugins|TimeZone|Canvas',
      // WalletConnect Project ID - Get from https://cloud.reown.com/
      REACT_APP_WALLETCONNECT_PROJECT_ID: JSON.stringify(
        process.env.REACT_APP_WALLETCONNECT_PROJECT_ID ||
          '0fddbe43cb0cca6b6e0fcf9b5f4f0ff6',
      ),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      keepNames: true, // keep names is needed as of utxo-lib using typeforce, can't be mangled: `BigInteger`, `ECPair`, `Point`.
      // Node.js global to browser globalThis
      // Dev-only: esbuild pre-bundles node_modules without the top-level `define`
      define: {
        global: 'globalThis',
        'process.env.SECURE_LOCAL_STORAGE_DISABLED_KEYS': JSON.stringify(
          'UserAgent|Plugins|TimeZone|Canvas',
        ),
        'process.env.REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS':
          JSON.stringify('UserAgent|Plugins|TimeZone|Canvas'),
        'process.env.VITE_SECURE_LOCAL_STORAGE_DISABLED_KEYS': JSON.stringify(
          'UserAgent|Plugins|TimeZone|Canvas',
        ),
      },
    },
  },
  esbuild: {
    keepNames: true, // Preserve class and function names,
    // Strip console.* and debugger statements from production builds only so
    // no sensitive runtime data (xpubs, nonces, signatures) can leak to the
    // console in shipped extensions. Dev builds keep logging intact.
    ...(command === 'build' ? { drop: ['console', 'debugger'] as const } : {}),
  },
}));
