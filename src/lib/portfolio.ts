import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { blockchains } from '@storage/blockchains';
import type { Token } from '@storage/blockchains';
import { fetchAddressBalance, fetchAddressTokenBalances } from './balances';
import type {
  cryptos,
  currency,
  generatedWallets,
  tokenBalanceEVM,
} from '../types';

/**
 * Unified multi-chain portfolio aggregation for the Portfolio tab.
 *
 * Design constraints (Phase 3 brief): do NOT invent new fetch logic — reuse the
 * existing per-chain `fetchAddressBalance` + the FiatCurrencyController rates
 * already in Redux. We only (a) discover which chains have been set up, (b) run
 * the per-chain fetches concurrently, and (c) cache. A chain that was never
 * activated shows as `needsActivation`, never an error.
 *
 * Invariant 4 (zero new data collection): the 24h snapshot is stored ONLY in
 * the extension's own localForage — nothing is sent anywhere.
 */

export interface WalletHolding {
  id: string;
  address: string;
  crypto: BigNumber; // whole units
  fiat: number;
}

export interface TokenHolding {
  contract: string;
  symbol: string;
  name: string;
  crypto: BigNumber; // whole units of the token
  fiat: number;
}

export interface ChainPortfolio {
  chain: keyof cryptos;
  name: string;
  symbol: string;
  logo: string;
  needsActivation: boolean;
  crypto: BigNumber; // whole units, native asset
  fiat: number; // chain total in fiat: native + activated tokens
  tokenFiat: number; // fiat portion contributed by activated tokens
  tokens: TokenHolding[]; // aggregated across all wallets of the chain
  walletInUse: string;
  wallets: WalletHolding[];
}

export interface PortfolioResult {
  chains: ChainPortfolio[];
  totalFiat: number;
  fetchedAt: number;
}

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

const PORTFOLIO_CACHE_KEY = 'portfolioCache';
const PORTFOLIO_SNAPSHOTS_KEY = 'portfolioSnapshots';

const chainKeys = () => Object.keys(blockchains) as (keyof cryptos)[];

function toFiat(
  crypto: BigNumber,
  chain: keyof cryptos,
  cryptoRates: cryptos,
  fiatRates: currency,
  fiatCurrency: keyof currency,
): number {
  const rate = (cryptoRates[chain] ?? 0) * (fiatRates[fiatCurrency] ?? 0);
  return crypto.multipliedBy(rate).toNumber();
}

/** Chains that have been set up = have a stored `wallets-<chain>` address map. */
async function discoverChains(): Promise<
  { chain: keyof cryptos; wallets: generatedWallets; walletInUse: string }[]
> {
  const results = await Promise.all(
    chainKeys().map(async (chain) => {
      const wallets: generatedWallets =
        (await localForage.getItem(`wallets-${chain}`)) ?? {};
      const walletInUse: string =
        (await localForage.getItem(`walletInUse-${chain}`)) ?? '0-0';
      return { chain, wallets, walletInUse };
    }),
  );
  return results;
}

/** Does the chain support tokens the same way Home's Balances component does? */
function chainSupportsTokens(chain: keyof cryptos): boolean {
  const type = blockchains[chain]?.chainType;
  return type === 'evm' || type === 'sol';
}

/**
 * Value one wallet's cached/fetched token balances in fiat.
 *
 * Pure — mirrors exactly how Home's TokenBox prices a token:
 * `cryptoRates[symbol.toLowerCase()] * fiatRates[fiatCurrency]`.
 * Only tokens the user activated are counted; the contract-less "native"
 * pseudo-token in chain specs is skipped (native is aggregated separately).
 */
