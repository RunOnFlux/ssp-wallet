import axios from 'axios';
import { store } from '../store';

// Domains that should receive the sspwkid header
const SSP_INFRASTRUCTURE_DOMAINS = [
  'sspwallet.io',
  'sspwallet.com',
  'runonflux.io',
  'runonflux.com',
  'zelcore.io',
];

/**
 * Check if a URL belongs to SSP infrastructure
 */
function isSSPInfrastructureUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return SSP_INFRASTRUCTURE_DOMAINS.some(
      (domain) =>
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`),
    );
  } catch {
    // If URL parsing fails (e.g., relative URL), check against string
    return SSP_INFRASTRUCTURE_DOMAINS.some((domain) => url.includes(domain));
  }
}

/**
 * Axios request interceptor that adds sspwkid header to SSP infrastructure requests
 */
axios.interceptors.request.use(
  (config) => {
    const url = config.url || '';

    if (isSSPInfrastructureUrl(url)) {
      const wkIdentity = store.getState().sspState.sspWalletExternalIdentity;
      if (wkIdentity) {
        config.headers = config.headers || {};
        config.headers['sspwkid'] = wkIdentity;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default axios;
