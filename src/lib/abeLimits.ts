import { abeAsset } from '../types';

// Exchanges ABE lists but never quotes to SSP: both are client-signed, and ABE
// hides client-signed providers from wallets that do not declare a
// signing-capable version. Their limits must not widen the pairs SSP offers.
const EXCHANGES_NOT_OFFERED_TO_SSP = new Set(['idrangofloat', 'idbinanceweb3']);

/**
 * Pair limits of every exchange ABE attached to this asset. ABE sends one
 * `id<exchange>limit` key per exchange that carries the asset: null means
 * "every asset of that exchange", an array lists exactly which. Read
 * generically, so a new ABE exchange (e.g. InstaSwap's three rails) needs no
 * wallet change.
 */
export function exchangeLimits(asset: abeAsset): (string[] | null)[] {
  return Object.keys(asset)
    .filter((key) => key.startsWith('id') && key.endsWith('limit'))
    .filter(
      (key) => !EXCHANGES_NOT_OFFERED_TO_SSP.has(key.slice(0, -'limit'.length)),
    )
    .map((key) => asset[key])
    .filter(
      (limit): limit is string[] | null =>
        limit === null || Array.isArray(limit),
    );
}
