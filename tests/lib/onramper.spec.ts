// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, afterEach } from 'vitest';
import axios from 'axios';

import {
  fetchOnramperWidgetUrl,
  isOnramperWidgetUrl,
} from '../../src/lib/onramper';

const request = {
  network: 'flux',
  asset: 'FLUX',
  address: 't3TRUNKvgywghL1vU5bsGQqs9eVC17XcUnV',
  theme: 'dark',
};
const widgetUrl =
  'https://buy.onramper.com?apiKey=pk_prod_01JDMCZ0ZRZ14VBRW20B4HC04V&sigV2=v2%3Aabc';

describe('onramper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isOnramperWidgetUrl', () => {
    it('accepts only https://buy.onramper.com', () => {
      expect(isOnramperWidgetUrl(widgetUrl)).toBe(true);
      expect(isOnramperWidgetUrl('https://buy.onramper.com/?a=1')).toBe(true);
      expect(isOnramperWidgetUrl('http://buy.onramper.com?a=1')).toBe(false);
      expect(isOnramperWidgetUrl('https://buy.onramper.com.evil.io?a=1')).toBe(
        false,
      );
      expect(
        isOnramperWidgetUrl('https://evil.io?u=https://buy.onramper.com'),
      ).toBe(false);
      expect(isOnramperWidgetUrl('javascript:alert(1)')).toBe(false);
      expect(isOnramperWidgetUrl('')).toBe(false);
      expect(isOnramperWidgetUrl(undefined)).toBe(false);
    });
  });

  describe('fetchOnramperWidgetUrl', () => {
    it('posts the structured request to the relay and returns the url', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { status: 'success', data: { url: widgetUrl } },
      });
      const controller = new AbortController();
      const url = await fetchOnramperWidgetUrl(
        'relay.sspwallet.io',
        request,
        controller.signal,
      );
      expect(url).toBe(widgetUrl);
      expect(post).toHaveBeenCalledWith(
        'https://relay.sspwallet.io/v1/onramper/url',
        request,
        { signal: controller.signal },
      );
    });

    it('rejects an error envelope or a URL off Onramper', async () => {
      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { status: 'error', data: { message: 'Invalid address' } },
      });
      await expect(
        fetchOnramperWidgetUrl('relay.sspwallet.io', request),
      ).rejects.toThrow();

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { status: 'success', data: { url: 'https://evil.io/widget' } },
      });
      await expect(
        fetchOnramperWidgetUrl('relay.sspwallet.io', request),
      ).rejects.toThrow();
    });

    it('propagates relay failures', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'));
      await expect(
        fetchOnramperWidgetUrl('relay.sspwallet.io', request),
      ).rejects.toThrow('Network Error');
    });
  });
});
