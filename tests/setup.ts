import { beforeAll } from 'vitest';
import { webcrypto } from 'crypto';

// Set up basic test environment
beforeAll(() => {
  // Expose Node's webcrypto as `globalThis.crypto` so libraries that
  // depend on the Web Crypto API (e.g. @metamask/browser-passworder's
  // crypto.subtle usage) work under Vitest's default Node env.
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
});
