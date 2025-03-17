import type { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  preset: 'ts-jest', // Use ts-jest, NOT Babel
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/tests/**/*.test.ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@storage/(.*)$': '<rootDir>/src/storage/$1',
    '^@assets/(.*)$': '<rootDir>/src/assets/$1',
    '\\.svg$': '<rootDir>/tests/mocks/svgMock.ts',
  },
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  globals: {
    'ts-jest': {
      isolatedModules: true,
      useESM: false, // ✅ Forces CommonJS
    },
  },
  transformIgnorePatterns: ['/node_modules/(?!(\\@runonflux/utxo-lib)/)'], // ✅ Ensure Jest can process the lib
};

export default config;
