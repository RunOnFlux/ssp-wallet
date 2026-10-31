// Solana mainnet priority fee: the relay's mainnet builder adds outer
// SetComputeUnitLimit + SetComputeUnitPrice instructions that SDK 0.12.0's
// decoder reports as unknown outer programs. The wallet exempts them only
// after parsing the exact signing bytes with the same shapes and caps as
// relay-enterprise `verifyOuterComputeBudget()`; everything else stays
// refused.
import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'buffer';
import * as web3 from '@solana/web3.js';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  SolanaMultisigClient,
  deriveMultisigAddress,
  deriveVaultAddress,
  type TransactionMessage,
} from '@runonflux/solana-multisig';

import {
  COMPUTE_BUDGET_PROGRAM_ID_BASE58,
  decodeVaultSolTransaction,
  verifyOuterComputeBudget,
} from '../../src/lib/vaultSolanaDecode';

// Must match blockchains.solDevnet.programId.
const programId = new PublicKey('CisPSFTQoTnEqn5cUi1pgpfPp2xiTVRkK7eD5jBevxdX');
const client = new SolanaMultisigClient(
  new Connection('http://localhost:8899'),
  programId,
);
const chain = 'solDevnet' as const;

const walletKp = Keypair.generate();
const keyKp = Keypair.generate();
const paymasterKp = Keypair.generate();
const recipientKp = Keypair.generate();
const nonceAccount = Keypair.generate().publicKey;
const blockhash = 'EETubP5AKHgjPAhzPAFcb8BAY6hDtV5oqBe5LBdnDS6E';
const [multisigAddress] = deriveMultisigAddress(
  [walletKp.publicKey, keyKp.publicKey],
  2,
  programId,
);
const [vaultAddress] = deriveVaultAddress(multisigAddress, 0, programId);
const SOL_AMOUNT = '2500000';
const FEE_LAMPORTS = '15000';
const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
);

const expected = () => ({
  recipients: [
    { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
  ],
});

function nonceAdvanceIx(): TransactionInstruction {
  return SystemProgram.nonceAdvance({
    noncePubkey: nonceAccount,
    authorizedPubkey: paymasterKp.publicKey,
  });
}

/** The builder's mainnet priority-fee pair (priorityFeeIxs). */
function priorityFeeIxs(
  units = 200_000,
  microLamports = 100_000,
): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
}

function serialize(tx: Transaction): string {
  tx.recentBlockhash = blockhash;
  tx.feePayer = paymasterKp.publicKey;
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
}

function nativeMessage(): TransactionMessage {
  const transferIx = SystemProgram.transfer({
    fromPubkey: vaultAddress,
    toPubkey: recipientKp.publicKey,
    lamports: BigInt(SOL_AMOUNT),
  });
  const reimburseIx = SystemProgram.transfer({
    fromPubkey: vaultAddress,
    toPubkey: paymasterKp.publicKey,
    lamports: BigInt(FEE_LAMPORTS),
  });
  return {
    numSigners: 1,
    numWritableSigners: 1,
    numWritableNonSigners: 2,
    accountKeys: [
      vaultAddress,
      recipientKp.publicKey,
      paymasterKp.publicKey,
      SystemProgram.programId,
    ],
    instructions: [
      {
        programIdIndex: 3,
        accountIndexes: new Uint8Array([0, 1]),
        data: new Uint8Array(transferIx.data),
      },
      {
        programIdIndex: 3,
        accountIndexes: new Uint8Array([0, 2]),
        data: new Uint8Array(reimburseIx.data),
      },
    ],
    addressTableLookups: [],
  };
}

/**
 * nonceAdvance + [outer extras] + create + approve x2 + execute + close.
 * `leading` instructions go BEFORE nonceAdvance.
 */
