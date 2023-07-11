import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      stream: 'stream-browserify',
      util: 'util',
      crypto: 'crypto-browserify',
      buffer: 'buffer',
    },
  },
});
