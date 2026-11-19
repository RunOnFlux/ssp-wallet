import axios from 'axios';
import type { onramperWidgetUrlSSPRelay } from '../types';

export const ONRAMPER_WIDGET_ORIGIN = 'https://buy.onramper.com';

export interface OnramperWidgetRequest {
  /** Onramper network id from the chain config (onramperNetwork). */
  network: string;
  /** Asset ticker (chain config symbol). */
  asset: string;
  /** The receiving address the widget pre-fills. */
  address: string;
  theme: 'dark' | 'light';
}

/** Only an https URL on Onramper's widget origin may become the iframe src. */
export function isOnramperWidgetUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).origin === ONRAMPER_WIDGET_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Asks the SSP relay for the signed Onramper widget URL. The relay builds and
 * signs the whole URL (Onramper Signature V1 or V2, the relay decides). A V2
 * URL is single-use and expires after 15 minutes, so request a fresh one for
 * every iframe load and never cache or reuse the result.
 */
export async function fetchOnramperWidgetUrl(
  relay: string,
  request: OnramperWidgetRequest,
  signal?: AbortSignal,
): Promise<string> {
  const response = await axios.post<onramperWidgetUrlSSPRelay>(
    `https://${relay}/v1/onramper/url`,
    request,
    { signal },
  );
  const url = response.data?.data?.url;
  if (response.data?.status !== 'success' || !isOnramperWidgetUrl(url)) {
    throw new Error('Relay did not return an Onramper widget URL');
  }
  return url;
}
