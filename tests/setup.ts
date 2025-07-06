import { beforeAll, vi } from 'vitest';

// Set up basic test environment
beforeAll(() => {
  // Mock crypto for Node.js environment
  Object.defineProperty(global, 'crypto', {
    value: {
      getRandomValues: vi.fn((arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }),
      randomUUID: vi.fn(() => 'test-uuid'),
    },
    writable: true,
    configurable: true,
  });
});
