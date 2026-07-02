// Trustless Solana enterprise-vault decode wrapper.
//
// Maps the byte-level decoder from '@runonflux/solana-multisig' onto the
// wallet's VaultDecodedTx display type and compares the byte-truth against
// the relay-supplied display payload.
//
// SAFETY CONTRACT:
//  - NEVER throws / rejects — any failure maps to kind 'undecodable' with the
//    error message inside decoded.error (never-strand-funds: the sign screen
//    must always render).
//  - kind 'create' + mismatch=true means the bytes CONTRADICT the relay
//    payload — an active-attack indicator the caller must HARD-BLOCK on.
//  - kind 'approve' cannot verify amounts from bytes (no create_transaction
//    instruction); mismatch=true fires only when the outer instructions stray
//    outside the allowlist (leaf-key-drain guard).
//  - kind 'undecodable' is a degradation state: mismatch stays false so the
//    caller warns without blocking.

import { blockchains } from '@storage/blockchains';
import type { VaultDecodedTx } from './transactions';
import type { cryptos } from '../types';

export interface VaultSolExpectedPayload {
  recipients: Array<{ address: string; amount: string }>;
  tokenMint?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

export interface VaultSolDecodeResult {
  decoded: VaultDecodedTx;
  mismatch: boolean;
  mismatchReasons: string[];
  kind: 'create' | 'approve' | 'undecodable';
}

/**
 * Decode a raw base64 Solana enterprise-vault transaction (bundled or split)
 * and compare it against the relay-supplied display payload.
 *
 * Dynamic imports keep @solana/web3.js off the hot path (same pattern as
 * constructTx.ts).
 */
export async function decodeVaultSolTransaction(
  rawUnsignedTxBase64: string,
  chain: keyof cryptos,
  expected: VaultSolExpectedPayload,
): Promise<VaultSolDecodeResult> {
  try {
    const [
      {
        decodeVaultSolanaTransaction,
        compareDecodedToExpected,
        deriveAssociatedTokenAddress,
        TOKEN_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID,
      },
      { PublicKey },
    ] = await Promise.all([
      import('@runonflux/solana-multisig'),
      import('@solana/web3.js'),
    ]);

    const programIdBase58 = blockchains[chain]?.programId;
    if (!programIdBase58) {
      throw new Error(`Chain ${chain} has no programId in spec`);
    }
    const programId = new PublicKey(programIdBase58);

    const decoded = decodeVaultSolanaTransaction(
      rawUnsignedTxBase64,
      programId,
      {
        // ATA -> owner resolution: SPL proposal records carry the recipient
        // OWNER address while the bytes carry the destination ATA.
        expectedRecipientOwner: expected.tokenMint
          ? expected.recipients[0]?.address
          : undefined,
        expectedMint: expected.tokenMint,
      },
    );

    if (decoded.kind === 'undecodable') {
      return {
        decoded: {
          sender: '',
          recipients: [],
          fee: '0',
          error: decoded.error,
        },
        mismatch: false,
        mismatchReasons: [],
        kind: 'undecodable',
      };
    }

    // Multi-recipient SPL proposals: the decoder resolves ATAs against a
    // single owner (recipients[0]); resolve any remaining unverified SPL
    // recipients against the other expected owners so a legitimate
    // multi-recipient send does not false-positive the mismatch hard-block.
    if (decoded.kind === 'create' && expected.tokenMint) {
      const mint = new PublicKey(expected.tokenMint);
      for (const r of decoded.recipients) {
        if (r.asset !== 'spl' || !r.ata || r.ataVerified) continue;
        for (const exp of expected.recipients) {
          try {
            const owner = new PublicKey(exp.address);
            if (
              deriveAssociatedTokenAddress(
                owner,
                mint,
                TOKEN_PROGRAM_ID,
              ).toBase58() === r.ata ||
              deriveAssociatedTokenAddress(
                owner,
                mint,
                TOKEN_2022_PROGRAM_ID,
              ).toBase58() === r.ata
            ) {
              r.address = exp.address;
              r.ataVerified = true;
              break;
            }
          } catch {
            // invalid expected address — cannot derive, try the next one
          }
        }
      }
    }

    const comparison = compareDecodedToExpected(decoded, {
      recipients: expected.recipients,
      tokenMint: expected.tokenMint,
    });

    if (decoded.kind === 'approve') {
      // Split-flow subsequent-signer tx: recipients/amounts live in the
      // on-chain proposal account (created and byte-verified by the first
      // signer) — not re-verifiable from these bytes. Display the proposal
      // record honestly; the outer-instruction allowlist is still enforced.
      return {
        decoded: {
          sender: '',
          recipients: expected.recipients.map((r) => ({
            address: r.address,
            amount: r.amount,
          })),
          fee: '0',
          ...(expected.tokenMint
            ? {
                tokenContract: expected.tokenMint,
                tokenSymbol: expected.tokenSymbol,
                tokenDecimals: expected.tokenDecimals,
              }
            : {}),
        },
        mismatch: !comparison.ok,
        mismatchReasons: comparison.mismatches,
        kind: 'approve',
      };
    }

    // kind 'create' — byte-decoded recipients/amounts are authoritative.
    const splRecipient = decoded.recipients.find((r) => r.asset === 'spl');
    const isToken = !!splRecipient || !!expected.tokenMint;
    return {
      decoded: {
        sender: decoded.sender,
        recipients: decoded.recipients.map((r) => ({
          address: r.address,
          amount: r.amount,
        })),
        fee: decoded.feeLamports,
        ...(isToken
          ? {
              tokenContract: splRecipient?.mint ?? expected.tokenMint,
              // decimals from bytes (TransferChecked); legacy Transfer carries
              // none on the wire — fall back to the relay-supplied value.
              tokenDecimals: splRecipient?.decimals ?? expected.tokenDecimals,
              tokenSymbol: expected.tokenSymbol,
            }
          : {}),
      },
      mismatch: !comparison.ok,
      mismatchReasons: comparison.mismatches,
      kind: 'create',
    };
  } catch (error) {
    return {
      decoded: {
        sender: '',
        recipients: [],
        fee: '0',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to decode Solana transaction',
      },
      mismatch: false,
      mismatchReasons: [],
      kind: 'undecodable',
    };
  }
}
