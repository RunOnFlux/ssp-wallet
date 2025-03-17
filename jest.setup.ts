import '@testing-library/jest-dom'; // Enables matchers like `toBeInTheDocument`
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
// @ts-expect-error - TextDecoder is not defined in the global scope
global.TextDecoder = TextDecoder;

jest.mock('@runonflux/utxo-lib', () => {
  const actualLib = jest.requireActual('@runonflux/utxo-lib'); // Get the real module
  return {
    ...actualLib,
    networks: actualLib.networks ?? {}, // Ensure networks is not undefined
  };
});
