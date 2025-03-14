// jest.setup.mjs
import '@testing-library/jest-dom';
import { expect, jest } from '@jest/globals';

// Make expect and jest available globally
globalThis.expect = expect;
globalThis.jest = jest;

// Mock fetch
globalThis.fetch = jest.fn();

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});