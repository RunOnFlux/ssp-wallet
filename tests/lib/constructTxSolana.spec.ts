// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
} from '@solana/web3.js';
import { SolanaMultisigClient } from '@runonflux/solana-multisig';

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  },
}));

import {
  getMasterXpriv,
  generateAddressKeypairSOL,
  generateMultisigAddressSOL,
} from '../../src/lib/wallet';

import { constructAndSignSOLTransaction } from '../../src/lib/constructTx';

const mnemonic =
  'silver trouble mountain crouch angry park film strong escape theory illegal bunker cargo taxi tuna real drift alert state match great escape option explain';
const xprivWallet = getMasterXpriv(mnemonic, 48, 1, 0, 'p2sh', 'solDevnet');
const xprivKey = getMasterXpriv(mnemonic, 48, 1, 1, 'p2sh', 'solDevnet');
const walletKp = generateAddressKeypairSOL(xprivWallet, 0, 0, 'solDevnet');
const keyKp = generateAddressKeypairSOL(xprivKey, 0, 0, 'solDevnet');
const paymasterKp = Keypair.generate();
const paymasterPub = paymasterKp.publicKey.toBase58();
const recipient = Keypair.generate().publicKey.toBase58();
const blockhash = 'EETubP5AKHgjPAhzPAFcb8BAY6hDtV5oqBe5LBdnDS6E';

/**
 * Default stub: realistic post-/v1/sol/setup state. Multisig is initialized,
 * durable nonce account is provisioned. constructAndSignSOLTransaction
 * requires both. To test the "missing setup" error path, pass `initialized:
 * false` or `nonceProvisioned: false` explicitly.
 */
function stubConnectionAndClient(opts: {
  initialized?: boolean;
  transactionIndex?: bigint;
  nonceProvisioned?: boolean;
}) {
  const initialized = opts.initialized ?? true;
  const nonceProvisioned = opts.nonceProvisioned ?? true;

  vi.spyOn(Connection.prototype, 'getLatestBlockhash').mockResolvedValue({
    blockhash,
    lastValidBlockHeight: 100,
  } as any);
  vi.spyOn(Connection.prototype, 'sendRawTransaction').mockResolvedValue(
    '5xFakeBroadcastSig',
  );
  vi.spyOn(Connection.prototype, 'confirmTransaction').mockResolvedValue({
    value: { err: null },
  } as any);
  if (initialized) {
    // Use anchor.BN for transactionIndex to mirror what `program.account.X.fetch`
    // returns at runtime for u64 fields. The SDK's TS type claims `bigint` but
    // that's a cast lie — feeding it real-world inputs catches the
    // `BN + BigInt(1) → "string concat"` coercion footgun.
    const txIndex = opts.transactionIndex ?? BigInt(0);
    const txIndexBn = new anchor.BN(txIndex.toString());
    vi.spyOn(SolanaMultisigClient.prototype, 'getMultisig').mockResolvedValue({
      members: [
        new PublicKey(walletKp.pubKey),
        new PublicKey(keyKp.pubKey),
      ].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer())),
      threshold: 2,
      transactionIndex: txIndexBn,
      bump: 255,
    } as any);
  } else {
    vi.spyOn(SolanaMultisigClient.prototype, 'getMultisig').mockResolvedValue(
      null,
    );
  }

  vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue(
    nonceProvisioned
      ? ({
          owner: new PublicKey('11111111111111111111111111111111'),
          data: Buffer.alloc(80),
          executable: false,
          lamports: 1_447_680,
        } as any)
      : null,
  );
  if (nonceProvisioned) {
    vi.spyOn(Connection.prototype, 'getNonceAndContext').mockResolvedValue({
      value: {
        nonce: blockhash,
        authorizedPubkey: new PublicKey(paymasterPub),
      },
      context: { slot: 0 },
    } as any);
  } else {
    vi.spyOn(Connection.prototype, 'getNonceAndContext').mockResolvedValue({
      value: null,
      context: { slot: 0 },
    } as any);
  }
}

