// @ts-nocheck test suite
/**
 * Kaspa send + enterprise co-signing against a mocked kaspa-rest-server.
 *
 * Consumer: the wallet plans and half-signs; a second localSigner plays SSP
 * Key exactly as contract §5 prescribes (own UTXO lookup → openSigningBundle →
 * describeTransaction → co-sign with onlyScripts + signedAmounts → finalize).
 * Enterprise: M-of-N proposals signed by several wallets in turn, each opening
 * the bundle with its own lookup and returning the merged bundle JSON.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as K from '@runonflux/kaspa-core';
import { createRestClient } from '@runonflux/kaspa-core/rest';

vi.mock('localforage', () => {
  const mem = new Map();
  return {
    default: {
      getItem: vi.fn(async (k) => mem.get(k) ?? null),
      setItem: vi.fn(async (k, v) => {
        mem.set(k, v);
      }),
    },
  };
});

import {
  getMasterXpub,
  getMasterXpriv,
  generateMultisigAddress,
  generateAddressKeypair,
} from '../../src/lib/wallet';
import {
  planKasSend,
  signKasSend,
  describeKasBundle,
  kasMultisigSpend,
  kasSpendToMultisig,
  kasSpendAddress,
  signKasVaultBundle,
  decodeKasVaultProposal,
  kasLeafXOnlyKey,
  resolveKasProposalVault,
  estimateKasSendAllFee,
  estimateKasSwapFeeUnits,
  fetchKasFeeRates,
  isKasTransactionKnown,
  kasSignedAmountLedger,
  isKasSigningBundleJson,
} from '../../src/lib/kaspa';
import {
  fetchUtxos,
  constructAndSignTransaction,
} from '../../src/lib/constructTx';
import {
  kasMaxFeeSompi,
  unitsToSompi,
  sompiToUnits,
  kasPlanErrorKey,
  kasAmountExceedsBalance,
} from '../../src/lib/sendStrategies/kas';

const chain = 'kas';
const HOST = 'https://api-kaspa.sspwallet.io';
const W =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const Kk =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const S3 =
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';
const Z = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

const xpub = (m, account) =>
  getMasterXpub(m, 48, 111111, account, 'p2sh', chain);
const xpriv = (m, account) =>
  getMasterXpriv(m, 48, 111111, account, 'p2sh', chain);

// ---------------------------------------------------------------------------
// Mock kaspa-rest-server
// ---------------------------------------------------------------------------

/** address → REST-shaped UTXOs */
let utxoBook: Record<string, unknown[]> = {};
let knownTxs = new Set<string>();

function restUtxo(
  address: string,
  txid: string,
  index: number,
  amount: bigint,
) {
  const spk = K.addressToScriptPublicKey(address, 'kaspa');
  return {
    address,
    outpoint: { transactionId: txid, index },
    utxoEntry: {
      amount: amount.toString(),
      scriptPublicKey: { scriptPublicKey: K.bytesToHex(spk.script) },
      blockDaaScore: '1000',
      isCoinbase: false,
    },
  };
}

