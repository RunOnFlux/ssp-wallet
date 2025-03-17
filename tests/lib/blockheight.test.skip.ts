import { getBlockheight } from '../../src/lib/blockheight';

describe('Currency Lib', () => {
  describe('Verifies currency', () => {
    it('should return data when value is valid evm', async () => {
      const res = await getBlockheight('eth');
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
    });

    it('should return data when value is valid', async () => {
      const res = await getBlockheight('flux');
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
    });

    it('should return data when value is valid blockbook', async () => {
      const res = await getBlockheight('bch');
      expect(res).not.toBeNull();
      expect(res).toBeDefined();
    });
  });
});