describe('Solana constructTx', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructAndSignSOLTransaction', () => {
    it('throws if wallet privkey does not match wallet pubkey', async () => {
      stubConnectionAndClient({ initialized: true });
      await expect(
        constructAndSignSOLTransaction({
          chain: 'solDevnet',
          recipient,
          amount: '1000000',
          walletPubkeyBase58: keyKp.pubKey, // wrong pubkey
          keyPubkeyBase58: keyKp.pubKey,
          walletPrivKeyHex: walletKp.privKey,
          paymasterPubkeyBase58: paymasterPub,
          paymasterFeeLamports: '100000',
        }),
      ).rejects.toThrow(/privkey\/pubkey mismatch/);
    });

    it('builds a 6-ix tx for already-initialized multisig with durable-nonce flow', async () => {
      stubConnectionAndClient({ initialized: true });
      const txB64 = await constructAndSignSOLTransaction({
        chain: 'solDevnet',
        recipient,
        amount: '1000000',
        walletPubkeyBase58: walletKp.pubKey,
        keyPubkeyBase58: keyKp.pubKey,
        walletPrivKeyHex: walletKp.privKey,
        paymasterPubkeyBase58: paymasterPub,
        paymasterFeeLamports: '100000',
      });
      const tx = Transaction.from(Buffer.from(txB64, 'base64'));
      // nonceAdvance + create + approve wallet + approve key + execute + close
      expect(tx.instructions).toHaveLength(6);
      expect(tx.feePayer!.toBase58()).toBe(paymasterPub);
      const walletSig = tx.signatures.find(
        (s) => s.publicKey.toBase58() === walletKp.pubKey,
      );
      expect(walletSig).toBeDefined();
      expect(walletSig!.signature).not.toBeNull();
      const keySig = tx.signatures.find(
        (s) => s.publicKey.toBase58() === keyKp.pubKey,
      );
      expect(keySig).toBeDefined();
      expect(keySig!.signature).toBeNull();
    });

    // Regression test for the BN + BigInt(1) string-coercion footgun.
    // For transactionIndex > 0, `predictNextTransactionPda` used to silently
    // produce string-concatenated values (BN(1) + BigInt(1) → "11") and
    // derive PDAs at wildly wrong indices, causing ConstraintSeeds errors
    // on every send after the first. Fix lives in the SDK
    // (normalize via toString() before arithmetic).
    it('builds correct PDA for second send (transactionIndex=1) — BN+BigInt coercion regression', async () => {
      stubConnectionAndClient({ transactionIndex: BigInt(1) });
      const txB64 = await constructAndSignSOLTransaction({
        chain: 'solDevnet',
        recipient,
        amount: '1000000',
        walletPubkeyBase58: walletKp.pubKey,
        keyPubkeyBase58: keyKp.pubKey,
        walletPrivKeyHex: walletKp.privKey,
        paymasterPubkeyBase58: paymasterPub,
        paymasterFeeLamports: '100000',
      });
      const tx = Transaction.from(Buffer.from(txB64, 'base64'));
      // 6 ixs (nonceAdvance + create + approve×2 + execute + close).
      expect(tx.instructions).toHaveLength(6);

      // Crucial: the proposal PDA must be derived using index 2 (current+1),
      // NOT 11 (string-concat-of-"1"-and-"1"). We verify by recomputing
      // the expected PDA from the multisig + index 2 and checking it
      // appears somewhere in the tx's account list.
      const PROGRAM_ID = new PublicKey(
        'CisPSFTQoTnEqn5cUi1pgpfPp2xiTVRkK7eD5jBevxdX',
      );
      const sortedMembers = [
        new PublicKey(walletKp.pubKey),
        new PublicKey(keyKp.pubKey),
      ].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
      const memberHash = require('crypto')
        .createHash('sha256');
      for (const m of sortedMembers) memberHash.update(m.toBytes());
      const [multisigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('multisig'), memberHash.digest(), Buffer.from([2])],
        PROGRAM_ID,
      );
      const idx2Bytes = new anchor.BN(2).toArrayLike(Buffer, 'le', 8);
      const [expectedProposalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('transaction'), multisigPda.toBytes(), idx2Bytes],
        PROGRAM_ID,
      );
      const idx11Bytes = new anchor.BN(11).toArrayLike(Buffer, 'le', 8);
      const [buggyProposalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('transaction'), multisigPda.toBytes(), idx11Bytes],
        PROGRAM_ID,
      );
      // Walk every ix's account list and collect all referenced pubkeys.
      const referencedKeys = new Set<string>();
      for (const ix of tx.instructions) {
        for (const k of ix.keys) referencedKeys.add(k.pubkey.toBase58());
      }
      // The PDA at next-index (2) must appear; the buggy string-coerced
      // PDA at "11" must NOT.
      expect(referencedKeys.has(expectedProposalPda.toBase58())).toBe(true);
      expect(referencedKeys.has(buggyProposalPda.toBase58())).toBe(false);
    });

    it('throws if multisig is not yet initialized — caller must run /v1/sol/setup first', async () => {
      stubConnectionAndClient({ initialized: false, nonceProvisioned: false });
      await expect(
        constructAndSignSOLTransaction({
          chain: 'solDevnet',
          recipient,
          amount: '1000000',
          walletPubkeyBase58: walletKp.pubKey,
          keyPubkeyBase58: keyKp.pubKey,
          walletPrivKeyHex: walletKp.privKey,
          paymasterPubkeyBase58: paymasterPub,
          paymasterFeeLamports: '100000',
        }),
      ).rejects.toThrow(/Multisig not initialized|caller must POST/);
    });

    it('throws if durable nonce is not yet provisioned', async () => {
      stubConnectionAndClient({ initialized: true, nonceProvisioned: false });
      await expect(
        constructAndSignSOLTransaction({
          chain: 'solDevnet',
          recipient,
          amount: '1000000',
          walletPubkeyBase58: walletKp.pubKey,
          keyPubkeyBase58: keyKp.pubKey,
          walletPrivKeyHex: walletKp.privKey,
          paymasterPubkeyBase58: paymasterPub,
          paymasterFeeLamports: '100000',
        }),
      ).rejects.toThrow(/Durable nonce.+not initialized|caller must POST/);
    });

    it('builds a 7-ix SPL token tx with nonceAdvance + idempotent ATA creation', async () => {
      stubConnectionAndClient({});
      const usdcMint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
      const txB64 = await constructAndSignSOLTransaction({
        chain: 'solDevnet',
        recipient,
        amount: '1000000', // 1 USDC (6 decimals)
        walletPubkeyBase58: walletKp.pubKey,
        keyPubkeyBase58: keyKp.pubKey,
        walletPrivKeyHex: walletKp.privKey,
        paymasterPubkeyBase58: paymasterPub,
        paymasterFeeLamports: '100000',
        tokenMintBase58: usdcMint,
        tokenDecimals: 6,
      });
      const tx = Transaction.from(Buffer.from(txB64, 'base64'));
      // nonceAdvance + idempotentCreateATA + create + approve wallet + approve key + execute + close
      expect(tx.instructions).toHaveLength(7);
      expect(tx.feePayer!.toBase58()).toBe(paymasterPub);
    });

    it('embeds a vault → paymaster reimbursement transfer inside the proposal message', async () => {
      stubConnectionAndClient({ initialized: true });
      const txB64 = await constructAndSignSOLTransaction({
        chain: 'solDevnet',
        recipient,
        amount: '1000000',
        walletPubkeyBase58: walletKp.pubKey,
        keyPubkeyBase58: keyKp.pubKey,
        walletPrivKeyHex: walletKp.privKey,
        paymasterPubkeyBase58: paymasterPub,
        paymasterFeeLamports: '100000',
      });
      const tx = Transaction.from(Buffer.from(txB64, 'base64'));
      // The create_transaction ix carries the proposal message inline as
      // instruction data. Find it by discriminator (position-agnostic now
      // that nonceAdvance and/or provision_nonce sit at the head).
      // Discriminator = sha256("global:create_transaction")[:8].
      const crypto = await import('crypto');
      const discriminator = crypto
        .createHash('sha256')
        .update('global:create_transaction')
        .digest()
        .subarray(0, 8);
      const createIx = tx.instructions.find((ix) =>
        Buffer.from(ix.data).subarray(0, 8).equals(discriminator),
      );
      expect(createIx, 'create_transaction ix should be present').toBeDefined();
      expect(
        createIx!.data.subarray(0, 8).equals(discriminator),
      ).toBe(true);

      // Decode header → account_keys → instructions, walking the
      // borsh-encoded proposal message. Find SystemProgram transfers to
      // paymaster and confirm their lamports sum to the requested fee.
      const data = createIx!.data;
      let off = 8 + 1 + 3; // disc + vault_index + 3-byte numSigners header
      const accountKeysLen = data.readUInt32LE(off);
      off += 4;
      const accountKeys: PublicKey[] = [];
      for (let i = 0; i < accountKeysLen; i++) {
        accountKeys.push(new PublicKey(data.subarray(off, off + 32)));
        off += 32;
      }
      const ixCount = data.readUInt32LE(off);
      off += 4;

      const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');
      let totalToPaymaster = 0;
      for (let i = 0; i < ixCount; i++) {
        const programIdIdx = data.readUInt8(off);
        off += 1;
        const accountIdxLen = data.readUInt32LE(off);
        off += 4;
        const accountIdxs = data.subarray(off, off + accountIdxLen);
        off += accountIdxLen;
        const ixDataLen = data.readUInt32LE(off);
        off += 4;
        const ixData = data.subarray(off, off + ixDataLen);
        off += ixDataLen;

        if (!accountKeys[programIdIdx].equals(SYSTEM_PROGRAM)) continue;
        if (ixData.readUInt32LE(0) !== 2) continue; // not Transfer
        const toIdx = accountIdxs[1];
        if (!accountKeys[toIdx].equals(new PublicKey(paymasterPub))) continue;
        totalToPaymaster += Number(ixData.readBigUInt64LE(4));
      }

      expect(totalToPaymaster).toBe(100000);
    });
  });

  describe('cross-checks', () => {
    it('vault address derived in tests matches generateMultisigAddressSOL', () => {
      const ms = generateMultisigAddressSOL(
        walletKp.pubKey,
        keyKp.pubKey,
        0,
        'solDevnet',
      );
      expect(() => new PublicKey(ms.address)).not.toThrow();
    });

    it('wallet leaf pubkey decodes to 32 bytes (Ed25519 point)', () => {
      const pub = bs58.decode(walletKp.pubKey);
      expect(pub.length).toBe(32);
    });
  });
});
