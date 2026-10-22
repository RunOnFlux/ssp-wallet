// Trustless Solana enterprise-vault decode wrapper.
//
// Maps the byte-level decoder from '@runonflux/solana-multisig' onto the
// wallet's VaultDecodedTx display type and compares the byte-truth against
// the relay-supplied display payload.
//
// SAFETY CONTRACT (fail closed — H-13 / H-14, SOL-3/4/5, CHN-3/4):
//  - NEVER throws / rejects — any failure maps to a result whose
//    decoded.error is set. The caller MUST disable signing whenever
//    decoded.error is set or mismatch is true.
//  - kind 'create' + mismatch=true means the bytes CONTRADICT the relay
//    payload — an active-attack indicator.
//  - kind 'undecodable' is BLOCKED (decoded.error set): bytes this device
//    cannot read are never signed.
//  - kind 'approve' (split flow) carries no proposal message, so the wrapper
//    fetches the on-chain VaultTransaction at the approve target, decodes its
//    stored message with the SAME decoder and compares it to the payload.
//    If that is impossible the approval is refused (decoded.error set).
//  - Legacy SPL Transfer (tag 3) is refused; token decimals come only from the
//    signed TransferChecked bytes, the symbol only from this device's token
//    list keyed by mint, and the mint is always returned for display.

import { Buffer } from 'buffer';
import { blockchains } from '@storage/blockchains';
import { backends } from '@storage/backends';
import type { VaultDecodedTx } from './transactions';
import type { cryptos } from '../types';

/**
 * Hard ceiling (lamports) on the vault->paymaster fee reimbursement the wallet
 * accepts without hard-blocking. The relay is untrusted, so this independently
 * bounds any fee-routed vault drain regardless of what the relay claims; a
 * legitimate paymaster fee (proposal + ATA rent + network fees) is well under
 * it. The exact decoded fee is still surfaced to the user. Tunable — 0.05 SOL.
 */
const SOL_VAULT_MAX_FEE_LAMPORTS = '50000000';

/** Anchor account discriminator of `VaultTransaction` (IDL). */
const VAULT_TRANSACTION_DISCRIMINATOR = [168, 250, 162, 100, 81, 14, 162, 207];

// ---------------------------------------------------------------------------
// Outer ComputeBudget allowlist (Solana mainnet priority fee)
//
// The relay's mainnet builder adds SetComputeUnitLimit + SetComputeUnitPrice
// next to nonceAdvance. SDK 0.12.0's decoder does not know them and reports
// each as an unknown outer program, which refused every mainnet bundle. They
// are exempted ONLY after the exact signing bytes are parsed here — the same
// shapes and caps as relay-enterprise `verifyOuterComputeBudget()`:
//  - each instruction is SetComputeUnitLimit (tag 2, 5 bytes) or
//    SetComputeUnitPrice (tag 3, 9 bytes) and takes no accounts;
//  - at most one of each, never at instruction[0] (durable nonce slot);
//  - unit limit <= 1,400,000, price <= 1,000,000 microlamports/CU, and the
//    total priority fee <= 50,000 lamports;
//  - the verified count equals exactly what the decoder flagged.
// Outer Memo and every other unknown program stay refused.
// ---------------------------------------------------------------------------

export const COMPUTE_BUDGET_PROGRAM_ID_BASE58 =
  'ComputeBudget111111111111111111111111111111';
const COMPUTE_BUDGET_SET_UNIT_LIMIT_TAG = 2;
const COMPUTE_BUDGET_SET_UNIT_PRICE_TAG = 3;
/** Solana's per-transaction compute unit maximum. */
export const SOL_MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
export const SOL_MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1_000_000n;
export const SOL_MAX_PRIORITY_FEE_LAMPORTS = 50_000n;

function readU32Le(data: Uint8Array, offset: number): number {
  return (
    data[offset] +
    data[offset + 1] * 0x100 +
    data[offset + 2] * 0x10000 +
    data[offset + 3] * 0x1000000
  );
}

function readU64Le(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) {
    value = (value << 8n) | BigInt(data[offset + i]);
  }
  return value;
}

/**
 * Verify the OUTER ComputeBudget instructions of the exact signing bytes.
 * Returns how many were verified. Never throws.
 */
