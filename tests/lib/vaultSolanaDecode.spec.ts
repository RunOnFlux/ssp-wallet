// Trustless Solana enterprise-vault decode tests.
//
// Fixture bundles are REAL bytes built offline with the pinned
// @runonflux/solana-multisig client builders, composed exactly like the
// relay's solanaVaultProposalBuilderService / the wallet's constructTx:
//   nonceAdvance + [ataCreateIdempotent] + create + approve×2 + execute + close
// with feePayer = paymaster and a durable-nonce recentBlockhash.
import { describe, it, expect } from 'vitest';
import { Buffer } from 'buffer';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  SolanaMultisigClient,
  deriveMultisigAddress,
  deriveVaultAddress,
  decodeVaultSolanaTransaction,
  compareDecodedToExpected,
  deriveAssociatedTokenAddress,
  type TransactionMessage,
} from '@runonflux/solana-multisig';
import * as splToken from '@solana/spl-token';

import { decodeVaultSolTransaction } from '../../src/lib/vaultSolanaDecode';

// Must match blockchains.solDevnet.programId — the wrapper resolves it there.
const programId = new PublicKey('CisPSFTQoTnEqn5cUi1pgpfPp2xiTVRkK7eD5jBevxdX');
// Builders are offline (ix construction only) — the Connection never dials.
const connection = new Connection('http://localhost:8899');
const client = new SolanaMultisigClient(connection, programId);

const walletKp = Keypair.generate();
const keyKp = Keypair.generate();
const paymasterKp = Keypair.generate();
const recipientKp = Keypair.generate();
const mint = Keypair.generate().publicKey;
const nonceAccount = Keypair.generate().publicKey;
const blockhash = 'EETubP5AKHgjPAhzPAFcb8BAY6hDtV5oqBe5LBdnDS6E';

const [multisigAddress] = deriveMultisigAddress(
  [walletKp.publicKey, keyKp.publicKey],
  2,
  programId,
);
const [vaultAddress] = deriveVaultAddress(multisigAddress, 0, programId);

const SOL_AMOUNT = '2500000'; // lamports
const FEE_LAMPORTS = '15000'; // paymaster reimbursement
const TOKEN_AMOUNT = '1230000'; // token base units
const TOKEN_AMOUNT_2 = '4560000'; // token base units (second recipient)
const TOKEN_DECIMALS = 6;
const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
);

function nonceAdvanceIx(): TransactionInstruction {
  return SystemProgram.nonceAdvance({
    noncePubkey: nonceAccount,
    authorizedPubkey: paymasterKp.publicKey,
  });
}

function serialize(tx: Transaction): string {
  tx.recentBlockhash = blockhash;
  tx.feePayer = paymasterKp.publicKey;
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
}

async function bundleFromMessage(
  message: TransactionMessage,
  extraOuterIxs: TransactionInstruction[] = [],
): Promise<string> {
  const {
    instruction: createIx,
    transactionAddress,
    transactionIndex,
  } = await client.buildCreateTransactionInstruction({
    multisigAddress,
    currentTransactionIndex: 0n,
    vaultIndex: 0,
    message,
    creator: walletKp.publicKey,
    payer: paymasterKp.publicKey,
  });
  const approveWalletIx = await client.buildApproveTransactionInstruction({
    multisigAddress,
    transactionAddress,
    transactionIndex,
    member: walletKp.publicKey,
  });
  const approveKeyIx = await client.buildApproveTransactionInstruction({
    multisigAddress,
    transactionAddress,
    transactionIndex,
    member: keyKp.publicKey,
  });
  const executeIx = await client.buildExecuteTransactionInstruction({
    multisigAddress,
    transactionAddress,
    transactionIndex,
    executor: walletKp.publicKey,
    remainingAccounts: message.accountKeys.map((pubkey, i) => ({
      pubkey,
      isSigner: false,
      isWritable: i < 1 + message.numWritableNonSigners,
    })),
  });
  const closeIx = await client.buildCloseTransactionInstruction({
    multisigAddress,
    transactionAddress,
    transactionIndex,
    payer: paymasterKp.publicKey,
  });
  const tx = new Transaction().add(
    nonceAdvanceIx(),
    ...extraOuterIxs,
    createIx,
    approveWalletIx,
    approveKeyIx,
    executeIx,
    closeIx,
  );
  return serialize(tx);
}

