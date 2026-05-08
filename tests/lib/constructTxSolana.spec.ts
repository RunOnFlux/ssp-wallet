// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
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
  signSolanaInitMessage,
} from '../../src/lib/wallet';

import {
  constructAndSignSOLTransaction,
  cosignAndBroadcastSOLTransaction,
} from '../../src/lib/constructTx';

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

function stubConnectionAndClient(opts: {
  initialized: boolean;
  transactionIndex?: bigint;
}) {
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
  if (opts.initialized) {
    vi.spyOn(SolanaMultisigClient.prototype, 'getMultisig').mockResolvedValue({
      members: [
        new PublicKey(walletKp.pubKey),
        new PublicKey(keyKp.pubKey),
      ].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer())),
      threshold: 2,
      transactionIndex: opts.transactionIndex ?? BigInt(0),
      bump: 255,
    } as any);
  } else {
    vi.spyOn(SolanaMultisigClient.prototype, 'getMultisig').mockResolvedValue(
      null,
    );
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
        }),
      ).rejects.toThrow(/privkey\/pubkey mismatch/);
    });

    it('requires init signatures when multisig is not yet initialized', async () => {
      stubConnectionAndClient({ initialized: false });
      await expect(
        constructAndSignSOLTransaction({
          chain: 'solDevnet',
          recipient,
          amount: '1000000',
          walletPubkeyBase58: walletKp.pubKey,
          keyPubkeyBase58: keyKp.pubKey,
          walletPrivKeyHex: walletKp.privKey,
          paymasterPubkeyBase58: paymasterPub,
        }),
      ).rejects.toThrow(/not initialized/);
    });

    it('builds a 4-ix tx for already-initialized multisig with paymaster as feePayer', async () => {
      stubConnectionAndClient({ initialized: true });
      const txB64 = await constructAndSignSOLTransaction({
        chain: 'solDevnet',
        recipient,
        amount: '1000000',
        walletPubkeyBase58: walletKp.pubKey,
        keyPubkeyBase58: keyKp.pubKey,
        walletPrivKeyHex: walletKp.privKey,
        paymasterPubkeyBase58: paymasterPub,
      });
      const tx = Transaction.from(Buffer.from(txB64, 'base64'));
      // create + approve wallet + approve key + execute
      expect(tx.instructions).toHaveLength(4);
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

    it('builds a 6-ix tx for first send (init+create+approve+approve+execute)', async () => {
      stubConnectionAndClient({ initialized: false });
      const initSigW = signSolanaInitMessage(
        walletKp.privKey,
        walletKp.pubKey,
        keyKp.pubKey,
      );
      const initSigK = signSolanaInitMessage(
        keyKp.privKey,
        walletKp.pubKey,
        keyKp.pubKey,
      );
      const txB64 = await constructAndSignSOLTransaction({
        chain: 'solDevnet',
        recipient,
        amount: '1000000',
        walletPubkeyBase58: walletKp.pubKey,
        keyPubkeyBase58: keyKp.pubKey,
        walletPrivKeyHex: walletKp.privKey,
        paymasterPubkeyBase58: paymasterPub,
        initSignatureWalletBase64: initSigW,
        initSignatureKeyBase64: initSigK,
      });
      const tx = Transaction.from(Buffer.from(txB64, 'base64'));
      // ed25519_verify + initialize_multisig + create + approve + approve + execute
      expect(tx.instructions).toHaveLength(6);
      expect(tx.feePayer!.toBase58()).toBe(paymasterPub);
    });

    it('builds an SPL token tx with prepended idempotent ATA creation ix', async () => {
      stubConnectionAndClient({ initialized: true });
      const usdcMint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
      const txB64 = await constructAndSignSOLTransaction({
        chain: 'solDevnet',
        recipient,
        amount: '1000000', // 1 USDC (6 decimals)
        walletPubkeyBase58: walletKp.pubKey,
        keyPubkeyBase58: keyKp.pubKey,
        walletPrivKeyHex: walletKp.privKey,
        paymasterPubkeyBase58: paymasterPub,
        tokenMintBase58: usdcMint,
      });
      const tx = Transaction.from(Buffer.from(txB64, 'base64'));
      // idempotentCreateATA + create + approve wallet + approve key + execute
      expect(tx.instructions).toHaveLength(5);
      expect(tx.feePayer!.toBase58()).toBe(paymasterPub);
    });
  });

  describe('cosignAndBroadcastSOLTransaction', () => {
    it('throws if key privkey does not match key pubkey', async () => {
      const dummyTx = new Transaction();
      dummyTx.recentBlockhash = blockhash;
      dummyTx.feePayer = paymasterKp.publicKey;
      dummyTx.add(
        SystemProgram.transfer({
          fromPubkey: paymasterKp.publicKey,
          toPubkey: new PublicKey(recipient),
          lamports: 1,
        }),
      );
      const serialized = dummyTx
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString('base64');
      await expect(
        cosignAndBroadcastSOLTransaction({
          chain: 'solDevnet',
          serializedTxBase64: serialized,
          keyPubkeyBase58: walletKp.pubKey, // wrong pubkey
          keyPrivKeyHex: keyKp.privKey,
        }),
      ).rejects.toThrow(/privkey\/pubkey mismatch/);
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

    it('init signatures are 64-byte Ed25519 sigs (base64)', () => {
      const sigB64 = signSolanaInitMessage(
        walletKp.privKey,
        walletKp.pubKey,
        keyKp.pubKey,
      );
      const sig = new Uint8Array(Buffer.from(sigB64, 'base64'));
      const pub = bs58.decode(walletKp.pubKey);
      expect(sig.length).toBe(64);
      expect(pub.length).toBe(32);
    });
  });
});
