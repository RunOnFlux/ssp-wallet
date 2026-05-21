import localForage from 'localforage';
import { cryptos } from '../types';
import { blockchains } from '@storage/blockchains';
import {
  setAddress,
  setRedeemScript,
  setWitnessScript,
  setXpubWallet,
  setXpubKey,
  setWalletInUse,
  setTransactions,
  setBalance,
  setUnconfirmedBalance,
  setBlockheight,
  setNodes,
  setTokenBalances,
  setActivatedTokens,
  setImportedTokens,
  setChainInitialState,
  setActiveChain,
  store,
} from '../store';
import { loadWalletNamesForChain } from '../storage/walletNames';
import { getFingerprint } from './fingerprint';
import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getScriptType } from './wallet';
import { getMasterXpriv, getMasterXpub } from './wallet';
import { generateMultisigAddress, generateSolanaPubkeyArray } from './wallet';
import type {
  generatedWallets,
  transaction,
  tokenBalanceEVM,
  node,
} from '../types';

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

import type { Token } from '@storage/blockchains';

const balancesObject: balancesObj = {
  confirmed: '0',
  unconfirmed: '0',
};

/**
 * Complete chain switching utility that handles:
 * - Wallet generation/restoration
 * - State loading (transactions, balances, tokens, etc.)
 * - Address generation
 * - Redux state updates
 *
 * Extracted from ChainSelect component for reuse in WalletConnect and other contexts.
 */
export async function switchToChain(
  targetChain: keyof cryptos,
  passwordBlob: string,
): Promise<void> {
  console.log(`🔄 Chain Switching: Starting switch to ${targetChain}`);

  const currentState = store.getState();
  const { xpubWallet, xpubKey } = currentState[targetChain];

  try {
    if (xpubWallet && xpubKey) {
      console.log(
        `🔄 Chain Switching: Using existing xpub data for ${targetChain}`,
      );
      await loadExistingChainData(targetChain);
    } else {
      console.log(
        `🔄 Chain Switching: Loading xpub data from storage for ${targetChain}`,
      );
      const loaded = await loadChainFromStorage(targetChain, passwordBlob);

      if (!loaded) {
        console.log(
          `🔄 Chain Switching: Generating new chain data for ${targetChain}`,
        );
        await generateNewChainData(targetChain, passwordBlob);
      }
    }

    // Update active chain in Redux and storage
    store.dispatch(setActiveChain(targetChain));
    await localForage.setItem('activeChain', targetChain);

    // Load wallet names for the new chain
    loadWalletNamesForChain(targetChain).catch((error) => {
      console.error(
        `Failed to load wallet names for chain ${targetChain}:`,
        error,
      );
    });

    console.log(`✅ Chain Switching: Successfully switched to ${targetChain}`);
  } catch (error) {
    console.error(
      `❌ Chain Switching: Failed to switch to ${targetChain}:`,
      error,
    );
    throw error;
  }
}

/**
 * Load chain data when xpub wallet and key are already in Redux state
 */
async function loadExistingChainData(
  chainToSwitch: keyof cryptos,
): Promise<void> {
  const currentState = store.getState();
  const { xpubWallet, xpubKey } = currentState[chainToSwitch];

  // Restore stored wallets
  const generatedWallets: generatedWallets =
    (await localForage.getItem(`wallets-${chainToSwitch}`)) ?? {};
  const walletDerivations = Object.keys(generatedWallets);
  walletDerivations.forEach((derivation: string) => {
    setAddress(chainToSwitch, derivation, generatedWallets[derivation]);
  });

  const walInUse: string =
    (await localForage.getItem(`walletInUse-${chainToSwitch}`)) ?? '0-0';
  setWalletInUse(chainToSwitch, walInUse);

  // Load all chain data
  await loadChainStateData(chainToSwitch, walInUse);

  // Generate address if needed
  generateAddress(xpubWallet, xpubKey, chainToSwitch, walInUse);
}

/**
 * Load chain data from encrypted storage
 */