export function verifyOuterComputeBudget(
  unsignedTxBase64: string,
  web3: Pick<Web3Module, 'Transaction'>,
): { ok: true; count: number } | { ok: false; error: string } {
  let tx: InstanceType<Web3Module['Transaction']>;
  try {
    tx = web3.Transaction.from(Buffer.from(unsignedTxBase64, 'base64'));
  } catch (error) {
    return {
      ok: false,
      error: `transaction bytes are not parseable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  let count = 0;
  let limitCount = 0;
  let priceCount = 0;
  // Without an explicit limit the runtime may bill up to the per-tx maximum.
  let units = BigInt(SOL_MAX_COMPUTE_UNIT_LIMIT);
  let price = 0n;
  for (let i = 0; i < tx.instructions.length; i++) {
    const ix = tx.instructions[i];
    if (ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID_BASE58) continue;
    if (i === 0) {
      return {
        ok: false,
        error:
          'ComputeBudget instruction at instruction[0] (must be nonceAdvance)',
      };
    }
    if (ix.keys.length !== 0) {
      return {
        ok: false,
        error: 'ComputeBudget instruction must not take accounts',
      };
    }
    const data = new Uint8Array(ix.data);
    const tag = data.length > 0 ? data[0] : -1;
    if (tag === COMPUTE_BUDGET_SET_UNIT_LIMIT_TAG && data.length === 5) {
      limitCount++;
      const requested = readU32Le(data, 1);
      if (requested > SOL_MAX_COMPUTE_UNIT_LIMIT) {
        return {
          ok: false,
          error: `ComputeBudget unit limit ${requested} exceeds ${SOL_MAX_COMPUTE_UNIT_LIMIT}`,
        };
      }
      units = BigInt(requested);
    } else if (tag === COMPUTE_BUDGET_SET_UNIT_PRICE_TAG && data.length === 9) {
      priceCount++;
      price = readU64Le(data, 1);
      if (price > SOL_MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS) {
        return {
          ok: false,
          error: `ComputeBudget unit price ${price} exceeds ${SOL_MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS} microlamports/CU`,
        };
      }
    } else {
      return { ok: false, error: 'non-allowlisted ComputeBudget instruction' };
    }
    count++;
  }
  if (limitCount > 1 || priceCount > 1) {
    return { ok: false, error: 'duplicate ComputeBudget instruction' };
  }
  const feeLamports = (units * price + 999_999n) / 1_000_000n;
  if (feeLamports > SOL_MAX_PRIORITY_FEE_LAMPORTS) {
    return {
      ok: false,
      error: `ComputeBudget priority fee ${feeLamports} lamports exceeds the ${SOL_MAX_PRIORITY_FEE_LAMPORTS} lamport cap`,
    };
  }
  return { ok: true, count };
}

/**
 * Drop the decoder's ComputeBudget entries from `unknownOuterPrograms` only
 * when the byte parse verified exactly that many allowlisted instructions.
 * Any disagreement keeps them all (and reports why).
 */
function exemptVerifiedComputeBudget(
  unknownOuterPrograms: string[],
  unsignedTxBase64: string,
  web3: Pick<Web3Module, 'Transaction'>,
): { programs: string[]; error?: string } {
  const flagged = unknownOuterPrograms.filter(
    (p) => p === COMPUTE_BUDGET_PROGRAM_ID_BASE58,
  ).length;
  if (flagged === 0) return { programs: unknownOuterPrograms };
  const budget = verifyOuterComputeBudget(unsignedTxBase64, web3);
  if (budget.ok && budget.count === flagged) {
    return {
      programs: unknownOuterPrograms.filter(
        (p) => p !== COMPUTE_BUDGET_PROGRAM_ID_BASE58,
      ),
    };
  }
  return {
    programs: unknownOuterPrograms,
    error: `ComputeBudget instruction(s) not allowed: ${
      budget.ok
        ? `verified ${budget.count} but the decoder flagged ${flagged}`
        : budget.error
    }`,
  };
}

export interface VaultSolExpectedPayload {
  recipients: Array<{ address: string; amount: string }>;
  tokenMint?: string;
}

export interface VaultSolDecodeResult {
  /** decoded.error set => signing MUST be refused. */
  decoded: VaultDecodedTx;
  /** The signed bytes contradict the relay payload (attack indicator). */
  mismatch: boolean;
  mismatchReasons: string[];
  kind: 'create' | 'approve' | 'undecodable';
  /**
   * approve only: recipients/amounts were read from the on-chain proposal at
   * the approve target and verified on this device.
   */
  verifiedOnChain?: boolean;
  /**
   * The multisig PDA the signed bytes act on (create and approve). Compared
   * against the PDA derived from the pinned vault descriptor (VD-4).
   */
  multisigPda?: string;
}

/** Attach a ComputeBudget refusal reason (the bytes stay blocked). */
function withBudgetReason(
  result: VaultSolDecodeResult,
  budgetError: string | undefined,
): VaultSolDecodeResult {
  if (!budgetError) return result;
  return {
    ...result,
    mismatch: true,
    mismatchReasons: [...result.mismatchReasons, budgetError],
  };
}

/** Fetch a Solana account (owner + raw data); null when it does not exist. */
export type SolAccountFetcher = (
  address: string,
) => Promise<{ owner: string; data: Uint8Array } | null>;

type SdkModule = typeof import('@runonflux/solana-multisig');
type Web3Module = typeof import('@solana/web3.js');
type DecodedAny = ReturnType<SdkModule['decodeVaultSolanaTransaction']>;
type DecodedCreate = Extract<DecodedAny, { kind: 'create' }>;
type DecodedApprove = Extract<DecodedAny, { kind: 'approve' }>;

function blocked(
  kind: VaultSolDecodeResult['kind'],
  error: string,
  mismatchReasons: string[] = [],
): VaultSolDecodeResult {
  return {
    decoded: { sender: '', recipients: [], fee: '0', error },
    mismatch: mismatchReasons.length > 0,
    mismatchReasons,
    kind,
  };
}

async function defaultFetchAccount(
  chain: keyof cryptos,
  address: string,
): Promise<{ owner: string; data: Uint8Array } | null> {
  const { Connection, PublicKey } = await import('@solana/web3.js');
  const connection = new Connection(`https://${backends()[chain].node}`, {
    commitment: 'confirmed',
  });
  const info = await connection.getAccountInfo(new PublicKey(address));
  if (!info) return null;
  return { owner: info.owner.toBase58(), data: new Uint8Array(info.data) };
}