export function valueTokenBalances(
  balances: tokenBalanceEVM[],
  activatedTokens: string[],
  tokenSpecs: Token[],
  cryptoRates: cryptos,
  fiatRates: currency,
  fiatCurrency: keyof currency,
): TokenHolding[] {
  const activated = new Set(activatedTokens.filter((c) => c.length > 0));
  const specByContract = new Map<string, Token>();
  tokenSpecs.forEach((spec) => {
    if (spec.contract) specByContract.set(spec.contract, spec);
  });
  const holdings: TokenHolding[] = [];
  balances.forEach((bal) => {
    if (!activated.has(bal.contract)) return; // stale cache or deactivated
    const spec = specByContract.get(bal.contract);
    if (!spec) return; // no metadata — cannot value safely
    const crypto = new BigNumber(bal.balance || '0').dividedBy(
      10 ** spec.decimals,
    );
    if (crypto.isNaN()) return;
    const rate =
      (cryptoRates[spec.symbol.toLowerCase() as keyof cryptos] ?? 0) *
      (fiatRates[fiatCurrency] ?? 0);
    holdings.push({
      contract: bal.contract,
      symbol: spec.symbol,
      name: spec.name,
      crypto,
      fiat: crypto.multipliedBy(rate).toNumber(),
    });
  });
  return holdings;
}

/** Merge per-wallet token holdings into one per-contract list. Pure. */
export function mergeTokenHoldings(lists: TokenHolding[][]): TokenHolding[] {
  const merged = new Map<string, TokenHolding>();
  lists.forEach((list) => {
    list.forEach((h) => {
      const existing = merged.get(h.contract);
      if (existing) {
        existing.crypto = existing.crypto.plus(h.crypto);
        existing.fiat += h.fiat;
      } else {
        merged.set(h.contract, { ...h });
      }
    });
  });
  return [...merged.values()].sort((a, b) => b.fiat - a.fiat);
}

/**
 * Load the full portfolio. `live=false` returns cached balances only (instant
 * first paint); `live=true` re-fetches every synced address concurrently.
 */
export async function loadPortfolio(
  cryptoRates: cryptos,
  fiatRates: currency,
  fiatCurrency: keyof currency,
  live = true,
): Promise<PortfolioResult> {
  const discovered = await discoverChains();

  const chains: ChainPortfolio[] = await Promise.all(
    discovered.map(async ({ chain, wallets, walletInUse }) => {
      const cfg = blockchains[chain];
      const ids = Object.keys(wallets);
      const needsActivation = ids.length === 0;

      // Token specs = built-in chain tokens + user-imported tokens, exactly
      // like Home's TokensTable.
      const supportsTokens = chainSupportsTokens(chain);
      const importedTokens: Token[] = supportsTokens
        ? ((await localForage.getItem(`imported-tokens-${chain}`)) ?? [])
        : [];
      const tokenSpecs: Token[] = supportsTokens
        ? cfg.tokens.concat(importedTokens)
        : [];

      const tokenHoldingLists: TokenHolding[][] = [];

      const holdings: WalletHolding[] = await Promise.all(
        ids.map(async (id) => {
          const address = wallets[id];
          let base: balancesObj = (await localForage.getItem(
            `balances-${chain}-${id}`,
          )) ?? { confirmed: '0', unconfirmed: '0' };
          if (live && address) {
            try {
              base = await fetchAddressBalance(address, chain);
              await localForage.setItem(`balances-${chain}-${id}`, base);
            } catch (error) {
              // Keep cached value on network failure — never error the tab.
              console.log(
                `[portfolio] balance fetch failed ${chain}-${id}`,
                error,
              );
            }
          }
          // Activated-token balances: same cached-first pattern as native.
          // Reuses Home's fetch lib + the exact localForage keys Home writes,
          // so no new network calls beyond what Home already makes.
          if (supportsTokens) {
            const activatedTokens: string[] =
              (await localForage.getItem(`activated-tokens-${chain}-${id}`)) ??
              [];
            let tokenBals: tokenBalanceEVM[] =
              (await localForage.getItem(`token-balances-${chain}-${id}`)) ??
              [];
            if (live && address && activatedTokens.length > 0) {
              try {
                tokenBals = await fetchAddressTokenBalances(
                  address,
                  chain,
                  activatedTokens,
                );
                await localForage.setItem(
                  `token-balances-${chain}-${id}`,
                  tokenBals,
                );
              } catch (error) {
                // Keep cached token values on network failure.
                console.log(
                  `[portfolio] token balance fetch failed ${chain}-${id}`,
                  error,
                );
              }
            }
            tokenHoldingLists.push(
              valueTokenBalances(
                tokenBals,
                activatedTokens,
                tokenSpecs,
                cryptoRates,
                fiatRates,
                fiatCurrency,
              ),
            );
          }
          const crypto = new BigNumber(base.confirmed)
            .plus(new BigNumber(base.unconfirmed))
            .dividedBy(10 ** cfg.decimals);
          return {
            id,
            address,
            crypto,
            fiat: toFiat(crypto, chain, cryptoRates, fiatRates, fiatCurrency),
          };
        }),
      );

      const crypto = holdings.reduce(
        (acc, h) => acc.plus(h.crypto),
        new BigNumber(0),
      );
      const nativeFiat = holdings.reduce((acc, h) => acc + h.fiat, 0);
      const tokens = mergeTokenHoldings(tokenHoldingLists);
      const tokenFiat = tokens.reduce((acc, h) => acc + h.fiat, 0);

      return {
        chain,
        name: cfg.name,
        symbol: cfg.symbol,
        logo: cfg.logo,
        needsActivation,
        crypto,
        fiat: nativeFiat + tokenFiat,
        tokenFiat,
        tokens,
        walletInUse,
        wallets: holdings,
      };
    }),
  );

  chains.sort((a, b) => b.fiat - a.fiat);
  const totalFiat = chains.reduce((acc, c) => acc + c.fiat, 0);
  const result: PortfolioResult = {
    chains,
    totalFiat,
    fetchedAt: Date.now(),
  };

  // Cache a lightweight snapshot for instant next-open paint.
  try {
    await localForage.setItem(PORTFOLIO_CACHE_KEY, {
      fetchedAt: result.fetchedAt,
      totalFiat,
      byChain: chains.map((c) => ({
        chain: c.chain,
        fiat: c.fiat,
        tokenFiat: c.tokenFiat,
        crypto: c.crypto.toString(),
        needsActivation: c.needsActivation,
      })),
    });
  } catch (error) {
    console.log('[portfolio] cache write failed', error);
  }

  return result;
}

