/**
 * Build explorer URLs for tx and address links.
 *
 * Solana Explorer requires a `?cluster=<network>` query param to look up
 * non-mainnet entries — without it, devnet txs/addresses 404 silently
 * because the page defaults to `mainnet-beta`. UTXO/EVM explorers don't
 * need any extra query params.
 */
import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';

function solanaCluster(chain: string): string | null {
  if (chain === 'solDevnet') return 'devnet';
  // future-proofing: 'sol' would be mainnet (no cluster param needed),
  // 'solTestnet' would be 'testnet', etc.
  return null;
}

function withSolanaCluster(url: string, chain: string): string {
  const cluster = solanaCluster(chain);
  if (!cluster) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}cluster=${cluster}`;
}

function explorerHost(chain: string): string {
  const cfg = backends()[chain];
  return cfg.explorer ?? cfg.node ?? '';
}

/** Explorer URL for a transaction by signature/hash. */
export function explorerTxUrl(chain: string, txid: string): string {
  const base = `https://${explorerHost(chain)}/tx/${txid}`;
  return withSolanaCluster(base, chain);
}

/** Explorer URL for an address. */
export function explorerAddressUrl(chain: string, address: string): string {
  const base = `https://${explorerHost(chain)}/address/${address}`;
  return withSolanaCluster(base, chain);
}

// Re-export for use sites that want to know if they're on Solana cheaply.
export function isSolanaChain(chain: string): boolean {
  return blockchains[chain]?.chainType === 'sol';
}