async function loadChainFromStorage(
  chainToSwitch: keyof cryptos,
  passwordBlob: string,
): Promise<boolean> {
  setChainInitialState(chainToSwitch);
  const blockchainConfig = blockchains[chainToSwitch];

  // Check if we have encrypted xpub data in secure storage
  const xpubEncrypted = secureLocalStorage.getItem(
    `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
      blockchainConfig.scriptType,
    )}-${blockchainConfig.id}`,
  );
  const xpub2Encrypted = secureLocalStorage.getItem(
    `2-xpub-48-${blockchainConfig.slip}-0-${getScriptType(
      blockchainConfig.scriptType,
    )}-${blockchainConfig.id}`,
  ); // key xpub

  if (xpubEncrypted && typeof xpubEncrypted === 'string') {
    const fingerprint: string = getFingerprint();
    const password = await passworderDecrypt(fingerprint, passwordBlob);
    if (typeof password !== 'string') {
      throw new Error('Invalid password');
    }

    const xpubChainWallet = await passworderDecrypt(password, xpubEncrypted);
    if (xpubChainWallet && typeof xpubChainWallet === 'string') {
      if (xpub2Encrypted && typeof xpub2Encrypted === 'string') {
        const xpubChainKey = await passworderDecrypt(password, xpub2Encrypted);

        if (xpubChainKey && typeof xpubChainKey === 'string') {
          // For sol chains, both xpubChainWallet and xpubChainKey are
          // JSON-stringified arrays of 20 base58 pubkeys, but Redux/storage
          // treat them identically as opaque strings — consumers JSON.parse
          // when needed (see generateMultisigAddress dispatch).
          setXpubWallet(chainToSwitch, xpubChainWallet);
          setXpubKey(chainToSwitch, xpubChainKey);

          // Load existing wallets and data
          const generatedWallets: generatedWallets =
            (await localForage.getItem(`wallets-${chainToSwitch}`)) ?? {};
          const walletDerivations = Object.keys(generatedWallets);
          walletDerivations.forEach((derivation: string) => {
            setAddress(chainToSwitch, derivation, generatedWallets[derivation]);
          });

          const walInUse: string =
            (await localForage.getItem(`walletInUse-${chainToSwitch}`)) ??
            '0-0';
          setWalletInUse(chainToSwitch, walInUse);

          // Load all chain data
          await loadChainStateData(chainToSwitch, walInUse);

          // Generate address
          generateAddress(
            xpubChainWallet,
            xpubChainKey,
            chainToSwitch,
            walInUse,
          );

          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Generate new chain data from wallet seed
 */
async function generateNewChainData(
  chainToSwitch: keyof cryptos,
  passwordBlob: string,
): Promise<void> {
  const blockchainConfig = blockchains[chainToSwitch];

  // Get wallet seed from secure storage
  const walSeedBlob = secureLocalStorage.getItem('walletSeed');
  const fingerprint: string = getFingerprint();
  const password = await passworderDecrypt(fingerprint, passwordBlob);
  if (typeof password !== 'string') {
    throw new Error('Invalid password');
  }
  if (!walSeedBlob || typeof walSeedBlob !== 'string') {
    throw new Error('Invalid wallet seed');
  }

  let walletSeed = await passworderDecrypt(password, walSeedBlob);
  if (typeof walletSeed !== 'string') {
    throw new Error('Invalid wallet seed decryption');
  }

  // Generate xpriv and xpub for the chain
  let xprivWallet = getMasterXpriv(
    walletSeed,
    48,
    blockchainConfig.slip,
    0,
    blockchainConfig.scriptType,
    chainToSwitch,
  );
  const xpubWallet = getMasterXpub(
    walletSeed,
    48,
    blockchainConfig.slip,
    0,
    blockchainConfig.scriptType,
    chainToSwitch,
  );

  // Clear sensitive data
  walletSeed = '';

  // For Solana chains the wallet's "xpub" is actually a JSON-stringified
  // array of 20 leaf Ed25519 pubkeys (Ed25519 has no non-hardened public-key
  // derivation; xpub alone is useless). Pre-derive now while xpriv is in
  // scope; storage layout reuses the existing xpub paths.
  // Consumer wallet has a single wallet per chain → typeIndex=0 (receiving
  // slot). Enterprise vaults pass vault.vaultIndex via a different code path
  // (EnterpriseVaultXpub) so each vault gets its own pubkey pool.
  let xpubWalletForChain = xpubWallet;
  if (blockchainConfig.chainType === 'sol') {
    const solanaPubkeys = generateSolanaPubkeyArray(
      xprivWallet,
      chainToSwitch,
      0,
    );
    xpubWalletForChain = JSON.stringify(solanaPubkeys);
  }

  // Encrypt and store xpriv and xpub
  const xprivBlob = await passworderEncrypt(password, xprivWallet);
  xprivWallet = '';
  const xpubBlob = await passworderEncrypt(password, xpubWalletForChain);

  secureLocalStorage.setItem(
    `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
      blockchainConfig.scriptType,
    )}-${blockchainConfig.id}`,
    xprivBlob,
  );
  secureLocalStorage.setItem(
    `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
      blockchainConfig.scriptType,
    )}-${blockchainConfig.id}`,
    xpubBlob,
  );

  // Set xpub in Redux (string for non-sol; JSON-stringified pubkey array for sol)
  setXpubWallet(chainToSwitch, xpubWalletForChain);

  // Load existing wallets and data
  const generatedWallets: generatedWallets =
    (await localForage.getItem(`wallets-${chainToSwitch}`)) ?? {};
  const walletDerivations = Object.keys(generatedWallets);
  walletDerivations.forEach((derivation: string) => {
    setAddress(chainToSwitch, derivation, generatedWallets[derivation]);
  });

  const walInUse: string =
    (await localForage.getItem(`walletInUse-${chainToSwitch}`)) ?? '0-0';
  setWalletInUse(chainToSwitch, walInUse);

  // Load all chain data
  await loadChainStateData(chainToSwitch, walInUse);
}

/**
 * Load all chain state data (transactions, balances, tokens, etc.)
 */
async function loadChainStateData(
  chainToSwitch: keyof cryptos,
  walInUse: string,
): Promise<void> {
  // Load transactions
  const txsWallet: transaction[] =
    (await localForage.getItem(`transactions-${chainToSwitch}-${walInUse}`)) ??
    [];

  // Load block height
  const blockheightChain: number =
    (await localForage.getItem(`blockheight-${chainToSwitch}`)) ?? 0;

  // Load balances
  const balancesWallet: balancesObj =
    (await localForage.getItem(`balances-${chainToSwitch}-${walInUse}`)) ??
    balancesObject;

  // Load token data (for EVM chains)
  const tokenBalances: tokenBalanceEVM[] =
    (await localForage.getItem(
      `token-balances-${chainToSwitch}-${walInUse}`,
    )) ?? [];
  const activatedTokens: string[] =
    (await localForage.getItem(
      `activated-tokens-${chainToSwitch}-${walInUse}`,
    )) ?? [];
  const importedTokens: Token[] =
    (await localForage.getItem(`imported-tokens-${chainToSwitch}`)) ?? [];

  // Load nodes (for Flux chains)
  const nodesWallet: node[] =
    (await localForage.getItem(`nodes-${chainToSwitch}-${walInUse}`)) ?? [];

  // Set all data in Redux
  if (importedTokens) {
    setImportedTokens(chainToSwitch, importedTokens || []);
  }
  if (activatedTokens) {
    setActivatedTokens(chainToSwitch, walInUse, activatedTokens || []);
  }
  if (tokenBalances) {
    setTokenBalances(chainToSwitch, walInUse, tokenBalances || []);
  }
  if (nodesWallet) {
    setNodes(chainToSwitch, walInUse, nodesWallet || []);
  }
  if (txsWallet) {
    setTransactions(chainToSwitch, walInUse, txsWallet || []);
  }
  if (balancesWallet) {
    setBalance(chainToSwitch, walInUse, balancesWallet.confirmed);
    setUnconfirmedBalance(chainToSwitch, walInUse, balancesWallet.unconfirmed);
  }
  if (blockheightChain) {
    setBlockheight(chainToSwitch, blockheightChain);
  }
}

/**
 * Generate address for the chain
 */
function generateAddress(
  xpubW: string,
  xpubK: string,
  chainToUse: keyof cryptos,
  walletToUse: string,
): void {
  try {
    if (!chainToUse || !xpubK || !xpubW) {
      console.log('Missing data for address generation');
      return;
    }

    const splittedDerPath = walletToUse.split('-');
    const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
    const addressIndex = Number(splittedDerPath[1]);
    const addrInfo = generateMultisigAddress(
      xpubW,
      xpubK,
      typeIndex,
      addressIndex,
      chainToUse,
    );

    setAddress(chainToUse, walletToUse, addrInfo.address);
    setRedeemScript(chainToUse, walletToUse, addrInfo.redeemScript ?? '');
    setWitnessScript(chainToUse, walletToUse, addrInfo.witnessScript ?? '');

    // Store generated wallet
    void (async function () {
      const generatedWallets: generatedWallets =
        (await localForage.getItem('wallets-' + chainToUse)) ?? {};
      generatedWallets[walletToUse] = addrInfo.address;
      await localForage.setItem('wallets-' + chainToUse, generatedWallets);
    })();
  } catch (error) {
    console.error('Error generating address:', error);
    throw error;
  }
}