/** Native SOL bundle mirroring constructTx's inner message composition. */
async function buildNativeBundle(
  opts: {
    recipient?: PublicKey;
    amount?: string;
    extraOuterIxs?: TransactionInstruction[];
    withUnknownInnerIx?: boolean;
  } = {},
): Promise<string> {
  const recipient = opts.recipient ?? recipientKp.publicKey;
  const amount = opts.amount ?? SOL_AMOUNT;
  const transferIx = SystemProgram.transfer({
    fromPubkey: vaultAddress,
    toPubkey: recipient,
    lamports: BigInt(amount),
  });
  const reimburseIx = SystemProgram.transfer({
    fromPubkey: vaultAddress,
    toPubkey: paymasterKp.publicKey,
    lamports: BigInt(FEE_LAMPORTS),
  });
  const accountKeys = [
    vaultAddress,
    recipient,
    paymasterKp.publicKey,
    SystemProgram.programId,
  ];
  const instructions = [
    {
      programIdIndex: 3,
      accountIndexes: new Uint8Array([0, 1]), // [vault, recipient]
      data: new Uint8Array(transferIx.data),
    },
    {
      programIdIndex: 3,
      accountIndexes: new Uint8Array([0, 2]), // [vault, paymaster]
      data: new Uint8Array(reimburseIx.data),
    },
  ];
  if (opts.withUnknownInnerIx) {
    accountKeys.push(MEMO_PROGRAM_ID);
    instructions.push({
      programIdIndex: accountKeys.length - 1,
      accountIndexes: new Uint8Array([]),
      data: new Uint8Array(Buffer.from('unclassifiable', 'utf8')),
    });
  }
  const message: TransactionMessage = {
    numSigners: 1,
    numWritableSigners: 1,
    numWritableNonSigners: 2,
    accountKeys,
    instructions,
    addressTableLookups: [],
  };
  return bundleFromMessage(message, opts.extraOuterIxs ?? []);
}

/** SPL bundle (TransferChecked or legacy Transfer) mirroring constructTx. */
async function buildSplBundle(
  opts: { recipientOwner?: PublicKey; legacyTransfer?: boolean } = {},
): Promise<{ base64: string; destAta: PublicKey; owner: PublicKey }> {
  const owner = opts.recipientOwner ?? recipientKp.publicKey;
  const sourceAta = splToken.getAssociatedTokenAddressSync(
    mint,
    vaultAddress,
    true,
  );
  const destAta = splToken.getAssociatedTokenAddressSync(mint, owner, true);
  const ataIx = splToken.createAssociatedTokenAccountIdempotentInstruction(
    paymasterKp.publicKey,
    destAta,
    owner,
    mint,
  );
  let transferData: Uint8Array;
  let transferAccountIndexes: Uint8Array;
  if (opts.legacyTransfer) {
    // Legacy Transfer (tag 3): accounts [source, dest, authority];
    // data [tag u8, amount u64 LE] — no mint/decimals on the wire.
    const d = Buffer.alloc(9);
    d[0] = 3;
    d.writeBigUInt64LE(BigInt(TOKEN_AMOUNT), 1);
    transferData = new Uint8Array(d);
    transferAccountIndexes = new Uint8Array([1, 2, 0]);
  } else {
    const transferIx = splToken.createTransferCheckedInstruction(
      sourceAta,
      mint,
      destAta,
      vaultAddress,
      BigInt(TOKEN_AMOUNT),
      TOKEN_DECIMALS,
    );
    transferData = new Uint8Array(transferIx.data);
    // TransferChecked: [source, mint, dest, authority]
    transferAccountIndexes = new Uint8Array([1, 4, 2, 0]);
  }
  const reimburseIx = SystemProgram.transfer({
    fromPubkey: vaultAddress,
    toPubkey: paymasterKp.publicKey,
    lamports: BigInt(FEE_LAMPORTS),
  });
  const message: TransactionMessage = {
    numSigners: 1,
    numWritableSigners: 1,
    numWritableNonSigners: 3,
    accountKeys: [
      vaultAddress,
      sourceAta,
      destAta,
      paymasterKp.publicKey,
      mint,
      splToken.TOKEN_PROGRAM_ID,
      SystemProgram.programId,
    ],
    instructions: [
      {
        programIdIndex: 5, // TOKEN_PROGRAM_ID
        accountIndexes: transferAccountIndexes,
        data: transferData,
      },
      {
        programIdIndex: 6, // SystemProgram reimbursement
        accountIndexes: new Uint8Array([0, 3]),
        data: new Uint8Array(reimburseIx.data),
      },
    ],
    addressTableLookups: [],
  };
  const base64 = await bundleFromMessage(message, [ataIx]);
  return { base64, destAta, owner };
}

