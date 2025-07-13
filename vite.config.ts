import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
        // Enable code splitting
        manualChunks: {
          // Group React and related packages
          'vendor-react': [
            'react',
            'react-dom',
            'react-router',
            'react-redux',
            'react-i18next',
            'react-secure-storage',
          ],
          // Group UI framework
          'vendor-ui': ['antd', '@ant-design/icons'],
          // Group blockchain/crypto libraries
          'vendor-runonflux': ['@runonflux/utxo-lib', '@runonflux/flux-sdk'],
          'vendor-crypto': ['@scure/bip32', '@scure/bip39', 'bchaddrjs'],
          'vendor-eth': [
            '@runonflux/aa-schnorr-multisig-sdk',
            '@alchemy/aa-core',
            'viem',
          ],
          // Group utilities
          'vendor-utils': [
            'axios',
            'localforage',
            'i18next',
            'buffer',
            'crypto-browserify',
            'stream-browserify',
            'bignumber.js',
          ],
        },
        // Ensure consistent chunk naming for extension
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Improve chunk loading by using dynamic imports
    dynamicImportVarsOptions: {
      warnOnError: true,
    },
  },
  define: {
    'process.env': {
      // mainly disable user agent to prevent
      VITE_SECURE_LOCAL_STORAGE_DISABLED_KEYS:
        'UserAgent|Plugins|TimeZone|Canvas',
      REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS:
        'UserAgent|Plugins|TimeZone|Canvas',
      SECURE_LOCAL_STORAGE_DISABLED_KEYS: 'UserAgent|Plugins|TimeZone|Canvas',
      // WalletConnect Project ID - Get from https://cloud.reown.com/
      REACT_APP_WALLETCONNECT_PROJECT_ID: JSON.stringify(
        process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || '0fddbe43cb0cca6b6e0fcf9b5f4f0ff6'
      ),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
    },
  },
  esbuild: {
    // disable console and debugger in production
    drop: ['console', 'debugger'],
  },
});