function reply(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const fetchMock = vi.fn(async (url: string, init: { body?: string }) => {
  const path = url.replace(HOST, '');
  let m = path.match(/^\/addresses\/([^/]+)\/utxos$/);
  if (m) return reply(utxoBook[decodeURIComponent(m[1])] ?? []);
  if (path === '/addresses/utxos') {
    const { addresses } = JSON.parse(init.body ?? '{}');
    return reply(addresses.flatMap((a) => utxoBook[a] ?? []));
  }
  if (path === '/info/blockdag') return reply({ virtualDaaScore: '5000000' });
  if (path === '/info/fee-estimate')
    return reply({
      priorityBucket: { feerate: 3000, estimatedSeconds: 1 },
      normalBuckets: [{ feerate: 1000, estimatedSeconds: 5 }],
      lowBuckets: [{ feerate: 100, estimatedSeconds: 60 }],
    });
  m = path.match(/^\/transactions\/([0-9a-f]{64})/);
  if (m) {
    if (knownTxs.has(m[1])) return reply({ transaction_id: m[1] });
    return reply({ detail: 'Transaction not found' }, 404);
  }
  return reply({ detail: `unmocked ${path}` }, 500);
});

beforeEach(() => {
  utxoBook = {};
  knownTxs = new Set();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const txidHex = (n: number) => n.toString(16).padStart(64, '0');
const KAS = 100_000_000n;

// SSP Key's side of contract §5, with its own REST client and ledger.
async function keyCoSign(payload: string, keyMnemonic: string, path) {
  const [typeIndex, addressIndex] = path;
  const walletXpub = xpub(W, 0);
  const keyXpub = xpub(keyMnemonic, 0);
  const { address } = generateMultisigAddress(
    walletXpub,
    keyXpub,
    typeIndex,
    addressIndex,
    chain,
  );
  const vault = kasMultisigSpend(
    [walletXpub, keyXpub],
    2,
    typeIndex,
    addressIndex,
    chain,
  );
  const rest = createRestClient({ baseUrl: HOST, prefix: 'kaspa' });
  const trustedUtxos = await rest.getUtxos([address]);
  const opened = K.openSigningBundle(JSON.parse(payload), { trustedUtxos });
  const summary = K.describeTransaction(opened.tx, opened.inputs, {
    prefix: 'kaspa',
    ownScripts: [K.spendScriptPublicKey(vault)],
  });
  const keyPriv = generateAddressKeypair(
    xpriv(keyMnemonic, 0),
    typeIndex,
    addressIndex,
    chain,
  ).privKey;
  const signer = K.localSigner(K.hexToBytes(keyPriv));
  const ledger = new Map();
  const keyPartials = await K.signTransaction(
    opened.tx,
    opened.inputs,
    [signer],
    {
      onlyScripts: [K.spendScriptPublicKey(vault)],
      signedAmounts: {
        get: (o) => ledger.get(o),
        set: (o, a) => void ledger.set(o, a),
      },
    },
  );
  signer.destroy();
  const signed = K.finalizeTransaction(
    opened.tx,
    opened.inputs,
    K.mergePartialSignatures(keyPartials, opened.partials),
  );
  return { signed, summary, opened };
}

// ---------------------------------------------------------------------------
// Consumer 2-of-2
// ---------------------------------------------------------------------------

describe('Kaspa consumer send (plan → wallet half-sign → key co-sign)', () => {
  const walletXpub = xpub(W, 0);
  const keyXpub = xpub(Kk, 0);
  const sender = generateMultisigAddress(walletXpub, keyXpub, 0, 0, chain);
  const receiver = generateMultisigAddress(walletXpub, keyXpub, 1, 0, chain);
  const walletPriv = generateAddressKeypair(xpriv(W, 0), 0, 0, chain).privKey;

  const fund = () => {
    utxoBook[sender.address] = [
      restUtxo(sender.address, txidHex(1), 0, 3n * KAS),
      restUtxo(sender.address, txidHex(2), 1, 2n * KAS),
    ];
  };

  it('plans with an exact fee and change back to the sending vault', async () => {
    fund();
    const rates = await fetchKasFeeRates(chain);
    expect(rates).toEqual({ economy: 100n, normal: 1000n, fast: 3000n });
    const planned = await planKasSend({
      chain,
      xpubWallet: walletXpub,
      xpubKey: keyXpub,
      typeIndex: 0,
      addressIndex: 0,
      receiver: receiver.address,
      amountSompi: 4n * KAS,
      feeRate: rates.normal,
      maxFeeSompi: 5n * KAS,
    });
    expect(planned.sender).toBe(sender.address);
    const f = planned.plan.final;
    expect(planned.plan.stages).toHaveLength(0);
    expect(f.fee).toBeGreaterThan(0n);
    expect(f.fee).toBe(f.mass.max * 1000n);
    expect(f.tx.outputs[0].value).toBe(4n * KAS);
    const change = f.tx.outputs[f.changeIndex];
    expect(K.scriptPublicKeyToAddress(change.scriptPublicKey, 'kaspa')).toBe(
      sender.address,
    );
    expect(f.tx.outputs.reduce((a, o) => a + o.value, 0n) + f.fee).toBe(
      5n * KAS,
    );
    expect(f.tx.payload.length).toBe(0);
  });

  it('wallet bundle opens and co-signs on the key; the txid is known before signing', async () => {
    fund();
    const planned = await planKasSend({
      chain,
      xpubWallet: walletXpub,
      xpubKey: keyXpub,
      typeIndex: 0,
      addressIndex: 0,
      receiver: receiver.address,
      amountSompi: 1n * KAS,
      feeRate: 1000n,
      maxFeeSompi: 5n * KAS,
    });
    const { payload, txid } = await signKasSend(
      planned,
      walletPriv,
      kasSignedAmountLedger(),
    );
    expect(isKasSigningBundleJson(payload)).toBe(true);
    const bundle = JSON.parse(payload);
    expect(bundle.format).toBe('kaspa-core-signing-bundle');
    expect(bundle.version).toBe(1);
    expect(bundle.partials).toHaveLength(bundle.inputs.length);
    expect(txid).toBe(K.bytesToHex(planned.plan.final.id));

    const { signed, summary } = await keyCoSign(payload, Kk, [0, 0]);
    expect(summary.warnings).toEqual([]);
    expect(summary.sent).toBe(1n * KAS);
    expect(summary.outputs.find((o) => !o.isOwn).address).toBe(
      receiver.address,
    );
    // Kaspa IDs exclude signature scripts: the broadcast ID is the planned one
    expect(K.bytesToHex(K.transactionId(signed))).toBe(txid);
    expect(signed.inputs.every((i) => i.signatureScript.length > 0)).toBe(true);

    // pending-list description of the wallet's own payload
    const d = describeKasBundle(payload, chain);
    expect(d.sender).toBe(sender.address);
    expect(d.receiver).toBe(receiver.address);
    expect(d.amount).toBe((1n * KAS).toString());
  });

  it('the key refuses a bundle whose amounts disagree with its own lookup', async () => {
    fund();
    const planned = await planKasSend({
      chain,
      xpubWallet: walletXpub,
      xpubKey: keyXpub,
      typeIndex: 0,
      addressIndex: 0,
      receiver: receiver.address,
      amountSompi: 1n * KAS,
      feeRate: 1000n,
      maxFeeSompi: 5n * KAS,
    });
    const { payload } = await signKasSend(planned, walletPriv);
    // the key's view: one of the inputs is worth less than the bundle claims
    utxoBook[sender.address] = [
      restUtxo(sender.address, txidHex(1), 0, 3n * KAS - 1n),
      restUtxo(sender.address, txidHex(2), 1, 2n * KAS - 1n),
    ];
    await expect(keyCoSign(payload, Kk, [0, 0])).rejects.toThrow(/amount/);
  });

  it('sendAll gives the max amount (single output, no change)', async () => {
    fund();
    const planned = await planKasSend({
      chain,
      xpubWallet: walletXpub,
      xpubKey: keyXpub,
      typeIndex: 0,
      addressIndex: 0,
      receiver: receiver.address,
      amountSompi: 0n,
      sendAll: true,
      feeRate: 1000n,
      maxFeeSompi: 5n * KAS,
    });
    const f = planned.plan.final;
    expect(f.tx.outputs).toHaveLength(1);
    expect(f.tx.outputs[0].value + f.fee).toBe(5n * KAS);

    // the swap estimate (no xpubs) prices the same sweep identically
    const est = await estimateKasSendAllFee(sender.address, chain);
    expect(est.balance).toBe(5n * KAS);
    expect(est.fee).toBe(f.fee);
  });

  it('refuses to plan above maxFee and on insufficient funds', async () => {
    fund();
    const base = {
      chain,
      xpubWallet: walletXpub,
      xpubKey: keyXpub,
      typeIndex: 0,
      addressIndex: 0,
      receiver: receiver.address,
      feeRate: 1000n,
    };
    const tooHigh = planKasSend({
      ...base,
      amountSompi: 1n * KAS,
      maxFeeSompi: 1000n,
    }).catch((e) => e);
    expect(kasPlanErrorKey(await tooHigh)).toBe('send:err_kas_fee_too_high');
    const broke = planKasSend({
      ...base,
      amountSompi: 50n * KAS,
      maxFeeSompi: 5n * KAS,
    }).catch((e) => e);
    expect(kasPlanErrorKey(await broke)).toBe(
      'send:err_kas_insufficient_funds',
    );
  });

  it('the persistent ledger refuses re-signing an outpoint under another amount', async () => {
    fund();
    const ledger = kasSignedAmountLedger();
    const args = {
      chain,
      xpubWallet: walletXpub,
      xpubKey: keyXpub,
      typeIndex: 0,
      addressIndex: 0,
      receiver: receiver.address,
      amountSompi: 1n * KAS,
      feeRate: 1000n,
      maxFeeSompi: 5n * KAS,
    };
    await signKasSend(await planKasSend(args), walletPriv, ledger);
    utxoBook[sender.address] = [
      restUtxo(sender.address, txidHex(1), 0, 4n * KAS),
      restUtxo(sender.address, txidHex(2), 1, 2n * KAS),
    ];
    await expect(
      signKasSend(await planKasSend(args), walletPriv, ledger),
    ).rejects.toThrow(/different amount/);
  });

  it('polls the indexer by the known txid', async () => {
    const id = txidHex(77);
    expect(await isKasTransactionKnown(id, chain)).toBe(false);
    knownTxs.add(id);
    expect(await isKasTransactionKnown(id, chain)).toBe(true);
  });

  it('never routes kas through the utxolib / insight paths', async () => {
    await expect(fetchUtxos(sender.address, chain)).rejects.toThrow(/Kaspa/);
    await expect(
      constructAndSignTransaction(
        chain,
        receiver.address,
        '1',
        '1',
        sender.address,
        sender.address,
        '',
        walletPriv,
        '',
        '',
        '1',
      ),
    ).rejects.toThrow(/Kaspa/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Kaspa send-strategy helpers', () => {
  it('converts units and sompi exactly', () => {
    expect(unitsToSompi('1.5', 8)).toBe(150000000n);
    expect(unitsToSompi('0.00000001', 8)).toBe(1n);
    expect(unitsToSompi('0.000000001', 8)).toBeNull();
    expect(unitsToSompi('', 8)).toBeNull();
    expect(unitsToSompi('abc', 8)).toBeNull();
    expect(unitsToSompi('0', 8)).toBeNull();
    expect(sompiToUnits(150000000n, 8)).toBe('1.5');
  });

  it('caps maxFee at min(USD limit, chain maxFee)', () => {
    // $100 at $0.10/KAS = 1000 KAS → capped by the 5 KAS chain limit
    expect(kasMaxFeeSompi(100, 0.1, 8, 500000000)).toBe(500000000n);
    // $100 at $1000/KAS = 0.1 KAS
    expect(kasMaxFeeSompi(100, 1000, 8, 500000000)).toBe(10000000n);
    // unknown price → chain cap only
    expect(kasMaxFeeSompi(100, 0, 8, 500000000)).toBe(500000000n);
  });

  it('flags amount + fee above balance, tolerating half-typed input', () => {
    expect(kasAmountExceedsBalance('4', '0.01', '400000000', 8)).toBe(true);
    expect(kasAmountExceedsBalance('3.99', '0.01', '400000000', 8)).toBe(false);
    expect(kasAmountExceedsBalance('.', '0.01', '400000000', 8)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Enterprise M-of-N (contract §3–§5)
// ---------------------------------------------------------------------------

describe('Kaspa enterprise proposals', () => {
  const ORG = 100;
  const recipient = generateMultisigAddress(
    xpub(W, 0),
    xpub(Kk, 0),
    0,
    0,
    chain,
  ).address;

  // backend role: plan from the vault UTXOs, unsigned bundle, inputDetails
  async function propose(spend, addressIndex = 0) {
    const vaultAddress = kasSpendAddress(spend, chain);
    utxoBook[vaultAddress] = [
      restUtxo(vaultAddress, txidHex(10), 0, 7n * KAS),
      restUtxo(vaultAddress, txidHex(11), 2, 1n * KAS),
    ];
    const rest = createRestClient({ baseUrl: HOST, prefix: 'kaspa' });
    const utxos = await rest.getUtxos([vaultAddress]);
    const plan = K.planTransaction(
      utxos.map((u) => ({ outpoint: u.outpoint, entry: u.entry, spend })),
      [
        {
          scriptPublicKey: K.addressToScriptPublicKey(recipient, 'kaspa'),
          amount: 7n * KAS,
        },
      ],
      { feeRate: 1000n, changeSpend: spend, allowChain: false },
    );
    const { redeemScript } = kasSpendToMultisig(spend, chain);
    return {
      plan,
      vaultAddress,
      rawUnsignedTx: JSON.stringify(
        K.createSigningBundle(plan.final.tx, plan.final.inputs),
      ),
      inputDetails: plan.final.inputs.map(() => ({
        addressIndex,
        redeemScript,
      })),
    };
  }

  const sign = (bundleJson, inputDetails, mnemonic, vaultIndex = 0) =>
    signKasVaultBundle({
      bundleJson,
      chain,
      inputDetails,
      vaultXpriv: xpriv(mnemonic, ORG),
      vaultIndex,
      signedAmounts: kasSignedAmountLedger(),
    });

  it('single-device 2-of-3: two signers in turn reach the threshold', async () => {
    const spend = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      0,
      chain,
    );
    const p = await propose(spend);

    const decoded = await decodeKasVaultProposal(
      p.rawUnsignedTx,
      chain,
      p.inputDetails,
    );
    expect(decoded.error).toBeUndefined();
    expect(decoded.sender).toBe(p.vaultAddress);
    expect(decoded.recipients).toEqual([
      { address: recipient, amount: (7n * KAS).toString() },
    ]);
    expect(decoded.fee).toBe(p.plan.final.fee.toString());
    expect(decoded.warnings).toEqual([]);

    const afterW = await sign(p.rawUnsignedTx, p.inputDetails, W);
    expect(JSON.parse(afterW).partials).toHaveLength(p.inputDetails.length);
    const afterS3 = await sign(afterW, p.inputDetails, S3);
    const bundle = JSON.parse(afterS3);
    expect(bundle.partials).toHaveLength(2 * p.inputDetails.length);

    // backend: open with its own lookup, finalise at threshold
    const opened = K.openSigningBundle(bundle, {
      trustedUtxos: await createRestClient({
        baseUrl: HOST,
        prefix: 'kaspa',
      }).getUtxos([p.vaultAddress]),
    });
    const signed = K.finalizeTransaction(
      opened.tx,
      opened.inputs,
      opened.partials,
    );
    expect(K.bytesToHex(K.transactionId(signed))).toBe(
      K.bytesToHex(p.plan.final.id),
    );
  });

  it('dual mode 4-of-4: wallet → key → wallet → key, then finalises', async () => {
    const spend = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG), xpub(Z, ORG)],
      4,
      0,
      0,
      chain,
    );
    const p = await propose(spend);
    let current = p.rawUnsignedTx;
    for (const m of [W, Kk, S3, Z]) {
      current = await sign(current, p.inputDetails, m);
    }
    const opened = K.openSigningBundle(JSON.parse(current), {
      trustedUtxos: await createRestClient({
        baseUrl: HOST,
        prefix: 'kaspa',
      }).getUtxos([p.vaultAddress]),
    });
    expect(opened.partials).toHaveLength(4 * p.inputDetails.length);
    expect(() =>
      K.finalizeTransaction(opened.tx, opened.inputs, opened.partials),
    ).not.toThrow();
  });

  it('refuses when the proposer lies about an input amount', async () => {
    const spend = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      0,
      chain,
    );
    const p = await propose(spend);
    utxoBook[p.vaultAddress] = [
      restUtxo(p.vaultAddress, txidHex(10), 0, 7n * KAS + 5n),
      restUtxo(p.vaultAddress, txidHex(11), 2, 1n * KAS),
    ];
    await expect(sign(p.rawUnsignedTx, p.inputDetails, W)).rejects.toThrow(
      /amount/,
    );
    const decoded = await decodeKasVaultProposal(
      p.rawUnsignedTx,
      chain,
      p.inputDetails,
    );
    expect(decoded.error).toMatch(/amount/);
  });

  it('refuses a wallet that is not a signer of the vault', async () => {
    const spend = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      0,
      chain,
    );
    const p = await propose(spend);
    await expect(sign(p.rawUnsignedTx, p.inputDetails, Z)).rejects.toThrow(
      /not a signer/,
    );
    // wrong vaultIndex derives a different leaf → not a signer either
    await expect(sign(p.rawUnsignedTx, p.inputDetails, W, 1)).rejects.toThrow(
      /not a signer/,
    );
  });

  it('refuses inputDetails that do not name the spent vault script', async () => {
    const spend = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      0,
      chain,
    );
    const other = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      1,
      chain,
    );
    const p = await propose(spend);
    const lying = p.inputDetails.map((d) => ({
      ...d,
      redeemScript: kasSpendToMultisig(other, chain).redeemScript,
    }));
    await expect(sign(p.rawUnsignedTx, lying, W)).rejects.toThrow();
  });

  it('refuses a bundle carrying a forged partial signature', async () => {
    const spend = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      0,
      chain,
    );
    const p = await propose(spend);
    const afterW = JSON.parse(await sign(p.rawUnsignedTx, p.inputDetails, W));
    afterW.partials[0].signature =
      afterW.partials[0].signature.slice(0, -2) +
      (afterW.partials[0].signature.endsWith('00') ? '01' : '00');
    await expect(
      sign(JSON.stringify(afterW), p.inputDetails, Kk),
    ).rejects.toThrow(/invalid partial/);
  });
});

// ---------------------------------------------------------------------------
// Contract §4.7 — one vault script per enterprise proposal (C1 regression)
// ---------------------------------------------------------------------------

describe('Kaspa enterprise: one vault script per proposal (S_att attack)', () => {
  const ORG = 100;
  const recipient = generateMultisigAddress(
    xpub(W, 0),
    xpub(Kk, 0),
    0,
    0,
    chain,
  ).address;
  const vaultSpend = () =>
    kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      0,
      chain,
    );
  // The attacker knows the xpubs, so it can build S_att = 1-of-2
  // {wallet leaf at org'/0/0, attacker key}: a script the wallet's key
  // belongs to, whose funds the attacker alone controls.
  const attackerPriv = new Uint8Array(32).fill(7);
  const attackSpend = () =>
    K.multisigSpend(
      [
        kasLeafXOnlyKey(xpub(W, ORG), 0, 0, chain),
        K.xOnlyPublicKey(attackerPriv),
      ],
      1,
    );

  async function mixedProposal() {
    const vault = vaultSpend();
    const att = attackSpend();
    const vaultAddress = kasSpendAddress(vault, chain);
    const attAddress = kasSpendAddress(att, chain);
    utxoBook[vaultAddress] = [
      restUtxo(vaultAddress, txidHex(20), 0, 7n * KAS),
      restUtxo(vaultAddress, txidHex(21), 1, 1n * KAS),
    ];
    utxoBook[attAddress] = [restUtxo(attAddress, txidHex(22), 0, KAS / 10n)];
    const rest = createRestClient({ baseUrl: HOST, prefix: 'kaspa' });
    const inputs = [
      ...(await rest.getUtxos([vaultAddress])).map((u) => ({
        outpoint: u.outpoint,
        entry: u.entry,
        spend: vault,
      })),
      ...(await rest.getUtxos([attAddress])).map((u) => ({
        outpoint: u.outpoint,
        entry: u.entry,
        spend: att,
      })),
    ];
    // Every input — the vault's AND S_att's — with a small payment to the
    // displayed recipient; nearly everything else goes to S_att.
    const tx = K.createTransaction({
      inputs,
      outputs: [
        {
          value: KAS / 10n,
          scriptPublicKey: K.addressToScriptPublicKey(recipient, 'kaspa'),
        },
        {
          value: 8n * KAS - 1_000_000n,
          scriptPublicKey: K.spendScriptPublicKey(att),
        },
      ],
    });
    const plan = { final: { tx, inputs } };
    const f = plan.final;
    const detailFor = (spend) => ({
      addressIndex: 0,
      redeemScript: kasSpendToMultisig(spend, chain).redeemScript,
    });
    const scriptOf = (i) =>
      K.bytesToHex(f.inputs[i].entry.scriptPublicKey.script);
    const vaultScriptHex = K.bytesToHex(K.spendScriptPublicKey(vault).script);
    return {
      vault,
      att,
      vaultAddress,
      attAddress,
      plan,
      rawUnsignedTx: JSON.stringify(K.createSigningBundle(f.tx, f.inputs)),
      // What the attacker sends: each input's true script.
      honestDetails: f.inputs.map((_, i) =>
        detailFor(scriptOf(i) === vaultScriptHex ? vault : att),
      ),
      recipients: [{ address: recipient, amount: (KAS / 10n).toString() }],
    };
  }

  const sign = (p, inputDetails, extra = {}) =>
    signKasVaultBundle({
      bundleJson: p.rawUnsignedTx,
      chain,
      inputDetails,
      vaultXpriv: xpriv(W, ORG),
      vaultIndex: 0,
      signedAmounts: kasSignedAmountLedger(),
      ...extra,
    });

  it('the attack transaction really would drain the vault to S_att', async () => {
    const p = await mixedProposal();
    const toAtt = p.plan.final.tx.outputs.find((o) =>
      K.equalBytes(
        o.scriptPublicKey.script,
        K.spendScriptPublicKey(p.att).script,
      ),
    );
    expect(toAtt.value).toBeGreaterThan(7n * KAS);
    // and the wallet's leaf really is one of S_att's keys
    const own = kasLeafXOnlyKey(xpub(W, ORG), 0, 0, chain);
    expect(K.spendSigningKeys(p.att).some((k) => K.equalBytes(k, own))).toBe(
      true,
    );
  });

  it('refuses inputDetails that name the vault AND S_att', async () => {
    const p = await mixedProposal();
    expect(new Set(p.honestDetails.map((d) => d.redeemScript)).size).toBe(2);
    await expect(sign(p, p.honestDetails)).rejects.toThrow(
      /exactly one vault address/,
    );
    const decoded = await decodeKasVaultProposal(
      p.rawUnsignedTx,
      chain,
      p.honestDetails,
    );
    expect(decoded.error).toMatch(/exactly one vault address/);
    expect(decoded.recipients).toEqual([]);
  });

  it('refuses when inputDetails claim every input spends the vault', async () => {
    const p = await mixedProposal();
    const lying = p.honestDetails.map(() => ({
      addressIndex: 0,
      redeemScript: kasSpendToMultisig(p.vault, chain).redeemScript,
    }));
    await expect(sign(p, lying)).rejects.toThrow();
    const decoded = await decodeKasVaultProposal(p.rawUnsignedTx, chain, lying);
    expect(decoded.error).toBeTruthy();
  });

  it('refuses when inputDetails claim every input spends S_att', async () => {
    const p = await mixedProposal();
    const lying = p.honestDetails.map(() => ({
      addressIndex: 0,
      redeemScript: kasSpendToMultisig(p.att, chain).redeemScript,
    }));
    await expect(sign(p, lying)).rejects.toThrow();
    // and naming the real source address blocks it before any lookup
    await expect(
      sign(p, lying, { expectedSourceAddress: p.vaultAddress }),
    ).rejects.toThrow(/source address/);
  });

  it('refuses mixed addressIndex values even with one redeem script', () => {
    const redeemScript = kasSpendToMultisig(vaultSpend(), chain).redeemScript;
    expect(() =>
      resolveKasProposalVault(
        [
          { addressIndex: 0, redeemScript },
          { addressIndex: 1, redeemScript },
        ],
        chain,
      ),
    ).toThrow(/exactly one vault address/);
    expect(() => resolveKasProposalVault([{ redeemScript }], chain)).toThrow(
      /addressIndex/,
    );
    expect(() => resolveKasProposalVault([], chain)).toThrow();
  });
});

describe('Kaspa enterprise: sender, recipients and fee ceiling checks', () => {
  const ORG = 100;
  const recipient = generateMultisigAddress(
    xpub(W, 0),
    xpub(Kk, 0),
    0,
    0,
    chain,
  ).address;

  async function propose() {
    const spend = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      0,
      chain,
    );
    const vaultAddress = kasSpendAddress(spend, chain);
    utxoBook[vaultAddress] = [restUtxo(vaultAddress, txidHex(30), 0, 5n * KAS)];
    const rest = createRestClient({ baseUrl: HOST, prefix: 'kaspa' });
    const utxos = await rest.getUtxos([vaultAddress]);
    const plan = K.planTransaction(
      utxos.map((u) => ({ outpoint: u.outpoint, entry: u.entry, spend })),
      [
        {
          scriptPublicKey: K.addressToScriptPublicKey(recipient, 'kaspa'),
          amount: 2n * KAS,
        },
      ],
      { feeRate: 1000n, changeSpend: spend, allowChain: false },
    );
    const { redeemScript } = kasSpendToMultisig(spend, chain);
    return {
      plan,
      vaultAddress,
      rawUnsignedTx: JSON.stringify(
        K.createSigningBundle(plan.final.tx, plan.final.inputs),
      ),
      inputDetails: plan.final.inputs.map(() => ({
        addressIndex: 0,
        redeemScript,
      })),
      recipients: [{ address: recipient, amount: (2n * KAS).toString() }],
    };
  }

  it('accepts matching source address and recipients, and lists the sender', async () => {
    const p = await propose();
    const decoded = await decodeKasVaultProposal(
      p.rawUnsignedTx,
      chain,
      p.inputDetails,
      {
        expectedSourceAddress: p.vaultAddress,
        expectedRecipients: p.recipients,
      },
    );
    expect(decoded.error).toBeUndefined();
    expect(decoded.senders).toEqual([p.vaultAddress]);
    const signed = await signKasVaultBundle({
      bundleJson: p.rawUnsignedTx,
      chain,
      inputDetails: p.inputDetails,
      vaultXpriv: xpriv(W, ORG),
      vaultIndex: 0,
      expectedSourceAddress: p.vaultAddress,
      expectedRecipients: p.recipients,
      maxFee: 5n * KAS,
    });
    expect(JSON.parse(signed).partials).toHaveLength(1);
  });

  it('accepts a consolidation whose recipient is the vault itself', async () => {
    const p = await propose();
    // Re-plan paying the vault's own script instead of the external recipient.
    const spend = kasMultisigSpend(
      [xpub(W, ORG), xpub(Kk, ORG), xpub(S3, ORG)],
      2,
      0,
      0,
      chain,
    );
    const rest = createRestClient({ baseUrl: HOST, prefix: 'kaspa' });
    const utxos = await rest.getUtxos([p.vaultAddress]);
    const plan = K.planTransaction(
      utxos.map((u) => ({ outpoint: u.outpoint, entry: u.entry, spend })),
      [
        {
          scriptPublicKey: K.addressToScriptPublicKey(p.vaultAddress, 'kaspa'),
          amount: 2n * KAS,
        },
      ],
      { feeRate: 1000n, changeSpend: spend, allowChain: false },
    );
    const bundle = JSON.stringify(
      K.createSigningBundle(plan.final.tx, plan.final.inputs),
    );
    const self = [{ address: p.vaultAddress, amount: (2n * KAS).toString() }];
    const decoded = await decodeKasVaultProposal(
      bundle,
      chain,
      p.inputDetails,
      {
        expectedSourceAddress: p.vaultAddress,
        expectedRecipients: self,
      },
    );
    expect(decoded.error).toBeUndefined();
    expect(decoded.recipients.every((r) => r.address === p.vaultAddress)).toBe(
      true,
    );
    const signed = await signKasVaultBundle({
      bundleJson: bundle,
      chain,
      inputDetails: p.inputDetails,
      vaultXpriv: xpriv(W, ORG),
      vaultIndex: 0,
      expectedSourceAddress: p.vaultAddress,
      expectedRecipients: self,
      maxFee: 5n * KAS,
    });
    expect(JSON.parse(signed).partials).toHaveLength(1);
    // Wrong amount on the self recipient is still refused.
    const bad = await decodeKasVaultProposal(bundle, chain, p.inputDetails, {
      expectedRecipients: [
        { address: p.vaultAddress, amount: (2n * KAS + 1n).toString() },
      ],
    });
    expect(bad.error).toMatch(/recipients/);
  });

  it('blocks a source address that is not the vault being spent', async () => {
    const p = await propose();
    const decoded = await decodeKasVaultProposal(
      p.rawUnsignedTx,
      chain,
      p.inputDetails,
      { expectedSourceAddress: recipient },
    );
    expect(decoded.error).toMatch(/source address/);
  });

  it('blocks outputs that differ from the proposal recipients', async () => {
    const p = await propose();
    for (const expectedRecipients of [
      [{ address: recipient, amount: (2n * KAS - 1n).toString() }],
      [{ address: p.vaultAddress, amount: (2n * KAS).toString() }],
      [],
      [...p.recipients, ...p.recipients],
    ]) {
      const decoded = await decodeKasVaultProposal(
        p.rawUnsignedTx,
        chain,
        p.inputDetails,
        { expectedRecipients },
      );
      expect(decoded.error).toMatch(/recipients/);
    }
  });

  it('refuses to sign above the fee ceiling', async () => {
    const p = await propose();
    await expect(
      signKasVaultBundle({
        bundleJson: p.rawUnsignedTx,
        chain,
        inputDetails: p.inputDetails,
        vaultXpriv: xpriv(W, ORG),
        vaultIndex: 0,
        maxFee: p.plan.final.fee - 1n,
      }),
    ).rejects.toThrow();
  });

  it('flags a REST outage as transient so the screen can retry', async () => {
    const p = await propose();
    fetchMock.mockImplementationOnce(async () =>
      reply({ detail: 'down' }, 503),
    );
    const failed = await decodeKasVaultProposal(
      p.rawUnsignedTx,
      chain,
      p.inputDetails,
    );
    expect(failed.error).toBeTruthy();
    expect(failed.transient).toBe(true);
    const retried = await decodeKasVaultProposal(
      p.rawUnsignedTx,
      chain,
      p.inputDetails,
    );
    expect(retried.error).toBeUndefined();
  });
});

describe('Swap: Kaspa network fee', () => {
  it('is the exact kaspa-core sweep fee over REST UTXOs, in KAS', async () => {
    const vault = generateMultisigAddress(xpub(W, 0), xpub(Kk, 0), 0, 0, chain);
    utxoBook[vault.address] = [
      restUtxo(vault.address, txidHex(40), 0, 3n * KAS),
      restUtxo(vault.address, txidHex(41), 1, 2n * KAS),
    ];
    const { fee } = await estimateKasSendAllFee(vault.address, chain);
    expect(fee).toBeGreaterThan(0n);
    const units = await estimateKasSwapFeeUnits(vault.address, chain);
    expect(units).toBe(sompiToUnits(fee, 8));
    // only kaspa-rest was asked (never insight / blockbook)
    expect(
      fetchMock.mock.calls.every(([u]) => String(u).startsWith(HOST)),
    ).toBe(true);
  });

  it('is zero without a sender address or UTXOs', async () => {
    expect(await estimateKasSwapFeeUnits('', chain)).toBe('0');
    const vault = generateMultisigAddress(xpub(W, 0), xpub(Kk, 0), 0, 1, chain);
    expect(await estimateKasSwapFeeUnits(vault.address, chain)).toBe('0');
  });
});