async function bundle(
  extras: TransactionInstruction[],
  leading: TransactionInstruction[] = [],
): Promise<string> {
  const message = nativeMessage();
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
  const approve = (member: PublicKey) =>
    client.buildApproveTransactionInstruction({
      multisigAddress,
      transactionAddress,
      transactionIndex,
      member,
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
  return serialize(
    new Transaction().add(
      ...leading,
      nonceAdvanceIx(),
      ...extras,
      createIx,
      await approve(walletKp.publicKey),
      await approve(keyKp.publicKey),
      executeIx,
      closeIx,
    ),
  );
}

describe('verifyOuterComputeBudget (byte parse, same caps as the relay)', () => {
  it('accepts the capped mainnet pair and counts both instructions', async () => {
    expect(
      verifyOuterComputeBudget(await bundle(priorityFeeIxs()), web3),
    ).toEqual({ ok: true, count: 2 });
  });

  it('counts zero for a bundle without ComputeBudget', async () => {
    expect(verifyOuterComputeBudget(await bundle([]), web3)).toEqual({
      ok: true,
      count: 0,
    });
  });

  it('accepts the exact caps (1.4M CU limit is fine with a small price)', async () => {
    // 1,400,000 CU x 35,000 uL = 49,000 lamports <= 50,000.
    const result = verifyOuterComputeBudget(
      await bundle(priorityFeeIxs(1_400_000, 35_000)),
      web3,
    );
    expect(result.ok).toBe(true);
  });

  it('refuses a unit price above 1,000,000 microlamports', async () => {
    const result = verifyOuterComputeBudget(
      await bundle(priorityFeeIxs(1_000, 1_000_001)),
      web3,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('unit price 1000001 exceeds'),
    });
  });

  it('refuses a unit limit above 1,400,000', async () => {
    const result = verifyOuterComputeBudget(
      await bundle(priorityFeeIxs(1_400_001, 1)),
      web3,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('unit limit 1400001 exceeds'),
    });
  });

  it('refuses a total priority fee above 50,000 lamports', async () => {
    // 200,000 CU x 250,001 uL = 50,000.2 -> 50,001 lamports.
    const result = verifyOuterComputeBudget(
      await bundle(priorityFeeIxs(200_000, 250_001)),
      web3,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('priority fee 50001 lamports exceeds'),
    });
  });

  it('assumes the 1.4M CU maximum when no limit instruction is present', async () => {
    const result = verifyOuterComputeBudget(
      await bundle([
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 40_000 }),
      ]),
      web3,
    );
    // 1,400,000 x 40,000 uL = 56,000 lamports > 50,000.
    expect(result.ok).toBe(false);
  });

  it('refuses a duplicate instruction', async () => {
    const result = verifyOuterComputeBudget(
      await bundle([
        ...priorityFeeIxs(),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      ]),
      web3,
    );
    expect(result).toEqual({
      ok: false,
      error: 'duplicate ComputeBudget instruction',
    });
  });

  it('refuses an instruction that takes accounts', async () => {
    const price = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1,
    });
    const withAccount = new TransactionInstruction({
      programId: price.programId,
      keys: [{ pubkey: vaultAddress, isSigner: false, isWritable: true }],
      data: Buffer.from(price.data),
    });
    const result = verifyOuterComputeBudget(await bundle([withAccount]), web3);
    expect(result).toEqual({
      ok: false,
      error: 'ComputeBudget instruction must not take accounts',
    });
  });

  it('refuses ComputeBudget at instruction[0] (the durable-nonce slot)', async () => {
    const result = verifyOuterComputeBudget(
      await bundle([], priorityFeeIxs()),
      web3,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('instruction[0]'),
    });
  });

  it('refuses any other ComputeBudget instruction (e.g. RequestHeapFrame)', async () => {
    const heap = ComputeBudgetProgram.requestHeapFrame({ bytes: 32 * 1024 });
    const result = verifyOuterComputeBudget(await bundle([heap]), web3);
    expect(result).toEqual({
      ok: false,
      error: 'non-allowlisted ComputeBudget instruction',
    });
  });

  it('never throws on garbage bytes', () => {
    const result = verifyOuterComputeBudget('not base64 !!', web3);
    expect(result.ok).toBe(false);
  });
});