/** Strict little-endian reader over a proposal account's bytes. */
class Reader {
  offset = 0;
  private readonly buf: Uint8Array;

  constructor(buf: Uint8Array) {
    this.buf = buf;
  }

  private ensure(n: number) {
    if (n < 0 || this.offset + n > this.buf.length) {
      throw new Error('on-chain proposal data is truncated');
    }
  }

  u8(): number {
    this.ensure(1);
    return this.buf[this.offset++];
  }

  u32(): number {
    this.ensure(4);
    const b = this.buf;
    const o = this.offset;
    this.offset += 4;
    return b[o] + b[o + 1] * 0x100 + b[o + 2] * 0x10000 + b[o + 3] * 0x1000000;
  }

  u64(): bigint {
    this.ensure(8);
    let v = 0n;
    for (let i = 7; i >= 0; i--) {
      v = (v << 8n) | BigInt(this.buf[this.offset + i]);
    }
    this.offset += 8;
    return v;
  }

  bytes(n: number): Uint8Array {
    this.ensure(n);
    const out = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  skip(n: number) {
    this.ensure(n);
    this.offset += n;
  }
}

export interface ParsedVaultProposal {
  multisig: Uint8Array;
  transactionIndex: bigint;
  creator: Uint8Array;
  payer: Uint8Array;
  vaultIndex: number;
  executed: boolean;
  /** Exact Borsh bytes of the stored TransactionMessage. */
  message: Uint8Array;
}

/** Parse a VaultTransaction account (layout: programs/solana-multisig lib.rs). */
export function parseVaultTransactionAccount(
  data: Uint8Array,
): ParsedVaultProposal {
  const r = new Reader(data);
  const disc = r.bytes(8);
  if (!VAULT_TRANSACTION_DISCRIMINATOR.every((b, i) => disc[i] === b)) {
    throw new Error('account is not a VaultTransaction');
  }
  const multisig = r.bytes(32);
  const transactionIndex = r.u64();
  const creator = r.bytes(32);
  const payer = r.bytes(32);
  r.u8(); // bump
  const vaultIndex = r.u8();
  r.u8(); // vault_bump
  const executedByte = r.u8();
  if (executedByte > 1) throw new Error('invalid executed flag');
  const approvals = r.u32();
  if (approvals > 30) throw new Error('invalid approvals length');
  r.skip(approvals * 32);
  // TransactionMessage — walk it to find its exact end.
  const messageStart = r.offset;
  r.u8(); // num_signers
  r.u8(); // num_writable_signers
  r.u8(); // num_writable_non_signers
  const keyCount = r.u32();
  if (keyCount > 128) throw new Error('invalid account_keys length');
  r.skip(keyCount * 32);
  const ixCount = r.u32();
  if (ixCount > 16) throw new Error('invalid instructions length');
  for (let i = 0; i < ixCount; i++) {
    r.u8(); // program_id_index
    r.skip(r.u32()); // account_indexes
    r.skip(r.u32()); // data
  }
  const altCount = r.u32();
  if (altCount > 4) throw new Error('invalid address_table_lookups length');
  for (let i = 0; i < altCount; i++) {
    r.skip(32);
    r.skip(r.u32());
    r.skip(r.u32());
  }
  return {
    multisig,
    transactionIndex,
    creator,
    payer,
    vaultIndex,
    executed: executedByte === 1,
    message: data.subarray(messageStart, r.offset),
  };
}

/**
 * Map a byte-decoded create (bundle or on-chain proposal) onto the display
 * type, enforcing the token rules. Pushes any violation into `reasons`.
 */
function mapCreate(
  decoded: DecodedCreate,
  chain: keyof cryptos,
  reasons: string[],
): VaultDecodedTx {
  const spl = decoded.recipients.filter((r) => r.asset === 'spl');
  const native = decoded.recipients.filter((r) => r.asset === 'native');
  if (spl.some((r) => !r.mint || r.decimals === undefined)) {
    reasons.push(
      'legacy SPL Transfer (no mint or decimals in the signed bytes) is refused',
    );
  }
  if (spl.length > 0 && native.length > 0) {
    reasons.push('mixed SOL and token transfers are not supported');
  }
  const mints = [
    ...new Set(spl.map((r) => r.mint).filter((m): m is string => !!m)),
  ];
  if (mints.length > 1) {
    reasons.push('transfers of more than one token mint are not supported');
  }
  const decimalsSet = [
    ...new Set(
      spl.map((r) => r.decimals).filter((d): d is number => d !== undefined),
    ),
  ];
  if (decimalsSet.length > 1) {
    reasons.push('inconsistent token decimals in the signed bytes');
  }
  for (const r of spl) {
    if (r.ataVerified !== true) {
      reasons.push(
        `token account ${r.ata ?? r.address} does not belong to the displayed recipient`,
      );
    }
  }

  const base: VaultDecodedTx = {
    sender: decoded.sender,
    recipients: decoded.recipients.map((r) => ({
      address: r.address,
      amount: r.amount,
    })),
    fee: decoded.feeLamports,
  };
  if (spl.length === 0) {
    return base;
  }
  const mint = mints[0];
  const known = mint
    ? blockchains[chain]?.tokens.find((t) => t.contract === mint)
    : undefined;
  return {
    ...base,
    tokenContract: mint,
    // Decimals ONLY from the TransferChecked bytes (the token program rejects
    // a mismatch on-chain); never from the relay payload.
    tokenDecimals: decimalsSet.length === 1 ? decimalsSet[0] : undefined,
    // Symbol ONLY from this device's own token list keyed by mint.
    tokenSymbol: known?.symbol,
    tokenVerified: !!known,
  };
}

/** Resolve unverified SPL recipients against every expected owner. */
function resolveMultiRecipientAtas(
  decoded: DecodedCreate,
  expected: VaultSolExpectedPayload,
  sdk: SdkModule,
  web3: Web3Module,
) {
  if (!expected.tokenMint) return;
  let mint: InstanceType<Web3Module['PublicKey']>;
  try {
    mint = new web3.PublicKey(expected.tokenMint);
  } catch {
    return;
  }
  for (const r of decoded.recipients) {
    if (r.asset !== 'spl' || !r.ata || r.ataVerified) continue;
    for (const exp of expected.recipients) {
      try {
        const owner = new web3.PublicKey(exp.address);
        if (
          sdk
            .deriveAssociatedTokenAddress(owner, mint, sdk.TOKEN_PROGRAM_ID)
            .toBase58() === r.ata ||
          sdk
            .deriveAssociatedTokenAddress(
              owner,
              mint,
              sdk.TOKEN_2022_PROGRAM_ID,
            )
            .toBase58() === r.ata
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

function u64Le(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/**
 * Approve-only (split flow): fetch the VaultTransaction at the approve target,
 * check it belongs to the approved multisig and is still open, rebuild a
 * create_transaction from its STORED message and run it through the same
 * decoder + comparison as a bundled create.
 */
async function verifyApproveOnChain(
  rawUnsignedTxBase64: string,
  approve: DecodedApprove,
  chain: keyof cryptos,
  expected: VaultSolExpectedPayload,
  programId: InstanceType<Web3Module['PublicKey']>,
  sdk: SdkModule,
  web3: Web3Module,
  fetchAccount: SolAccountFetcher,
): Promise<VaultSolDecodeResult> {
  if (approve.unknownOuterPrograms.length > 0) {
    // Leaf-key-drain guard: never sign foreign outer instructions.
    const reason = `unknown outer program instruction(s): ${approve.unknownOuterPrograms.join(', ')}`;
    return blocked('approve', reason, [reason]);
  }
  const targets = [...new Set(approve.approveTargets)];
  if (targets.length !== 1) {
    const reason =
      'approve_transaction instructions target different proposals';
    return blocked('approve', reason, [reason]);
  }
  const target = targets[0];

  let account: { owner: string; data: Uint8Array } | null;
  try {
    account = await fetchAccount(target);
  } catch (error) {
    return blocked(
      'approve',
      `Could not fetch the on-chain proposal to verify this approval: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!account) {
    return blocked(
      'approve',
      'The proposal this approval targets does not exist on-chain — refused',
    );
  }
  if (account.owner !== programId.toBase58()) {
    const reason =
      'approve target account is not owned by the multisig program';
    return blocked('approve', reason, [reason]);
  }

  let proposal: ParsedVaultProposal;
  try {
    proposal = parseVaultTransactionAccount(account.data);
  } catch (error) {
    return blocked(
      'approve',
      `On-chain proposal could not be decoded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const multisig = new web3.PublicKey(proposal.multisig);
  if (multisig.toBase58() !== approve.multisigPda) {
    const reason = 'on-chain proposal belongs to a different multisig';
    return blocked('approve', reason, [reason]);
  }
  if (proposal.executed) {
    return blocked('approve', 'The on-chain proposal was already executed');
  }
  const [derived] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from('transaction'),
      multisig.toBuffer(),
      Buffer.from(u64Le(proposal.transactionIndex)),
    ],
    programId,
  );
  if (derived.toBase58() !== target) {
    const reason = 'approve target does not match the derived proposal address';
    return blocked('approve', reason, [reason]);
  }

  // Rebuild a create_transaction instruction carrying the STORED message and
  // decode it exactly like a bundled create. The fee payer stays the one of
  // the approval being signed, so vault->paymaster reimbursements bucket as
  // fees (bounded below) and anything else must be an expected recipient.
  let approveTx: InstanceType<Web3Module['Transaction']>;
  try {
    approveTx = web3.Transaction.from(
      Buffer.from(rawUnsignedTxBase64, 'base64'),
    );
  } catch {
    return blocked('approve', 'Approval transaction could not be parsed');
  }
  if (!approveTx.feePayer) {
    return blocked('approve', 'Approval transaction has no fee payer');
  }
  const ixData = Buffer.alloc(9 + proposal.message.length);
  ixData.set(sdk.CREATE_TRANSACTION_DISCRIMINATOR, 0);
  ixData[8] = proposal.vaultIndex;
  ixData.set(proposal.message, 9);
  const synthetic = new web3.Transaction();
  synthetic.feePayer = approveTx.feePayer;
  synthetic.recentBlockhash =
    approveTx.recentBlockhash ?? web3.PublicKey.default.toBase58();
  synthetic.add(
    new web3.TransactionInstruction({
      programId,
      keys: [
        { pubkey: multisig, isSigner: false, isWritable: true },
        { pubkey: derived, isSigner: false, isWritable: true },
        {
          pubkey: new web3.PublicKey(proposal.creator),
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: new web3.PublicKey(proposal.payer),
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: web3.SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      data: ixData,
    }),
  );
  let syntheticBase64: string;
  try {
    syntheticBase64 = synthetic
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64');
  } catch {
    return blocked(
      'approve',
      'On-chain proposal is too large to verify on this device — refused',
    );
  }
  const decoded = sdk.decodeVaultSolanaTransaction(syntheticBase64, programId, {
    expectedRecipientOwner: expected.tokenMint
      ? expected.recipients[0]?.address
      : undefined,
    expectedMint: expected.tokenMint,
  });
  if (decoded.kind !== 'create') {
    return blocked(
      'approve',
      `On-chain proposal could not be decoded: ${
        decoded.kind === 'undecodable' ? decoded.error : decoded.kind
      }`,
    );
  }
  resolveMultiRecipientAtas(decoded, expected, sdk, web3);

  const comparison = sdk.compareDecodedToExpected(decoded, {
    recipients: expected.recipients,
    tokenMint: expected.tokenMint,
    maxFeeLamports: SOL_VAULT_MAX_FEE_LAMPORTS,
    expectedTransactionPda: target,
  });
  const reasons = [...comparison.mismatches];
  const mapped = mapCreate(decoded, chain, reasons);
  return {
    decoded: mapped,
    mismatch: reasons.length > 0,
    mismatchReasons: reasons,
    kind: 'approve',
    verifiedOnChain: reasons.length === 0,
  };
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
  opts: { fetchAccount?: SolAccountFetcher } = {},
): Promise<VaultSolDecodeResult> {
  try {
    const [sdk, web3] = await Promise.all([
      import('@runonflux/solana-multisig'),
      import('@solana/web3.js'),
    ]);

    const programIdBase58 = blockchains[chain]?.programId;
    if (!programIdBase58) {
      throw new Error(`Chain ${chain} has no programId in spec`);
    }
    const programId = new web3.PublicKey(programIdBase58);

    const rawDecoded = sdk.decodeVaultSolanaTransaction(
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

    if (rawDecoded.kind === 'undecodable') {
      // Bytes this device cannot read are never signed (SOL-4 / CHN-4).
      return blocked(
        'undecodable',
        `Transaction bytes could not be decoded: ${rawDecoded.error}`,
      );
    }

    // Mainnet priority fee: exempt byte-verified, capped ComputeBudget
    // instructions from the unknown-outer-program guard — nothing else.
    const budget = exemptVerifiedComputeBudget(
      rawDecoded.unknownOuterPrograms,
      rawUnsignedTxBase64,
      web3,
    );

    if (rawDecoded.kind === 'approve') {
      const approve: DecodedApprove = {
        ...rawDecoded,
        unknownOuterPrograms: budget.programs,
      };
      const result = await verifyApproveOnChain(
        rawUnsignedTxBase64,
        approve,
        chain,
        expected,
        programId,
        sdk,
        web3,
        opts.fetchAccount ??
          ((address: string) => defaultFetchAccount(chain, address)),
      );
      return withBudgetReason(
        { ...result, multisigPda: rawDecoded.multisigPda },
        budget.error,
      );
    }
    const decoded: DecodedCreate = {
      ...rawDecoded,
      unknownOuterPrograms: budget.programs,
    };

    // kind 'create' — byte-decoded recipients/amounts are authoritative.
    // Multi-recipient SPL proposals: the decoder resolves ATAs against a
    // single owner (recipients[0]); resolve the remaining ones against the
    // other expected owners so a legitimate multi-recipient send does not
    // false-positive the mismatch hard-block.
    resolveMultiRecipientAtas(decoded, expected, sdk, web3);

    // Bound the vault->fee-payer reimbursement to an independent hard ceiling
    // (the relay is untrusted). The exact fee is still shown to the user.
    const comparison = sdk.compareDecodedToExpected(decoded, {
      recipients: expected.recipients,
      tokenMint: expected.tokenMint,
      maxFeeLamports: SOL_VAULT_MAX_FEE_LAMPORTS,
    });
    const reasons = [...comparison.mismatches];
    if (budget.error) reasons.push(budget.error);
    const mapped = mapCreate(decoded, chain, reasons);
    return {
      decoded: mapped,
      mismatch: reasons.length > 0,
      mismatchReasons: reasons,
      kind: 'create',
      multisigPda: decoded.multisigPda,
    };
  } catch (error) {
    return blocked(
      'undecodable',
      error instanceof Error
        ? error.message
        : 'Failed to decode Solana transaction',
    );
  }
}
