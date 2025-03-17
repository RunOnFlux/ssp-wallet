import { jest } from '@jest/globals';
import { fetchNetworkFees } from '../../src/lib/networkFee';
import axios from 'axios';

jest.mock('axios');

describe('Network Fee Lib', () => {
  describe('Verifies network fee', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    // Testing using stub data
    it('should return successful result if stub value is valid', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({ data: 'sample data' });
      const result = await fetchNetworkFees();
      expect(result).toBe('sample data');
    });

    it('should return successful result if stub value is valid data', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({ data: 'result' });
      const result = await fetchNetworkFees();
      expect(result).toBe('result');
    });

    it('should return without data when value none', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({ data: {} });
      await expect(fetchNetworkFees()).rejects.toEqual(
        'Error: Invalid response from SSP for network fees',
      );
    });
  });
});
