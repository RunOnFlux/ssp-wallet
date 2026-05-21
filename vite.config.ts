import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { viteLavaMoat } from 'vite-plugin-lavamoat';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
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
        // Enable code splitting.
        // Vite 8 (Rolldown) requires manualChunks to be a function; the
        // Rollup-style object form is no longer accepted.
        manualChunks: (id: string) => {
          const groups: Record<string, string[]> = {
            'vendor-react': [
              'react',
              'react-dom',
              'react-router',
              'react-redux',
              'react-i18next',
              'react-secure-storage',
            ],
            'vendor-ui': ['antd', '@ant-design/icons'],
            'vendor-runonflux': ['@runonflux/utxo-lib', '@runonflux/flux-sdk'],
            'vendor-crypto': ['@scure/bip32', '@scure/bip39', 'bchaddrjs'],
            'vendor-eth': [
              '@runonflux/aa-schnorr-multisig-sdk',
              '@alchemy/aa-core',
              'viem',
            ],
            'vendor-utils': [
              'axios',
              'localforage',
              'i18next',
              'buffer',
              'crypto-browserify',
              'stream-browserify',
              'bignumber.js',
            ],
          };
          for (const [chunk, packages] of Object.entries(groups)) {
            if (packages.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
              return chunk;
            }
          }
          return undefined;
        },
        // Ensure consistent chunk naming for extension with fixed hash length
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
    // Some Node-style deps (viem, @alchemy/aa-core) reference `global`.
    // Vite 8/Rolldown no longer polyfills this implicitly — must replace
    // at build time for the bundle to run in the browser.
    global: 'globalThis',
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
    // disable console and debugger in production
    // drop: ['console', 'debugger'],
  },
}));
