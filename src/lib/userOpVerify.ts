/**
 * On-device binding checks for EVM vault signing (wallet side).
 *
 * Enterprise vault proposals arrive from the relay as { evmUserOp, rawUnsignedTx }
 * (a transaction) or { signMessage, rawUnsignedTx } (a personal_sign). The
 * approval UI decodes and DISPLAYS evmUserOp / signMessage, but the Schnorr
 * sign consumes rawUnsignedTx — an opaque hash the wallet does not otherwise
 * recompute. Without a binding check a compromised relay could show a benign
 * operation while the wallet co-signs a vault-draining one.
 *
 * These recompute the signed hash from what was DISPLAYED using the exact same
 * primitives the honest wallet builds with (getUserOperationHash at
 * constructTx.ts:1291 for txs, viem hashMessage / EIP-191 for messages), so a
 * legitimate proposal always matches. Fail closed on any error.
 */
import { hashMessage } from 'viem';
import { entryPointRegistry } from '@alchemy/aa-core';
import type { UserOperationRequest } from '@alchemy/aa-core';
import { blockchains } from '@storage/blockchains';
import type { cryptos } from '../types';

/** Recompute the ERC-4337 v0.6 UserOp hash from the displayed operation. */
function computeUserOpHash(
  userOpRequest: unknown,
  chain: keyof cryptos,
): string {
  const blockchainConfig = blockchains[chain];
  const entryPoint = blockchainConfig?.entrypointAddress;
  const chainId = blockchainConfig?.chainId;
  if (!entryPoint || !chainId) {
    throw new Error(`Chain ${chain} has no account-abstraction config`);
  }
  return entryPointRegistry['0.6.0'].getUserOperationHash(
    userOpRequest as UserOperationRequest<'0.6.0'>,
    entryPoint as `0x${string}`,
    Number(chainId),
  );
}

/** True iff rawUnsignedTx equals the hash of the displayed UserOp. */
export function userOpHashMatches(
  userOpRequest: unknown,
  chain: keyof cryptos,
  claimedHash: unknown,
): boolean {
  try {
    if (typeof claimedHash !== 'string' || !claimedHash) return false;
    return (
      computeUserOpHash(userOpRequest, chain).toLowerCase() ===
      claimedHash.toLowerCase()
    );
  } catch (error) {
    console.log('[userOpVerify] hash computation failed', error);
    return false;
  }
}

/** True iff rawUnsignedTx equals the EIP-191 hash of the displayed message. */
export function messageDigestMatches(
  message: unknown,
  claimedDigest: unknown,
): boolean {
  try {
    if (typeof claimedDigest !== 'string' || !claimedDigest) return false;
    if (typeof message !== 'string') return false;
    return hashMessage(message).toLowerCase() === claimedDigest.toLowerCase();
  } catch (error) {
    console.log('[userOpVerify] message digest computation failed', error);
    return false;
  }
}
