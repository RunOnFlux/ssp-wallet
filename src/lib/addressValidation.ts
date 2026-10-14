import utxolib from '@runonflux/utxo-lib';
import { isAddress as isEvmAddress } from 'viem';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';
import { isValidKasAddress } from './kaspa';

export type AddressValidationResult = {
  valid: boolean;
  // When the address itself is invalid for the active chain but appears to be
  // a well-formed address of a DIFFERENT chain type, we surface a soft warning
  // so the user can catch a wrong-network paste before signing.
  warningChainType?: 'evm' | 'sol' | 'utxo' | 'kas';
};

/**
 * Validate an EVM (0x + 40 hex) address with EIP-55 checksum enforcement.
 * viem's strict mode accepts all-lowercase / all-uppercase (no checksum
 * present) and a correctly checksummed mixed-case address, while rejecting a
 * mixed-case address whose checksum is wrong — exactly the EIP-55 contract.
 */
export function isValidEvmAddress(address: string): boolean {
  try {
    return isEvmAddress(address, { strict: true });
  } catch {
    return false;
  }
}

/**
 * Validate a Solana address (base58, 32-byte public key). We avoid importing
 * the heavy @solana/web3.js bundle here; a base58 decode to 32 bytes is the
 * canonical check and keeps this util lightweight for the send forms.
 */
export function isValidSolAddress(address: string): boolean {
  // A base58 alphabet check plus length bounds. Solana addresses are 32-byte
  // public keys which encode to 32-44 base58 characters. This keeps the util
  // lightweight (no @solana/web3.js import) for use in the send forms.
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Validate a UTXO receiver address for a specific chain using utxo-lib. The
 * library throws when an address does not decode to a valid output script for
 * the supplied network (covers base58check P2PKH/P2SH and bech32 SegWit).
 */
export function isValidUtxoAddress(
  address: string,
  chain: keyof cryptos,
): boolean {
  try {
    const blockchainConfig = blockchains[chain];
    const network = utxolib.networks[blockchainConfig.libid];
    if (!network) {
      return false;
    }
    utxolib.address.toOutputScript(address, network);
    return true;
  } catch {
    return false;
  }
}

/**
 * Chain-aware receiver-address validation used by the send forms. Returns
 * whether the address is valid for the active chain, plus an optional
 * warning when the address looks like it belongs to a different chain type
 * (e.g. an EVM address pasted into a Bitcoin send).
 */
export function validateReceiverAddress(
  address: string,
  chain: keyof cryptos,
): AddressValidationResult {
  const trimmed = address.trim();
  if (!trimmed) {
    return { valid: false };
  }

  const blockchainConfig = blockchains[chain];
  const chainType = blockchainConfig?.chainType;

  const looksEvm = /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  const looksSol = isValidSolAddress(trimmed) && !looksEvm;
  // Kaspa addresses always carry their network prefix (kaspa:q… / kaspa:p…),
  // so a cheap prefix check is enough for the wrong-network hint. Validation
  // proper goes through kaspa-core below.
  const looksKas = /^kaspa(test|sim|dev)?:[a-z0-9]{40,}$/i.test(trimmed);

  if (chainType === 'kas') {
    if (isValidKasAddress(trimmed, chain)) {
      return { valid: true };
    }
    if (looksEvm) {
      return { valid: false, warningChainType: 'evm' };
    }
    if (looksSol) {
      return { valid: false, warningChainType: 'sol' };
    }
    return { valid: false };
  }

  if (chainType === 'evm') {
    if (isValidEvmAddress(trimmed)) {
      return { valid: true };
    }
    // Not a valid EVM address — hint if it looks like another chain type.
    if (looksSol) {
      return { valid: false, warningChainType: 'sol' };
    }
    if (looksKas) {
      return { valid: false, warningChainType: 'kas' };
    }
    return { valid: false };
  }

  if (chainType === 'sol') {
    if (isValidSolAddress(trimmed)) {
      return { valid: true };
    }
    if (looksEvm) {
      return { valid: false, warningChainType: 'evm' };
    }
    if (looksKas) {
      return { valid: false, warningChainType: 'kas' };
    }
    return { valid: false };
  }

  // UTXO chains (default)
  if (isValidUtxoAddress(trimmed, chain)) {
    return { valid: true };
  }
  if (looksEvm) {
    return { valid: false, warningChainType: 'evm' };
  }
  if (looksSol) {
    return { valid: false, warningChainType: 'sol' };
  }
  if (looksKas) {
    return { valid: false, warningChainType: 'kas' };
  }
  return { valid: false };
}

/**
 * The receiver address inside a scanned QR payload. Payloads may be a bare
 * address or a chain URI ("bitcoin:<address>?amount=…",
 * "ethereum:<address>@1?value=…"), whose scheme is dropped. For Kaspa the
 * `kaspa:` prefix IS part of the address, so only a query string or fragment
 * is dropped; an all-uppercase payload (QR alphanumeric mode) is lowercased.
 */
export function addressFromScannedQr(
  value: string,
  chainType: string | undefined,
): string {
  let scanned = value.trim();
  if (chainType === 'kas') {
    scanned = scanned.split(/[?#]/)[0];
    if (scanned === scanned.toUpperCase()) scanned = scanned.toLowerCase();
    return scanned;
  }
  const schemeMatch = scanned.match(/^[a-zA-Z]+:([^@?]+)/);
  return schemeMatch ? schemeMatch[1] : scanned;
}