/** SPL bundle with TWO TransferChecked transfers to two different owners' ATAs. */
async function buildTwoRecipientSplBundle(): Promise<{
  base64: string;
  owner1: PublicKey;
  owner2: PublicKey;
  destAta1: PublicKey;
  destAta2: PublicKey;
}> {
  const owner1 = recipientKp.publicKey;
  const owner2 = Keypair.generate().publicKey;
  const sourceAta = splToken.getAssociatedTokenAddressSync(
    mint,
    vaultAddress,
    true,
  );
  // Derived with the SDK decoder helper — the exact derivation the
  // wrapper's multi-recipient owner-resolution block performs.
  const destAta1 = deriveAssociatedTokenAddress(owner1, mint);
  const destAta2 = deriveAssociatedTokenAddress(owner2, mint);
  const transfer1Ix = splToken.createTransferCheckedInstruction(
    sourceAta,
    mint,
    destAta1,
    vaultAddress,
    BigInt(TOKEN_AMOUNT),
    TOKEN_DECIMALS,
  );
  const transfer2Ix = splToken.createTransferCheckedInstruction(
    sourceAta,
    mint,
    destAta2,
    vaultAddress,
    BigInt(TOKEN_AMOUNT_2),
    TOKEN_DECIMALS,
  );
  const reimburseIx = SystemProgram.transfer({
    fromPubkey: vaultAddress,
    toPubkey: paymasterKp.publicKey,
    lamports: BigInt(FEE_LAMPORTS),
  });
  const message: TransactionMessage = {
    numSigners: 1,
    numWritableSigners: 1,
    numWritableNonSigners: 4,
    accountKeys: [
      vaultAddress,
      sourceAta,
      destAta1,
      destAta2,
      paymasterKp.publicKey,
      mint,
      splToken.TOKEN_PROGRAM_ID,
      SystemProgram.programId,
    ],
    instructions: [
      {
        programIdIndex: 6, // TOKEN_PROGRAM_ID
        accountIndexes: new Uint8Array([1, 5, 2, 0]), // [source, mint, destAta1, authority]
        data: new Uint8Array(transfer1Ix.data),
      },
      {
        programIdIndex: 6, // TOKEN_PROGRAM_ID
        accountIndexes: new Uint8Array([1, 5, 3, 0]), // [source, mint, destAta2, authority]
        data: new Uint8Array(transfer2Ix.data),
      },
      {
        programIdIndex: 7, // SystemProgram reimbursement
        accountIndexes: new Uint8Array([0, 4]),
        data: new Uint8Array(reimburseIx.data),
      },
    ],
    addressTableLookups: [],
  };
  // No outer ataCreateIdempotent ixs: both destination ATAs already exist —
  // and two of them would push the bundle past the 1232-byte legacy tx limit.
  const base64 = await bundleFromMessage(message);
  return { base64, owner1, owner2, destAta1, destAta2 };
}

/** Split-flow subsequent-signer tx: nonceAdvance + approve only. */
async function buildApproveOnlyTx(): Promise<string> {
  const approveIx = await client.buildApproveTransactionInstruction({
    multisigAddress,
    transactionAddress: Keypair.generate().publicKey,
    transactionIndex: 1n,
    member: keyKp.publicKey,
  });
  const tx = new Transaction().add(nonceAdvanceIx(), approveIx);
  return serialize(tx);
}

