import localForage from 'localforage';
import { blockchains } from '@storage/blockchains';
import type { cryptos, generatedWallets, transaction } from '../types';

/**
 * All-chains activity feed for the Activity tab.
 *
 * Same design constraints as lib/portfolio.ts: no new fetch logic — the feed
 * merges the per-chain transaction caches the wallet already maintains
 * (`transactions-<chain>-<walletInUse>` in localForage, written by the Home
 * Transactions component and the live-refresh path). Cached-first: reading
 * never touches the network; a live refresh is the caller's explicit choice.
 *
 * The merge/sort/filter core is pure and unit-tested; the localForage
 * loaders are thin guarded wrappers.
 */

export interface ActivityFeedItem extends transaction {
  chain: keyof cryptos;
}

export interface ChainActivitySource {
  chain: keyof cryptos;
  transactions: transaction[];
}

export interface SyncedChainWallet {
  chain: keyof cryptos;
  walletInUse: string;
  address: string;
}

/**
 * Flatten per-chain transaction lists into one feed, newest first. Pure.
 * Ties (same timestamp) break deterministically by txid then chain so the
 * feed order is stable across re-renders and re-merges. Malformed records
 * (no txid) are dropped rather than rendered as broken rows.
 */
export function mergeChainTransactions(
  sources: ChainActivitySource[],
): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];
  for (const source of sources) {
    for (const tx of source.transactions ?? []) {
      if (!tx || typeof tx.txid !== 'string' || !tx.txid) continue;
      items.push({ ...tx, chain: source.chain });
    }
  }
  items.sort(
    (a, b) =>
      (b.timestamp ?? 0) - (a.timestamp ?? 0) ||
      a.txid.localeCompare(b.txid) ||
      a.chain.localeCompare(b.chain),
  );
  return items;
}

/** Chain filter for the feed ('all' passes everything through). Pure. */
export function filterFeedByChain(
  items: ActivityFeedItem[],
  chain: keyof cryptos | 'all',
): ActivityFeedItem[] {
  if (chain === 'all') return items;
  return items.filter((item) => item.chain === chain);
}

/** Guarded localForage read (mirrors lib/portfolio.ts safeGetItem). */
async function safeGetItem<T>(key: string, fallback: T): Promise<T> {
  try {
    return (await localForage.getItem<T>(key)) ?? fallback;
  } catch (error) {
    console.log(`[activityFeed] read failed ${key}`, error);
    return fallback;
  }
}

/**
 * Chains that have been set up = have a stored `wallets-<chain>` address map
 * (the exact discovery rule lib/portfolio.ts uses). Returns each chain's own
 * active wallet + its address so a live refresh knows what to fetch.
 */
export async function discoverActivityChains(): Promise<SyncedChainWallet[]> {
  const chains = Object.keys(blockchains) as (keyof cryptos)[];
  const results = await Promise.all(
    chains.map(async (chain) => {
      const wallets = await safeGetItem<generatedWallets>(
        `wallets-${chain}`,
        {},
      );
      const ids = Object.keys(wallets);
      if (ids.length === 0) return null;
      let walletInUse = await safeGetItem<string>(
        `walletInUse-${chain}`,
        '0-0',
      );
      if (!wallets[walletInUse]) {
        walletInUse = ids[0];
      }
      return { chain, walletInUse, address: wallets[walletInUse] };
    }),
  );
  return results.filter((entry): entry is SyncedChainWallet => entry !== null);
}

/** Cached transactions for one chain's active wallet — storage only. */
export async function loadCachedChainTransactions(
  chain: keyof cryptos,
  walletInUse: string,
): Promise<transaction[]> {
  const txs = await safeGetItem<transaction[]>(
    `transactions-${chain}-${walletInUse}`,
    [],
  );
  return Array.isArray(txs) ? txs : [];
}
