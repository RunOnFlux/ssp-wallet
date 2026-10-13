// @ts-nocheck test suite
/**
 * Enterprise vault co-signing (signKasVaultBundle, what EnterpriseVaultSignTx
 * calls) against the persistent signed-amount ledger (reviews KAS-2 / KAS-6):
 * a ledger conflict is settled by PROOF from the funding transaction
 * (rest.getFundingTransaction), exactly as on the consumer send path; only an
 * unprovable coin surfaces as KasLedgerConflictError.unprovable, which the
 * component offers to reset after an explicit warning.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as K from '@runonflux/kaspa-core';

const mem = vi.hoisted(() => ({ store: new Map() }));
vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async (k) => (mem.store.has(k) ? mem.store.get(k) : null)),
    setItem: vi.fn(async (k, v) => {
      mem.store.set(k, v);
    }),
  },
}));

import {
  getMasterXpub,
  getMasterXpriv,
  generateMultisigAddress,
} from '../../src/lib/wallet';
import {
  KAS_LEDGER_STORAGE_KEY,
  isKasLedgerConflictError,
  kasMultisigSpend,
  kasSignedAmountLedger,
  kasSpendAddress,
  kasSpendToMultisig,
  resetKasLedgerOutpoints,
  signKasVaultBundle,
} from '../../src/lib/kaspa';

const chain = 'kas';
const ORG = 100;
const KAS = 100_000_000n;
const W =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const Kk =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const S3 =
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';
const xpub = (m, account) =>
  getMasterXpub(m, 48, 111111, account, 'p2sh', chain);
const xpriv = (m, account) =>
  getMasterXpriv(m, 48, 111111, account, 'p2sh', chain);

const spend = kasMultisigSpend(
  [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
  2,
  0,
  0,
  chain,
);
const vaultAddress = kasSpendAddress(spend, chain);
const { redeemScript } = kasSpendToMultisig(spend, chain);
const vaultSpk = K.addressToScriptPublicKey(vaultAddress, 'kaspa');
const recipient = generateMultisigAddress(
  xpub(W, 0),
  xpub(Kk, 0),
  0,
  0,
  chain,
).address;

const TXID = new Uint8Array(32).fill(9);
const TXID_HEX = K.bytesToHex(TXID);
const OUTPOINT = `${TXID_HEX}:0`;
const REAL = 5n * KAS;
const LIE = REAL - 1n;
const NOW = 1_800_000_000_000;

/** A proposal spending the one vault coin, as the backend builds it. */
function proposal(amount: bigint) {
  const utxo = {
    address: vaultAddress,
    outpoint: { transactionId: TXID, index: 0 },
    entry: {
      amount,
      scriptPublicKey: vaultSpk,
      blockDaaScore: 1000n,
      isCoinbase: false,
    },
  };
  const plan = K.planTransaction(
    [{ outpoint: utxo.outpoint, entry: utxo.entry, spend }],
    [
      {
        scriptPublicKey: K.addressToScriptPublicKey(recipient, 'kaspa'),
        amount: 2n * KAS,
      },
    ],
    { feeRate: 1000n, changeSpend: spend, allowChain: false },
  );
  return {
    utxo,
    bundleJson: JSON.stringify(
      K.createSigningBundle(plan.final.tx, plan.final.inputs),
    ),
    inputDetails: plan.final.inputs.map(() => ({
      addressIndex: 0,
      redeemScript,
    })),
    expectedRecipients: [{ address: recipient, amount: (2n * KAS).toString() }],
  };
}

/** The wallet's own REST view: the UTXO set it is served + chain proofs. */
function rest(utxo, proven: bigint | 'unprovable' | null) {
  return {
    getUtxos: vi.fn(async (addresses) =>
      addresses.includes(vaultAddress) ? [utxo] : [],
    ),
    getFundingTransaction: vi.fn(async (id: string) => {
      if (proven === null || proven === 'unprovable' || id !== TXID_HEX) {
        throw new Error(`transaction ${id} could not be proven`);
      }
      return { outputs: [{ value: proven, scriptPublicKey: vaultSpk }] };
    }),
  };
}

function sign(amount: bigint, proven: bigint | 'unprovable' | null, now = NOW) {
  const p = proposal(amount);
  const r = rest(p.utxo, proven);
  return {
    r,
    run: () =>
      signKasVaultBundle({
        bundleJson: p.bundleJson,
        chain,
        inputDetails: p.inputDetails,
        vaultXpriv: xpriv(W, ORG),
        vaultIndex: 0,
        expectedSourceAddress: vaultAddress,
        expectedRecipients: p.expectedRecipients,
        maxFee: 5n * KAS,
        signedAmounts: kasSignedAmountLedger(() => now),
        rest: r,
      }),
  };
}

const stored = () => mem.store.get(KAS_LEDGER_STORAGE_KEY);

beforeEach(() => {
  mem.store.clear();
});

describe('enterprise Kaspa co-signing: ledger conflicts settled by proof', () => {
  it('records the signed amount before returning the partial', async () => {
    const s = sign(REAL, null);
    const signed = await s.run();
    expect(JSON.parse(signed).partials).toHaveLength(1);
    expect(stored()[OUTPOINT]).toBe(`${REAL}@${NOW}`);
    expect(s.r.getFundingTransaction).not.toHaveBeenCalled();
  });

  it('PoC: one lying UTXO answer no longer locks the real amount out (proof moves the entry)', async () => {
    await sign(LIE, null).run(); // the backend lied once
    expect(stored()[OUTPOINT]).toBe(`${LIE}@${NOW}`);
    const s = sign(REAL, REAL, NOW + 1);
    const signed = await s.run();
    expect(JSON.parse(signed).partials).toHaveLength(1);
    expect(s.r.getFundingTransaction).toHaveBeenCalledWith(TXID_HEX);
    expect(stored()[OUTPOINT]).toBe(`${REAL}@${NOW + 1}`);
  });

  it('proven amount = ledger entry: the contradicting claim is refused, no reset offered', async () => {
    await sign(REAL, null).run();
    const e = await sign(LIE, REAL)
      .run()
      .catch((x) => x);
    expect(isKasLedgerConflictError(e)).toBe(true);
    expect(e.refused).toEqual([OUTPOINT]);
    expect(e.unprovable).toEqual([]);
    expect(stored()[OUTPOINT]).toBe(`${REAL}@${NOW}`);
  });

  it('unprovable: refused until the user resets exactly that coin', async () => {
    await sign(LIE, null).run();
    const e = await sign(REAL, 'unprovable')
      .run()
      .catch((x) => x);
    expect(isKasLedgerConflictError(e)).toBe(true);
    expect(e.unprovable).toEqual([OUTPOINT]);
    expect(e.refused).toEqual([]);
    expect(stored()[OUTPOINT]).toBe(`${LIE}@${NOW}`);
    expect(await resetKasLedgerOutpoints(e.unprovable, () => NOW + 2)).toBe(1);
    const signed = await sign(REAL, 'unprovable', NOW + 3).run();
    expect(JSON.parse(signed).partials).toHaveLength(1);
    expect(stored()[OUTPOINT]).toBe(`${REAL}@${NOW + 3}`);
  });
});
