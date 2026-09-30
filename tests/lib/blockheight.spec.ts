/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, afterEach } from 'vitest';
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

describe('Blockheight — Kaspa (mocked kaspa-rest-server)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('uses the virtual chain blue score as the tip', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ blueScore: 123456789 }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getBlockheight('kas')).resolves.toBe(123456789);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api-kaspa.sspwallet.io/info/virtual-chain-blue-score',
    );
  });
});

describe('Blockheight — TRON (mocked full node)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('uses the latest SOLIDIFIED block as the tip', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          // TRON block ids start with the 8-byte block number
          blockID: (70123456).toString(16).padStart(16, '0') + 'ab'.repeat(24),
          block_header: { raw_data: { number: 70123456, timestamp: 1 } },
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getBlockheight('tron')).resolves.toBe(70123456);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://node-tron.sspwallet.io/walletsolidity/getnowblock',
    );
  });
});