describe('decodeVaultSolTransaction with mainnet ComputeBudget instructions', () => {
  it('ACCEPTS a capped mainnet-style bundle (no mismatch, decode intact)', async () => {
    const result = await decodeVaultSolTransaction(
      await bundle(priorityFeeIxs()),
      chain,
      expected(),
    );
    expect(result.kind).toBe('create');
    expect(result.mismatch).toBe(false);
    expect(result.mismatchReasons).toEqual([]);
    expect(result.decoded.error).toBeUndefined();
    expect(result.decoded.recipients).toEqual([
      { address: recipientKp.publicKey.toBase58(), amount: SOL_AMOUNT },
    ]);
    expect(result.multisigPda).toBe(multisigAddress.toBase58());
  });

  it.each([
    ['an oversized price', () => bundle(priorityFeeIxs(1_000, 1_000_001))],
    [
      'a duplicate instruction',
      () =>
        bundle([
          ...priorityFeeIxs(),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000 }),
        ]),
    ],
    [
      'an instruction with accounts',
      () => {
        const limit = ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_000,
        });
        return bundle([
          new TransactionInstruction({
            programId: limit.programId,
            keys: [
              {
                pubkey: paymasterKp.publicKey,
                isSigner: false,
                isWritable: true,
              },
            ],
            data: Buffer.from(limit.data),
          }),
        ]);
      },
    ],
    ['ComputeBudget at index 0', () => bundle([], priorityFeeIxs())],
  ])('REFUSES %s', async (_label, build) => {
    const result = await decodeVaultSolTransaction(
      await build(),
      chain,
      expected(),
    );
    expect(result.mismatch).toBe(true);
    const reasons = result.mismatchReasons.join(' ');
    expect(reasons).toContain('unknown outer program');
    expect(reasons).toContain(COMPUTE_BUDGET_PROGRAM_ID_BASE58);
    expect(reasons).toContain('ComputeBudget instruction(s) not allowed');
  });

  it('still refuses an outer Memo next to a valid priority-fee pair', async () => {
    const memo = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from('hello', 'utf8'),
    });
    const result = await decodeVaultSolTransaction(
      await bundle([...priorityFeeIxs(), memo]),
      chain,
      expected(),
    );
    expect(result.mismatch).toBe(true);
    const reasons = result.mismatchReasons.join(' ');
    expect(reasons).toContain(MEMO_PROGRAM_ID.toBase58());
    expect(reasons).not.toContain(COMPUTE_BUDGET_PROGRAM_ID_BASE58);
  });

  it('exempts a capped pair on an approve-only tx and goes on to the on-chain check', async () => {
    const approveIx = await client.buildApproveTransactionInstruction({
      multisigAddress,
      transactionAddress: Keypair.generate().publicKey,
      transactionIndex: 1n,
      member: keyKp.publicKey,
    });
    const fetchAccount = vi.fn(async () => null);
    const result = await decodeVaultSolTransaction(
      serialize(
        new Transaction().add(nonceAdvanceIx(), ...priorityFeeIxs(), approveIx),
      ),
      chain,
      expected(),
      { fetchAccount },
    );
    // The ComputeBudget pair passed; the (missing) proposal is what blocks.
    expect(fetchAccount).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('approve');
    expect(result.decoded.error).toContain('does not exist on-chain');
    expect(result.multisigPda).toBe(multisigAddress.toBase58());
  });

  it('refuses an approve-only tx carrying an uncapped price before any fetch', async () => {
    const approveIx = await client.buildApproveTransactionInstruction({
      multisigAddress,
      transactionAddress: Keypair.generate().publicKey,
      transactionIndex: 1n,
      member: keyKp.publicKey,
    });
    const fetchAccount = vi.fn(async () => null);
    const result = await decodeVaultSolTransaction(
      serialize(
        new Transaction().add(
          nonceAdvanceIx(),
          ...priorityFeeIxs(1_000, 1_000_001),
          approveIx,
        ),
      ),
      chain,
      expected(),
      { fetchAccount },
    );
    expect(fetchAccount).not.toHaveBeenCalled();
    expect(result.mismatch).toBe(true);
    expect(result.decoded.error).toContain('unknown outer program');
    expect(result.mismatchReasons.join(' ')).toContain(
      'ComputeBudget instruction(s) not allowed',
    );
  });
});