export interface PortfolioChange {
  absolute: number;
  percent: number;
  available: boolean;
}

/**
 * Real, on-device 24h change. Keeps a small ring of timestamped total-value
 * snapshots in localForage; compares "now" against the snapshot closest to 24h
 * ago. Returns `available:false` until a ~1-day-old baseline exists (no faked
 * numbers on first run).
 */
export async function updatePortfolioSnapshots(
  totalFiat: number,
): Promise<PortfolioChange> {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  let snaps: { ts: number; total: number }[] =
    (await localForage.getItem(PORTFOLIO_SNAPSHOTS_KEY)) ?? [];

  // Prune anything older than 48h.
  snaps = snaps.filter((s) => now - s.ts < 2 * DAY);

  // Baseline = oldest snapshot that is at least ~20h old.
  const baseline = snaps
    .filter((s) => now - s.ts >= 20 * 60 * 60 * 1000)
    .sort((a, b) => Math.abs(now - a.ts - DAY) - Math.abs(now - b.ts - DAY))[0];

  // Throttle: add a new snapshot at most every ~3h.
  const last = snaps[snaps.length - 1];
  if (!last || now - last.ts > 3 * 60 * 60 * 1000) {
    snaps.push({ ts: now, total: totalFiat });
  }
  try {
    await localForage.setItem(PORTFOLIO_SNAPSHOTS_KEY, snaps);
  } catch (error) {
    console.log('[portfolio] snapshot write failed', error);
  }

  if (!baseline || baseline.total <= 0) {
    return { absolute: 0, percent: 0, available: false };
  }
  const absolute = totalFiat - baseline.total;
  const percent = (absolute / baseline.total) * 100;
  return { absolute, percent, available: true };
}
