// @ts-nocheck test suite
/**
 * TRON operations, payloads, quotes and history (lib/tron.ts):
 *  - the fixed consumer Op of ~/repos/tron-ssp-vectors.json is rebuilt with
 *    the SDK builders and its digest and wallet signature reproduced EXACTLY,
 *    through the same function the send flow signs with;
 *  - the `ssp-tron-op` v1 payload shape (contract §3);
 *  - relay quotes are refused unless they would pass the key's consumer
 *    policy (pinned collector, ceilings, deadline window, our vault);
 *  - history: Executed-backed outgoing rows, the FeePaid fee, spoofed /
 *    zero-value / dust / non-whitelisted incoming rows dropped;
 *  - approval decoding for pending `ssp-tron-op` actions, and the utxolib
 *    guards in constructTx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import vectors from '../fixtures/tron-ssp-vectors.json';

const m = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  network: null,
}));

vi.mock('axios', () => ({ default: { post: m.post, get: m.get } }));
vi.mock('localforage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));
vi.mock('@storage/ssp', () => ({
  sspConfig: () => ({ relay: 'relay.test', maxTxFeeUSD: 100 }),
}));

const FEE_COLLECTOR = 'TFhcYVArFkJW6bPUDid4AFCAjKmh6Ez3vv';
const SPONSOR = 'TJEfVHrNkFfPdyNVFmY8cvJPm77rDQfSn3';

vi.mock('@runonflux/tron-multisig', async (importOriginal) => {
  const actual = await importOriginal();
  const vectorNet = actual.getNetwork({
    ...actual.NETWORKS.mainnet,
    name: 'ssp-vectors',
    factory: 'THEmkXNjoxz6zj7wDBtXRd1DCYeLTvRYSB',
    implementation: 'TJEfVHrNkFfPdyNVFmY8cvJPm77rDQfSn3',
    sponsor: 'TJEfVHrNkFfPdyNVFmY8cvJPm77rDQfSn3',
    feeCollector: 'TFhcYVArFkJW6bPUDid4AFCAjKmh6Ez3vv',
  });
  return {
    ...actual,
    getNetwork: (n) => (n === 'mainnet' ? vectorNet : actual.getNetwork(n)),
  };
});

import * as T from '@runonflux/tron-multisig';
import {
  TRON_TRX_FEE_TOKEN,
  buildSelfPayTronOp,
  buildSponsoredTronOp,
  buildTronHistory,
  describeTronPayloadForApproval,
  isTronLive,
  isTronOpPayload,
  parseTronOpPayload,
  parseTronQuote,
  requestTronQuote,
  signConsumerTronOp,
  tronCallsToJson,
  tronConsumerVault,
  tronTransferCall,
  tronUnits,
} from '../../src/lib/tron';
import { getMasterXpriv, generateAddressKeypair } from '../../src/lib/wallet';
import {
  decodeTransactionForApproval,
  fetchAddressTransactions,
} from '../../src/lib/transactions';
import {
  broadcastTx,
  constructAndSignTransaction,
  fetchUtxos,
} from '../../src/lib/constructTx';

const chain = 'tron';
const W =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const RECIPIENT = 'TGjtodRV2nm6tQd9hsxiecLNN9QmhhVbbD';
const { walletXpub, keyXpub } = vectors.consumer;
const vault = tronConsumerVault(walletXpub, keyXpub, 0, 0, chain);
const walletPriv = generateAddressKeypair(
  getMasterXpriv(W, 48, 195, 0, 'p2sh', chain),
  0,
  0,
  chain,
).privKey;

/** A valid relay quote for the vector Op, relative to `now`. */
const quoteFor = (over = {}) => ({
  vault: vault.address,
  deployed: true,
  nonce: '7',
  deadline: '1790000000',
  fee: {
    token: TRON_TRX_FEE_TOKEN,
    amount: '6300000',
    recipient: FEE_COLLECTOR,
  },
  feeOptions: [
    { token: TRON_TRX_FEE_TOKEN, amount: '6300000' },
    { token: USDT, amount: '3500000' },
  ],
  energy: { estimate: '102000' },
  sponsorAvailable: true,
  ...over,
});
const NOW = 1790000000n - 1800n; // deadline is 30 min ahead
const calls = () => [tronTransferCall(USDT, RECIPIENT, 25_000_000n)];

