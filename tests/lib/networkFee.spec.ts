// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchNetworkFees } from '../../src/lib/networkFee';
import axios from 'axios';

// Mock axios at the top level
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('Network Fee Lib', () => {
  describe('Verifies network fee', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Testing using stub data
    it('should return successful result if stub value is valid', async () => {
      const mockedAxios = vi.mocked(axios);
      mockedAxios.get.mockResolvedValue({ data: 'sample data' });

      const result = await fetchNetworkFees();
      expect(result).toBe('sample data');
    });

    it('should return successful result if stub value is valid data', async () => {
      const mockedAxios = vi.mocked(axios);
      mockedAxios.get.mockResolvedValue({ data: 'result' });

      const result = await fetchNetworkFees();
      expect(result).toBe('result');
    });

    it('should return without data when value none', async () => {
      const mockedAxios = vi.mocked(axios);
      mockedAxios.get.mockResolvedValue({ data: {} });

      await expect(fetchNetworkFees()).rejects.toThrow(
        'Invalid response from SSP for network fees',
      );
    });
  });
});
