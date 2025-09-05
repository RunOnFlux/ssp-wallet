import localForage from 'localforage';
import { store, setWalletNamesForChain } from '../store';
import { cryptos } from '../types';
import i18n from '../translations';
import { blockchains } from '@storage/blockchains';

// Helper to safely get wallet names from Redux
function getReduxWalletNames(chain: keyof cryptos): {
  [walletId: string]: string;
} {
  try {
    return store.getState().walletNames?.chains[chain] || {};
  } catch (error) {
    console.error('Error accessing Redux wallet names:', error);
    return {};
  }
}

// Helper to safely get a single wallet name from Redux
function getReduxWalletName(
  chain: keyof cryptos,
  walletId: string,
): string | undefined {
  try {
    return store.getState().walletNames?.chains[chain]?.[walletId];
  } catch (error) {
    console.error('Error accessing Redux wallet name:', error);
    return undefined;
  }
}

// Track which chains are loaded to avoid re-loading
const loadedChains = new Set<string>();
const loadingChains = new Set<string>(); // Track chains currently being loaded

export async function loadWalletNamesForChain(
  chain: keyof cryptos,
): Promise<void> {
  // Avoid duplicate loading
  if (loadedChains.has(chain) || loadingChains.has(chain)) return;

  loadingChains.add(chain);
  try {
    const chainWalletNames: { [walletId: string]: string } =
      (await localForage.getItem(`walletNames-${chain}`)) ?? {};

    // Safely dispatch to Redux
    try {
      store.dispatch(
        setWalletNamesForChain({ chain, names: chainWalletNames }),
      );
      loadedChains.add(chain);
    } catch (reduxError) {
      console.error(
        `Failed to dispatch wallet names for chain ${chain}:`,
        reduxError,
      );
      // Don't mark as loaded if Redux update fails
    }
  } catch (error) {
    console.error(`Failed to load wallet names for chain ${chain}:`, error);
  } finally {
    loadingChains.delete(chain);
  }
}

export function getWalletNameFromMemory(
  chain: keyof cryptos,
  walletId: string,
): string | undefined {
  // Auto-load wallet names for this chain if not loaded yet
  if (!loadedChains.has(chain)) {
    loadWalletNamesForChain(chain).catch(console.error);
  }

  return getReduxWalletName(chain, walletId);
}

export function generateDefaultWalletName(walletId: string): string {
  try {
    // Validate walletId format
    if (!walletId || !walletId.includes('-')) {
      throw new Error(`Invalid walletId format: ${walletId}`);
    }

    // Parse wallet ID parts directly (don't depend on chain state)
    const parts = walletId.split('-');
    const typeNumber = parseInt(parts[0], 10);
    const addressIndex = parseInt(parts[1], 10);

    // Validate parsed numbers
    if (isNaN(typeNumber) || isNaN(addressIndex)) {
      throw new Error(`Invalid walletId format: ${walletId}`);
    }

    const walletNumber = addressIndex + 1;

    let walletType = i18n.t('common:wallet');
    if (typeNumber === 1) {
      walletType = i18n.t('common:change');
    }
    return `${walletType} ${walletNumber}`;
  } catch (error) {
    console.error('Error generating default wallet name:', error);
  }

  // Fallback to walletId format (ensure walletId is valid for slicing)
  if (!walletId || walletId.length < 10) {
    return walletId || 'Unknown Wallet';
  }
  return `${walletId.slice(0, 6)}...${walletId.slice(-4)}`;
}

export function getDisplayName(chain: keyof cryptos, walletId: string): string {
  // Auto-load wallet names for this chain if not loaded yet
  if (!loadedChains.has(chain)) {
    loadWalletNamesForChain(chain).catch(console.error);
  }

  // 1. Try custom name from Redux (fastest)
  const customName = getReduxWalletName(chain, walletId);
  if (customName) return customName;

  // 2. Fallback to default wallet naming with proper translations
  return generateDefaultWalletName(walletId);
}

export function getFullDisplayName(
  chain: keyof cryptos,
  walletId: string,
): string {
  // Auto-load wallet names for this chain if not loaded yet
  if (!loadedChains.has(chain)) {
    loadWalletNamesForChain(chain).catch(console.error);
  }

  // 1. Try custom name from Redux (fastest)
  const customName = getReduxWalletName(chain, walletId);
  if (customName) return customName;

  // 2. Fallback to default wallet naming with blockchain name
  try {
    const walletName = generateDefaultWalletName(walletId);
    const blockchainName = blockchains[chain]?.name || chain.toUpperCase();

    // Use the same template as the original system
    return (
      i18n.t('home:navbar.chain_wallet', {
        chain: blockchainName,
        wallet: walletName,
      }) || `${blockchainName} ${walletName}`
    );
  } catch {
    // Fallback without translation
    const walletName = generateDefaultWalletName(walletId);
    const blockchainName = blockchains[chain]?.name || chain.toUpperCase();
    return `${blockchainName} ${walletName}`;
  }
}

export async function setWalletName(
  chain: keyof cryptos,
  walletId: string,
  name: string,
): Promise<void> {
  // Ensure wallet names for this chain are loaded first
  if (!loadedChains.has(chain)) {
    await loadWalletNamesForChain(chain);
  }

  // Get current names and update
  const currentNames = getReduxWalletNames(chain);
  const updatedNames = { ...currentNames };

  const trimmedName = name.trim();
  if (trimmedName) {
    updatedNames[walletId] = trimmedName;
  } else {
    delete updatedNames[walletId];
  }

  try {
    // Update storage first
    await localForage.setItem(`walletNames-${chain}`, updatedNames);

    // Then update Redux
    try {
      store.dispatch(setWalletNamesForChain({ chain, names: updatedNames }));
    } catch (reduxError) {
      console.error(
        `Failed to update Redux after saving wallet name for chain ${chain}:`,
        reduxError,
      );
      // Don't throw - LocalForage update succeeded, Redux just didn't sync
    }
  } catch (error) {
    console.error(`Failed to save wallet name for chain ${chain}:`, error);
    throw error;
  }
}

export async function removeWalletName(
  chain: keyof cryptos,
  walletId: string,
): Promise<void> {
  await setWalletName(chain, walletId, ''); // Just set empty name to remove it
}

export function getChainWalletNames(chain: keyof cryptos): {
  [walletId: string]: string;
} {
  return getReduxWalletNames(chain);
}