beforeEach(() => {
  m.post.mockReset();
  m.get.mockReset();
});

describe('TRON consumer Op vector (contract §3)', () => {
  it('vector vault is our 0-0 vault', () => {
    expect(vault.address).toBe(vectors.consumerOp.vault);
    expect(isTronLive('tron')).toBe(true);
  });

  it('rebuilds the fixed Op from the quote with the SDK builders', () => {
    const op = buildSponsoredTronOp({
      chain,
      vault: vault.address,
      calls: calls(),
      quote: parseTronQuote(quoteFor()),
      now: NOW,
    });
    expect(T.opToJson(op)).toEqual(vectors.consumerOp.op);
    expect(T.to0x(T.domainSeparator(728126428n, vault.address))).toBe(
      vectors.consumerOp.domainSeparator,
    );
  });

  it('signs the exact digest and wallet signature, in the ssp-tron-op v1 payload', () => {
    const op = T.opFromJson(vectors.consumerOp.op);
    const out = signConsumerTronOp({
      chain,
      config: vault.config,
      vault: vault.address,
      op,
      privKeyHex: walletPriv,
    });
    expect(out.digest).toBe(vectors.consumerOp.digest);
    expect(out.walletSignature).toBe(vectors.consumerOp.walletSignature);
    const payload = JSON.parse(out.payload);
    expect(Object.keys(payload)).toEqual([
      'format',
      'version',
      'network',
      'vault',
      'signers',
      'threshold',
      'op',
      'walletSignature',
    ]);
    expect(payload).toEqual({
      format: 'ssp-tron-op',
      version: 1,
      network: 'mainnet',
      vault: vectors.consumerOp.vault,
      signers: vectors.consumer.leaves['0-0'].signers,
      threshold: 2,
      op: vectors.consumerOp.op,
      walletSignature: vectors.consumerOp.walletSignature,
    });
    // round trip: the key parses exactly what the wallet sent
    expect(isTronOpPayload(out.payload)).toBe(true);
    const back = parseTronOpPayload(out.payload, chain);
    expect(back.vault).toBe(vault.address);
    expect(T.stringifyOp(back.op)).toBe(T.stringifyOp(op));
    // with the key's vector signature the pair assembles into the vector
    const packed = T.assembleSignatures(
      T.hexToBytes(vectors.consumerOp.digest),
      vault.config,
      [
        T.hexToBytes(out.walletSignature),
        T.hexToBytes(vectors.consumerOp.keySignature),
      ],
    );
    expect(T.to0x(packed)).toBe(vectors.consumerOp.signaturesPacked);
  });

  it('refuses to sign for a vault this key is not a member of', () => {
    const op = T.opFromJson(vectors.consumerOp.op);
    const other = T.buildConfig(
      vectors.enterpriseSingle2of3.signers.slice(0, 2),
      2,
    );
    expect(() =>
      signConsumerTronOp({
        chain,
        config: other,
        vault: vault.address,
        op,
        privKeyHex: walletPriv,
      }),
    ).toThrow(/not a vault signer/);
  });

  it('Call JSON is the SDK canonical wire form', () => {
    expect(tronCallsToJson(calls())).toEqual(vectors.consumerOp.op.calls);
    expect(tronCallsToJson([tronTransferCall('', RECIPIENT, 5n)])).toEqual([
      { to: RECIPIENT, value: '5', data: '0x', tokenId: '0', tokenValue: '0' },
    ]);
  });
});