describe('@runonflux/solana-multisig decoder', () => {
  it('decodes a native SOL bundle: sender/recipient/amount/fee/approvers, zero unknowns', async () => {
    const base64 = await buildNativeBundle();
    const decoded = decodeVaultSolanaTransaction(base64, programId);

    expect(decoded.kind).toBe('create');
    if (decoded.kind !== 'create') return;
    expect(decoded.vaultIndex).toBe(0);
    expect(decoded.multisigPda).toBe(multisigAddress.toBase58());
    expect(decoded.creator).toBe(walletKp.publicKey.toBase58());
    expect(decoded.sender).toBe(vaultAddress.toBase58());
    expect(decoded.recipients).toEqual([
      {
        address: recipientKp.publicKey.toBase58(),
        amount: SOL_AMOUNT,
        asset: 'native',
      },
    ]);
    expect(decoded.feeLamports).toBe(FEE_LAMPORTS);
    expect(decoded.approvers).toEqual([
      walletKp.publicKey.toBase58(),
      keyKp.publicKey.toBase58(),
    ]);
    expect(decoded.unknownInnerInstructionCount).toBe(0);
    expect(decoded.unknownOuterPrograms).toEqual([]);
  });

  it('decodes SPL TransferChecked with mint + decimals from bytes and verifies the ATA owner', async () => {
    const { base64, destAta, owner } = await buildSplBundle();
    const decoded = decodeVaultSolanaTransaction(base64, programId, {
      expectedRecipientOwner: owner.toBase58(),
      expectedMint: mint.toBase58(),
    });

    expect(decoded.kind).toBe('create');
    if (decoded.kind !== 'create') return;
    expect(decoded.unknownOuterPrograms).toEqual([]); // ATA create ix allowed
    expect(decoded.unknownInnerInstructionCount).toBe(0);
    expect(decoded.recipients).toHaveLength(1);
    const r = decoded.recipients[0];
    expect(r.asset).toBe('spl');
    expect(r.mint).toBe(mint.toBase58());
    expect(r.decimals).toBe(TOKEN_DECIMALS);
    expect(r.amount).toBe(TOKEN_AMOUNT);
    expect(r.ata).toBe(destAta.toBase58());
    expect(r.ataVerified).toBe(true);
    expect(r.address).toBe(owner.toBase58()); // owner-resolved
  });

  it('flags ataVerified=false when the expected owner does not derive the destination ATA', async () => {
    const { base64, destAta } = await buildSplBundle();
    const wrongOwner = Keypair.generate().publicKey;
    const decoded = decodeVaultSolanaTransaction(base64, programId, {
      expectedRecipientOwner: wrongOwner.toBase58(),
      expectedMint: mint.toBase58(),
    });

    expect(decoded.kind).toBe('create');
    if (decoded.kind !== 'create') return;
    const r = decoded.recipients[0];
    expect(r.ataVerified).toBe(false);
    expect(r.address).toBe(destAta.toBase58()); // falls back to the raw ata
  });

  it('decodes legacy SPL Transfer (tag 3) with no mint/decimals', async () => {
    const { base64, destAta } = await buildSplBundle({ legacyTransfer: true });
    const decoded = decodeVaultSolanaTransaction(base64, programId);

    expect(decoded.kind).toBe('create');
    if (decoded.kind !== 'create') return;
    const r = decoded.recipients[0];
    expect(r.asset).toBe('spl');
    expect(r.mint).toBeUndefined();
    expect(r.decimals).toBeUndefined();
    expect(r.amount).toBe(TOKEN_AMOUNT);
    expect(r.ata).toBe(destAta.toBase58());
  });

  it('classifies an approve-only tx (split-flow subsequent signer) as kind approve', async () => {
    const base64 = await buildApproveOnlyTx();
    const decoded = decodeVaultSolanaTransaction(base64, programId);

    expect(decoded.kind).toBe('approve');
    if (decoded.kind !== 'approve') return;
    expect(decoded.multisigPda).toBe(multisigAddress.toBase58());
    expect(decoded.approvers).toEqual([keyKp.publicKey.toBase58()]);
    expect(decoded.unknownOuterPrograms).toEqual([]);
  });

  it('reports a foreign outer instruction (leaf-key-drain guard) and compare fails', async () => {
    // A member-key drain attempt: outer SystemProgram.transfer alongside the bundle.
    const drainIx = SystemProgram.transfer({
      fromPubkey: walletKp.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1_000_000n,
    });
    const base64 = await buildNativeBundle({ extraOuterIxs: [drainIx] });
    const decoded = decodeVaultSolanaTransaction(base64, programId);

    expect(decoded.kind).toBe('create');
    if (decoded.kind !== 'create') return;
    expect(decoded.unknownOuterPrograms).toEqual([
      SystemProgram.programId.toBase58(),
    ]);
    const comparison = compareDecodedToExpected(decoded, {
      recipients: [
        { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
      ],
    });
    expect(comparison.ok).toBe(false);
    expect(comparison.mismatches.join(' ')).toContain('unknown outer program');
  });

  it('reports tampered amount and recipient against the expected payload', async () => {
    const base64 = await buildNativeBundle();
    const decoded = decodeVaultSolanaTransaction(base64, programId);
    expect(decoded.kind).toBe('create');

    const tamperedAmount = compareDecodedToExpected(decoded, {
      recipients: [
        { address: recipientKp.publicKey.toBase58(), amount: '999999999' },
      ],
    });
    expect(tamperedAmount.ok).toBe(false);
    expect(tamperedAmount.mismatches.length).toBeGreaterThan(0);

    const tamperedRecipient = compareDecodedToExpected(decoded, {
      recipients: [
        {
          address: Keypair.generate().publicKey.toBase58(),
          amount: SOL_AMOUNT,
        },
      ],
    });
    expect(tamperedRecipient.ok).toBe(false);
    // Both directions: expected-not-found AND extra-decoded-recipient.
    expect(tamperedRecipient.mismatches.length).toBe(2);
  });

  it('returns kind undecodable for garbage and truncated inputs — never throws', () => {
    for (const input of [
      'not-base64-at-all!!!',
      '',
      Buffer.from([1, 2, 3]).toString('base64'),
    ]) {
      const decoded = decodeVaultSolanaTransaction(input, programId);
      expect(decoded.kind).toBe('undecodable');
      if (decoded.kind === 'undecodable') {
        expect(decoded.error.length).toBeGreaterThan(0);
      }
    }
  });

  it('counts unclassifiable inner instructions (fail-closed) and compare fails', async () => {
    const base64 = await buildNativeBundle({ withUnknownInnerIx: true });
    const decoded = decodeVaultSolanaTransaction(base64, programId);

    expect(decoded.kind).toBe('create');
    if (decoded.kind !== 'create') return;
    expect(decoded.unknownInnerInstructionCount).toBe(1);
    const comparison = compareDecodedToExpected(decoded, {
      recipients: [
        { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
      ],
    });
    expect(comparison.ok).toBe(false);
  });
});

describe('decodeVaultSolTransaction (wallet wrapper)', () => {
  const chain = 'solDevnet' as const;

  it('maps a happy-path native SOL bundle to VaultDecodedTx with mismatch=false', async () => {
    const base64 = await buildNativeBundle();
    const result = await decodeVaultSolTransaction(base64, chain, {
      recipients: [
        { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
      ],
    });

    expect(result.kind).toBe('create');
    expect(result.mismatch).toBe(false);
    expect(result.mismatchReasons).toEqual([]);
    expect(result.decoded.sender).toBe(vaultAddress.toBase58());
    expect(result.decoded.recipients).toEqual([
      { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
    ]);
    expect(result.decoded.fee).toBe(FEE_LAMPORTS);
    expect(result.decoded.tokenContract).toBeUndefined();
    expect(result.decoded.error).toBeUndefined();
  });

  it('maps an SPL TransferChecked bundle with byte-derived mint/decimals and owner-resolved recipient', async () => {
    const { base64, owner } = await buildSplBundle();
    const result = await decodeVaultSolTransaction(base64, chain, {
      recipients: [{ address: owner.toBase58(), amount: TOKEN_AMOUNT }],
      tokenMint: mint.toBase58(),
      tokenSymbol: 'TKN',
      tokenDecimals: 9, // deliberately wrong — bytes must win
    });

    expect(result.kind).toBe('create');
    expect(result.mismatch).toBe(false);
    expect(result.decoded.recipients).toEqual([
      { address: owner.toBase58(), amount: TOKEN_AMOUNT },
    ]);
    expect(result.decoded.tokenContract).toBe(mint.toBase58());
    expect(result.decoded.tokenDecimals).toBe(TOKEN_DECIMALS); // from bytes
    expect(result.decoded.tokenSymbol).toBe('TKN');
    expect(result.decoded.fee).toBe(FEE_LAMPORTS);
  });

  it('maps a two-recipient SPL TransferChecked bundle with BOTH recipients owner-resolved and no mismatch', async () => {
    const { base64, owner1, owner2, destAta1, destAta2 } =
      await buildTwoRecipientSplBundle();
    const result = await decodeVaultSolTransaction(base64, chain, {
      recipients: [
        { address: owner1.toBase58(), amount: TOKEN_AMOUNT },
        { address: owner2.toBase58(), amount: TOKEN_AMOUNT_2 },
      ],
      tokenMint: mint.toBase58(),
      tokenSymbol: 'TKN',
      tokenDecimals: TOKEN_DECIMALS,
    });

    expect(result.kind).toBe('create');
    expect(result.mismatch).toBe(false);
    expect(result.mismatchReasons).toEqual([]);
    // Both recipients resolve to the OWNER addresses — the first via the
    // decoder's recipients[0] resolution, the second via the wrapper's
    // multi-recipient owner-resolution block. Never the raw ATAs.
    expect(result.decoded.recipients).toEqual([
      { address: owner1.toBase58(), amount: TOKEN_AMOUNT },
      { address: owner2.toBase58(), amount: TOKEN_AMOUNT_2 },
    ]);
    const addresses = result.decoded.recipients.map((r) => r.address);
    expect(addresses).not.toContain(destAta1.toBase58());
    expect(addresses).not.toContain(destAta2.toBase58());
    expect(result.decoded.tokenContract).toBe(mint.toBase58());
    expect(result.decoded.tokenDecimals).toBe(TOKEN_DECIMALS);
    expect(result.decoded.fee).toBe(FEE_LAMPORTS);
  });

  it('sets mismatch=true (Approve-blocking) when the relay payload names a different recipient', async () => {
    const base64 = await buildNativeBundle();
    const attackerDisplayed = Keypair.generate().publicKey.toBase58();
    const result = await decodeVaultSolTransaction(base64, chain, {
      recipients: [{ address: attackerDisplayed, amount: SOL_AMOUNT }],
    });

    expect(result.kind).toBe('create');
    expect(result.mismatch).toBe(true);
    expect(result.mismatchReasons.length).toBeGreaterThan(0);
    // The decoded view still carries the byte truth for display.
    expect(result.decoded.recipients[0].address).toBe(
      recipientKp.publicKey.toBase58(),
    );
  });

  it('sets mismatch=true when the relay payload understates the amount', async () => {
    const base64 = await buildNativeBundle();
    const result = await decodeVaultSolTransaction(base64, chain, {
      recipients: [{ address: recipientKp.publicKey.toBase58(), amount: '1' }],
    });

    expect(result.kind).toBe('create');
    expect(result.mismatch).toBe(true);
  });

  it('maps an approve-only tx to kind approve with proposal-record recipients and no mismatch', async () => {
    const base64 = await buildApproveOnlyTx();
    const result = await decodeVaultSolTransaction(base64, chain, {
      recipients: [
        { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
      ],
    });

    expect(result.kind).toBe('approve');
    expect(result.mismatch).toBe(false);
    expect(result.decoded.recipients).toEqual([
      { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
    ]);
  });

  it('sets mismatch=true on a foreign outer instruction even for approve-only txs', async () => {
    const drainIx = SystemProgram.transfer({
      fromPubkey: keyKp.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 42n,
    });
    const approveIx = await client.buildApproveTransactionInstruction({
      multisigAddress,
      transactionAddress: Keypair.generate().publicKey,
      transactionIndex: 1n,
      member: keyKp.publicKey,
    });
    const tx = new Transaction().add(nonceAdvanceIx(), approveIx, drainIx);
    const base64 = serialize(tx);

    const result = await decodeVaultSolTransaction(base64, chain, {
      recipients: [
        { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
      ],
    });
    expect(result.kind).toBe('approve');
    expect(result.mismatch).toBe(true);
    expect(result.mismatchReasons.join(' ')).toContain('unknown outer program');
  });

  it('degrades garbage bytes to kind undecodable with error set and mismatch=false', async () => {
    const result = await decodeVaultSolTransaction('garbage!!!', chain, {
      recipients: [
        { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
      ],
    });

    expect(result.kind).toBe('undecodable');
    expect(result.mismatch).toBe(false); // warn-only degradation, never blocks
    expect(result.decoded.error).toBeTruthy();
    expect(result.decoded.recipients).toEqual([]);
    expect(result.decoded.fee).toBe('0');
  });
});