describe('Sponsored quote checks (the key would refuse these)', () => {
  const build = (q, now = NOW) =>
    buildSponsoredTronOp({
      chain,
      vault: vault.address,
      calls: calls(),
      quote: parseTronQuote(q),
      now,
    });

  it('a quote for another vault', () => {
    expect(() =>
      build(quoteFor({ vault: vectors.consumer.leaves['0-1'].address })),
    ).toThrow(expect.objectContaining({ code: 'VAULT_MISMATCH' }));
  });

  it('a fee recipient other than the pinned collector', () => {
    expect(() =>
      build(
        quoteFor({
          fee: {
            token: TRON_TRX_FEE_TOKEN,
            amount: '6300000',
            recipient: RECIPIENT,
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'QUOTE_INVALID' }));
  });

  it('fees above the 30 TRX / 8 USDT consumer ceilings', () => {
    expect(() =>
      build(
        quoteFor({
          fee: {
            token: TRON_TRX_FEE_TOKEN,
            amount: '30000001',
            recipient: FEE_COLLECTOR,
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'FEE_TOO_HIGH' }));
    expect(() =>
      build(
        quoteFor({
          fee: { token: USDT, amount: '8000001', recipient: FEE_COLLECTOR },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'FEE_TOO_HIGH' }));
    // 8 USDT exactly is fine, as a TRC-20 fee
    const op = build(
      quoteFor({
        fee: { token: USDT, amount: '8000000', recipient: FEE_COLLECTOR },
      }),
    );
    expect(op.fee).toMatchObject({ token: USDT, amount: 8000000n });
  });

  it('a quote SSP will not sponsor (sponsorAvailable false)', () => {
    expect(() =>
      build(
        quoteFor({
          sponsorAvailable: false,
          unavailableReason: 'INSUFFICIENT_FEE_BALANCE: vault holds 0 TRX',
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'SPONSOR_UNAVAILABLE' }));
    // only an explicit true counts as sponsored
    const { sponsorAvailable: _omit, ...legacy } = quoteFor();
    void _omit;
    expect(parseTronQuote(legacy).sponsorAvailable).toBe(false);
    expect(
      parseTronQuote(
        quoteFor({ sponsorAvailable: false, unavailableReason: 'X' }),
      ).unavailableReason,
    ).toBe('X');
  });

  it('a fee token other than TRX or the network USDT', () => {
    expect(() =>
      build(
        quoteFor({
          fee: {
            token: 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz',
            amount: '1',
            recipient: FEE_COLLECTOR,
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'QUOTE_INVALID' }));
  });

  it('an expired or too-distant deadline', () => {
    expect(() => build(quoteFor(), 1790000000n)).toThrow(
      expect.objectContaining({ code: 'QUOTE_EXPIRED' }),
    );
    expect(() => build(quoteFor(), 1790000000n - 7201n)).toThrow(
      expect.objectContaining({ code: 'QUOTE_INVALID' }),
    );
  });

  it('parseTronQuote rejects malformed quotes', () => {
    expect(() => parseTronQuote({})).toThrow();
    expect(() => parseTronQuote(quoteFor({ nonce: '-1' }))).toThrow();
    expect(() => parseTronQuote(quoteFor({ nonce: '07' }))).toThrow();
    expect(() =>
      parseTronQuote(quoteFor({ vault: vault.address.toLowerCase() })),
    ).toThrow();
    const q = parseTronQuote(
      quoteFor({ maxSendable: { token: USDT, amount: '99' } }),
    );
    expect(q.maxSendable).toEqual({ token: USDT, amount: '99' });
    expect(q.feeOptions).toHaveLength(2);
  });

  it('POST /v1/tron/quote carries chain, signers, threshold, calls (+feeToken)', async () => {
    m.post.mockResolvedValue({ data: { status: 'success', data: quoteFor() } });
    const q = await requestTronQuote({
      chain,
      signers: [...vault.config.signers],
      threshold: 2,
      calls: tronCallsToJson(calls()),
      feeToken: USDT,
    });
    expect(q.nonce).toBe('7');
    const [url, body] = m.post.mock.calls[0];
    expect(url).toBe('https://relay.test/v1/tron/quote');
    expect(body).toEqual({
      chain: 'tron',
      signers: vectors.consumer.leaves['0-0'].signers,
      threshold: 2,
      calls: vectors.consumerOp.op.calls,
      feeToken: USDT,
    });
  });

  it('send-max passes max:{token} and never nonce/markup/deadline', async () => {
    m.post.mockResolvedValue({
      data: {
        status: 'success',
        data: quoteFor({ maxSendable: { token: 'TRX', amount: '93700000' } }),
      },
    });
    const q = await requestTronQuote({
      chain,
      signers: [...vault.config.signers],
      threshold: 2,
      calls: tronCallsToJson([tronTransferCall('', RECIPIENT, 100_000_000n)]),
      max: { token: 'TRX' },
    });
    expect(q.maxSendable).toEqual({ token: 'TRX', amount: '93700000' });
    const [, body] = m.post.mock.calls[0];
    expect(body.max).toEqual({ token: 'TRX' });
    expect(body).not.toHaveProperty('nonce');
    expect(body).not.toHaveProperty('markup');
    expect(body).not.toHaveProperty('deadline');
    expect(body).not.toHaveProperty('feeToken');
  });

  it('a TronSponsorRefusal sent as an HTTP error still surfaces its message', async () => {
    m.post.mockRejectedValue({
      response: {
        status: 400,
        data: {
          status: 'error',
          data: { code: '400', name: 'TronSponsorRefusal', message: 'nope' },
        },
      },
    });
    await expect(
      requestTronQuote({ chain, signers: [], threshold: 2, calls: [] }),
    ).rejects.toMatchObject({ code: 'QUOTE_FAILED', message: 'nope' });
  });

  it('a refused quote surfaces the relay message', async () => {
    m.post.mockResolvedValue({
      data: { status: 'error', data: { message: 'sponsor out of energy' } },
    });
    await expect(
      requestTronQuote({ chain, signers: [], threshold: 2, calls: [] }),
    ).rejects.toMatchObject({
      code: 'QUOTE_FAILED',
      message: 'sponsor out of energy',
    });
  });
});

describe('Self-pay Op (Advanced: pay the network fee myself)', () => {
  it('has no fee and a 30 minute deadline', () => {
    const op = buildSelfPayTronOp({
      calls: calls(),
      nonce: (1n << 28n) | 3n,
      now: NOW,
    });
    expect(op.fee).toEqual(T.noFee());
    expect(op.deadline).toBe(NOW + 1800n);
    expect(op.nonce).toBe((1n << 28n) | 3n);
  });
});

describe('Pending approval decode (decodeTransactionForApproval)', () => {
  const payload = signConsumerTronOp({
    chain,
    config: vault.config,
    vault: vault.address,
    op: T.opFromJson(vectors.consumerOp.op),
    privKeyHex: walletPriv,
  }).payload;

  it('describes the ssp-tron-op payload, never utxolib', () => {
    expect(decodeTransactionForApproval(payload, chain)).toEqual({
      sender: vault.address,
      receiver: RECIPIENT,
      amount: '25',
      fee: '6.3',
      token: USDT,
      tokenSymbol: 'USDT',
      decimals: 6,
    });
    expect(describeTronPayloadForApproval(payload, chain).receiver).toBe(
      RECIPIENT,
    );
  });

  it('refuses a payload for the other network', () => {
    const d = decodeTransactionForApproval(payload, 'tronNile');
    expect(d.sender).toBe('decodingError');
  });

  it('TRX amounts use 6 decimals (never the ?? 8 fallback)', () => {
    expect(tronUnits(1_500_000n, 6)).toBe('1.5');
    expect(tronUnits('-2000000', 6)).toBe('-2');
  });
});

describe('TRON history (contract §6 table, §5.8)', () => {
  const V = vault.address;
  const OTHER = RECIPIENT;
  const LOOKALIKE = vectors.consumer.leaves['1-0'].address;
  const hex20 = (a) => T.toHex20(a);

  const events = [
    {
      transaction_id: 'out1',
      block_number: 100,
      block_timestamp: 5000,
      event_name: 'Executed',
      result: { digest: '0x', nonce: '7', callCount: '1' },
    },
    {
      transaction_id: 'out1',
      block_number: 100,
      block_timestamp: 5000,
      event_name: 'FeePaid',
      result: {
        token: '0x0000000000000000000000000000000000000000',
        recipient: hex20(FEE_COLLECTOR),
        amount: '6300000',
      },
    },
    {
      transaction_id: 'cancel1',
      block_number: 90,
      block_timestamp: 4000,
      event_name: 'Executed',
      result: {},
    },
    {
      transaction_id: 'cancel1',
      block_number: 90,
      block_timestamp: 4000,
      event_name: 'FeePaid',
      result: { token: USDT, recipient: FEE_COLLECTOR, amount: '3500000' },
    },
  ];
  const trc20 = [
    // our USDT send, backed by Executed
    {
      transaction_id: 'out1',
      token_info: { address: USDT, symbol: 'USDT', decimals: 6 },
      block_timestamp: 5000,
      from: V,
      to: OTHER,
      value: '25000000',
    },
    // spoofed "from vault" transferFrom with no Executed event: hidden
    {
      transaction_id: 'spoof1',
      token_info: { address: USDT, symbol: 'USDT', decimals: 6 },
      block_timestamp: 6000,
      from: V,
      to: LOOKALIKE,
      value: '25000000',
    },
    // zero-value poisoning: hidden
    {
      transaction_id: 'zero1',
      token_info: { address: USDT, symbol: 'USDT', decimals: 6 },
      block_timestamp: 6100,
      from: LOOKALIKE,
      to: V,
      value: '0',
    },
    // stablecoin dust: hidden
    {
      transaction_id: 'dust1',
      token_info: { address: USDT, symbol: 'USDT', decimals: 6 },
      block_timestamp: 6200,
      from: LOOKALIKE,
      to: V,
      value: '9999',
    },
    // non-whitelisted scam token: hidden
    {
      transaction_id: 'scam1',
      token_info: {
        address: 'TWr4qR84ARRVT2s2ccExEzhy1AbvUg5JUo',
        symbol: 'USDT',
        decimals: 6,
      },
      block_timestamp: 6300,
      from: OTHER,
      to: V,
      value: '1000000000',
    },
    // a real incoming USDT
    {
      transaction_id: 'in1',
      token_info: { address: USDT, symbol: 'USDT', decimals: 6 },
      block_timestamp: 3000,
      from: OTHER,
      to: V,
      value: '100000000',
    },
  ];
  const internal = [
    // the TRX fee of out1 → folded into the row fee
    {
      tx_id: 'out1',
      block_timestamp: 5000,
      from_address: T.toHex41(V),
      to_address: T.toHex41(FEE_COLLECTOR),
      data: { call_value: { _: 6300000 }, rejected: false },
    },
    // rejected internal: dropped
    {
      tx_id: 'rej1',
      block_timestamp: 5500,
      from_address: T.toHex41(OTHER),
      to_address: T.toHex41(V),
      data: { call_value: { _: 5000000 }, rejected: true },
    },
    // contract-originated incoming TRX
    {
      tx_id: 'in2',
      block_timestamp: 2000,
      from_address: T.toHex41(OTHER),
      to_address: T.toHex41(V),
      data: { call_value: { _: 2000000 } },
    },
  ];
  const transfers = [
    {
      txID: 'in3',
      blockNumber: 50,
      block_timestamp: 1000,
      raw_data: {
        contract: [
          {
            type: 'TransferContract',
            parameter: {
              value: {
                amount: 7000000,
                owner_address: T.toHex41(OTHER),
                to_address: T.toHex41(V),
              },
            },
          },
        ],
      },
      ret: [{ contractRet: 'SUCCESS' }],
    },
    // TRX dust (poisoning): dropped
    {
      txID: 'dust2',
      blockNumber: 51,
      block_timestamp: 1100,
      raw_data: {
        contract: [
          {
            type: 'TransferContract',
            parameter: {
              value: {
                amount: 1,
                owner_address: T.toHex41(LOOKALIKE),
                to_address: T.toHex41(V),
              },
            },
          },
        ],
      },
      ret: [{ contractRet: 'SUCCESS' }],
    },
  ];

  const rows = buildTronHistory({
    vault: V,
    chain,
    events,
    trc20,
    internal,
    transfers,
  });

  it('keeps exactly the legitimate rows, newest first', () => {
    expect(rows.map((r) => r.txid)).toEqual([
      'out1',
      'cancel1',
      'in1',
      'in2',
      'in3',
    ]);
  });

  it('outgoing USDT row carries the FeePaid TRX fee, once', () => {
    const out = rows.find((r) => r.txid === 'out1');
    expect(out).toMatchObject({
      amount: '-25000000',
      receiver: OTHER,
      type: 'token',
      tokenSymbol: 'USDT',
      decimals: 6,
      contractAddress: USDT,
      fee: '6300000',
      blockheight: 100,
    });
    expect(out.feeSymbol).toBeUndefined();
    // the fee transfer itself is not a second row
    expect(rows.filter((r) => r.txid === 'out1')).toHaveLength(1);
  });

  it('a no-transfer Op (cancellation) shows its USDT fee', () => {
    const c = rows.find((r) => r.txid === 'cancel1');
    expect(c).toMatchObject({
      amount: '0',
      fee: '3500000',
      feeSymbol: 'USDT',
      feeDecimals: 6,
    });
  });

  it('incoming TRX rows use 6 decimals', () => {
    expect(rows.find((r) => r.txid === 'in2')).toMatchObject({
      amount: '2000000',
      type: 'tron',
      decimals: 6,
    });
    expect(rows.find((r) => r.txid === 'in3')).toMatchObject({
      amount: '7000000',
      blockheight: 50,
    });
  });

  it('fetchAddressTransactions queries the four confirmed TronGrid sources', async () => {
    m.get.mockImplementation(async (url) => {
      if (url.endsWith('/events')) return { data: { data: events } };
      if (url.endsWith('/transactions/trc20')) return { data: { data: trc20 } };
      if (url.endsWith('/internal-transactions'))
        return { data: { data: internal } };
      if (url.endsWith('/transactions')) return { data: { data: transfers } };
      throw new Error(`unexpected ${url}`);
    });
    const txs = await fetchAddressTransactions(V, chain, 0, 10);
    expect(txs.map((r) => r.txid)).toEqual(rows.map((r) => r.txid));
    const urls = m.get.mock.calls.map(([u]) => u);
    expect(urls).toEqual(
      expect.arrayContaining([
        `https://api-tron.sspwallet.io/v1/contracts/${V}/events`,
        `https://api-tron.sspwallet.io/v1/accounts/${V}/transactions/trc20`,
        `https://api-tron.sspwallet.io/v1/accounts/${V}/internal-transactions`,
        `https://api-tron.sspwallet.io/v1/accounts/${V}/transactions`,
      ]),
    );
    for (const [, opts] of m.get.mock.calls) {
      expect(opts.params.only_confirmed).toBe(true);
    }
    // pages past the cap end the CSV loop
    expect(await fetchAddressTransactions(V, chain, 200, 250)).toEqual([]);
  });
});

describe('TRON never reaches the utxolib / insight paths', () => {
  it.each([
    ['fetchUtxos', () => fetchUtxos('T', 'tron', 0)],
    ['broadcastTx', () => broadcastTx('00', 'tron')],
    [
      'constructAndSignTransaction',
      () =>
        constructAndSignTransaction('tron', 'T', '1', '0', 'T', 'T', '', ''),
    ],
  ])('%s refuses TRON', async (_name, fn) => {
    await expect(fn()).rejects.toThrow(/does not support TRON/);
  });
});
