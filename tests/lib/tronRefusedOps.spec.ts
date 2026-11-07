// @vitest-environment jsdom
// @ts-nocheck test suite
/**
 * Review CHN-9 (wallet side): once a TRON Op is posted, SSP Key may co-sign
 * it and it stays executable until its deadline, whatever the outcome
 * (refusal, relay error, timeout, a txid that never lands). The wallet
 * records every Op before posting it and makes the next send of that vault
 * REUSE its nonce, so a malicious relay can never execute both (double
 * payment). Pinned rules:
 *  - a recorded, live, on-chain-unused nonce is returned (lowest first);
 *  - a nonce already used on chain, or past its deadline (+ 120 s skew), is
 *    dropped;
 *  - other vaults / chains are ignored;
 *  - deadlines are clamped to now + 2 h + skew (a relay-echoed Op cannot pin
 *    a nonce for longer);
 *  - a full store refuses to record (never drops a live record);
 *  - an unreadable record never "forgets": sends pause for the whole
 *    consumer deadline window, then resume;
 *  - buildSponsoredTronOp uses the reused nonce instead of the quoted one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import vectors from '../fixtures/tron-ssp-vectors.json';

vi.mock('axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock('localforage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));
vi.mock('@storage/ssp', () => ({
  sspConfig: () => ({ relay: 'relay.test', maxTxFeeUSD: 100 }),
}));
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
  TRON_CLOCK_SKEW_SECONDS,
  TRON_OUTSTANDING_OPS_KEY,
  TRON_OUTSTANDING_OPS_MAX,
  TRON_TRX_FEE_TOKEN,
  buildSponsoredTronOp,
  parseTronQuote,
  pendingTronOutstandingNonce,
  recordTronOutstandingOp,
  recordTronOutstandingPayload,
  signConsumerTronOp,
  tronConsumerVault,
  tronTransferCall,
} from '../../src/lib/tron';
import { getMasterXpriv, generateAddressKeypair } from '../../src/lib/wallet';

const chain = 'tron';
const COLLECTOR = 'TFhcYVArFkJW6bPUDid4AFCAjKmh6Ez3vv';
const RECIPIENT = 'TGjtodRV2nm6tQd9hsxiecLNN9QmhhVbbD';
const OTHER_VAULT = vectors.enterpriseSingle2of3.address;
const { walletXpub, keyXpub } = vectors.consumer;
const vault = tronConsumerVault(walletXpub, keyXpub, 0, 0, chain);
const NOW = 1_790_000_000n;

/** Fake node: which nonces are used, and whether the vault is deployed. */
function client(used: bigint[] = [], deployed = true) {
  return {
    hasCode: vi.fn(async () => deployed),
    isNonceUsed: vi.fn(async (_v, n) => used.includes(n)),
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('CHN-9: outstanding TRON Ops keep their nonce reserved', () => {
  it('returns the lowest live, unused refused nonce of this vault', async () => {
    recordTronOutstandingOp(
      { chain, vault: vault.address, nonce: 9n, deadline: NOW + 900n },
      NOW,
    );
    recordTronOutstandingOp(
      { chain, vault: vault.address, nonce: 4n, deadline: NOW + 600n },
      NOW,
    );
    // other vault and other chain: ignored
    recordTronOutstandingOp(
      { chain, vault: OTHER_VAULT, nonce: 1n, deadline: NOW + 600n },
      NOW,
    );
    recordTronOutstandingOp(
      {
        chain: 'tronNile',
        vault: vault.address,
        nonce: 2n,
        deadline: NOW + 600n,
      },
      NOW,
    );
    const c = client();
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW,
        client: c,
      }),
    ).toEqual({ nonce: 4n, deadline: NOW + 600n });
  });

  it('drops a record whose nonce is already used on chain (one of the Ops executed)', async () => {
    recordTronOutstandingOp(
      { chain, vault: vault.address, nonce: 4n, deadline: NOW + 600n },
      NOW,
    );
    recordTronOutstandingOp(
      { chain, vault: vault.address, nonce: 5n, deadline: NOW + 600n },
      NOW,
    );
    const c = client([4n]);
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW,
        client: c,
      }),
    ).toEqual({ nonce: 5n, deadline: NOW + 600n });
    const stored = JSON.parse(localStorage.getItem(TRON_OUTSTANDING_OPS_KEY));
    expect(stored.ops.map((o) => o.nonce)).toEqual(['5']);
  });

  it('an undeployed vault has used no nonce: the record stays', async () => {
    recordTronOutstandingOp(
      { chain, vault: vault.address, nonce: 0n, deadline: NOW + 600n },
      NOW,
    );
    const c = client([], false);
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW,
        client: c,
      }),
    ).toEqual({ nonce: 0n, deadline: NOW + 600n });
    expect(c.isNonceUsed).not.toHaveBeenCalled();
  });

  it('a record past its deadline (plus the 120 s clock skew) is dropped without asking the chain', async () => {
    expect(TRON_CLOCK_SKEW_SECONDS).toBe(120n);
    recordTronOutstandingOp(
      { chain, vault: vault.address, nonce: 4n, deadline: NOW + 30n },
      NOW,
    );
    const c = client();
    // still within the skew: kept
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW + 149n,
        client: c,
      }),
    ).toEqual({ nonce: 4n, deadline: NOW + 30n });
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW + 150n,
        client: c,
      }),
    ).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(TRON_OUTSTANDING_OPS_KEY)).ops,
    ).toEqual([]);
  });

  it('no record: no chain read at all', async () => {
    const c = client();
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW,
        client: c,
      }),
    ).toBeNull();
    expect(c.hasCode).not.toHaveBeenCalled();
  });

  it('an unreadable record pauses sends for the whole deadline window, never forgets', async () => {
    localStorage.setItem(TRON_OUTSTANDING_OPS_KEY, '{not json');
    const c = client();
    await expect(
      pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW,
        client: c,
      }),
    ).rejects.toMatchObject({ code: 'OUTSTANDING_OPS_UNREADABLE' });
    expect(localStorage.getItem(`${TRON_OUTSTANDING_OPS_KEY}.corrupt`)).toBe(
      '{not json',
    );
    // still paused just before the 2 h window (+ skew) ends
    await expect(
      pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW + 7319n,
        client: c,
      }),
    ).rejects.toMatchObject({ code: 'OUTSTANDING_OPS_UNREADABLE' });
    // afterwards no recorded Op could still be valid
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW + 7321n,
        client: c,
      }),
    ).toBeNull();
    // a malformed entry is unreadable too
    localStorage.setItem(
      TRON_OUTSTANDING_OPS_KEY,
      JSON.stringify({
        ops: [{ chain, vault: vault.address, nonce: '0x10', deadline: '1' }],
      }),
    );
    await expect(
      pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW,
        client: c,
      }),
    ).rejects.toMatchObject({ code: 'OUTSTANDING_OPS_UNREADABLE' });
  });

  it('clamps a far deadline (e.g. a relay-echoed Op) to now + 2 h + skew', async () => {
    recordTronOutstandingOp(
      { chain, vault: vault.address, nonce: 4n, deadline: NOW + 10n ** 9n },
      NOW,
    );
    const max = NOW + 7200n + 120n;
    expect(
      JSON.parse(localStorage.getItem(TRON_OUTSTANDING_OPS_KEY)).ops,
    ).toEqual([
      { chain, vault: vault.address, nonce: '4', deadline: max.toString() },
    ]);
    // it stops pinning the nonce once that window is over
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: max + 120n,
        client: client(),
      }),
    ).toBeNull();
    // an unclamped record of an earlier build is clamped when re-recorded
    localStorage.setItem(
      TRON_OUTSTANDING_OPS_KEY,
      JSON.stringify({
        ops: [
          {
            chain,
            vault: vault.address,
            nonce: '5',
            deadline: (NOW + 10n ** 9n).toString(),
          },
        ],
      }),
    );
    recordTronOutstandingOp(
      { chain, vault: vault.address, nonce: 5n, deadline: NOW + 600n },
      NOW,
    );
    expect(
      JSON.parse(localStorage.getItem(TRON_OUTSTANDING_OPS_KEY)).ops[0]
        .deadline,
    ).toBe(max.toString());
  });

  it('a full store of live records refuses to record (never drops one)', () => {
    for (let i = 0; i < TRON_OUTSTANDING_OPS_MAX; i += 1) {
      recordTronOutstandingOp(
        {
          chain,
          vault: vault.address,
          nonce: BigInt(100 + i),
          deadline: NOW + 600n,
        },
        NOW,
      );
    }
    expect(() =>
      recordTronOutstandingOp(
        { chain, vault: vault.address, nonce: 1n, deadline: NOW + 600n },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'OUTSTANDING_OPS_FULL' }));
    expect(
      JSON.parse(localStorage.getItem(TRON_OUTSTANDING_OPS_KEY)).ops,
    ).toHaveLength(TRON_OUTSTANDING_OPS_MAX);
    // re-recording a held nonce is fine; dead records make room
    expect(() =>
      recordTronOutstandingOp(
        { chain, vault: vault.address, nonce: 100n, deadline: NOW + 600n },
        NOW,
      ),
    ).not.toThrow();
    expect(() =>
      recordTronOutstandingOp(
        { chain, vault: vault.address, nonce: 1n, deadline: NOW + 9000n },
        NOW + 600n + 121n,
      ),
    ).not.toThrow();
  });

  it('an unwritable store refuses to record (the send must not go out)', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    try {
      expect(() =>
        recordTronOutstandingOp(
          { chain, vault: vault.address, nonce: 1n, deadline: NOW + 600n },
          NOW,
        ),
      ).toThrow(
        expect.objectContaining({ code: 'OUTSTANDING_OPS_UNWRITABLE' }),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('records the Op of the ssp-tron-op payload this wallet sent', async () => {
    const walletPriv = generateAddressKeypair(
      getMasterXpriv(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        48,
        195,
        0,
        'p2sh',
        chain,
      ),
      0,
      0,
      chain,
    ).privKey;
    const op = T.opFromJson(vectors.consumerOp.op);
    const { payload } = signConsumerTronOp({
      chain,
      config: vault.config,
      vault: vault.address,
      op,
      privKeyHex: walletPriv,
    });
    recordTronOutstandingPayload(payload, chain, NOW - 100n);
    expect(
      await pendingTronOutstandingNonce({
        chain,
        vault: vault.address,
        now: NOW - 100n,
        client: client(),
      }),
    ).toEqual({ nonce: op.nonce, deadline: op.deadline });
    expect(() =>
      recordTronOutstandingPayload('{"format":"x"}', chain),
    ).toThrow();
  });

  it('buildSponsoredTronOp signs the reused nonce, never the quoted one, with the quoted fee', () => {
    const quote = parseTronQuote({
      vault: vault.address,
      deployed: true,
      nonce: '7',
      deadline: (NOW + 1800n).toString(),
      fee: {
        token: TRON_TRX_FEE_TOKEN,
        amount: '6300000',
        recipient: COLLECTOR,
      },
      feeOptions: [],
      energy: { estimate: '1' },
      sponsorAvailable: true,
    });
    const calls = [tronTransferCall('', RECIPIENT, 5n)];
    const quoted = buildSponsoredTronOp({
      chain,
      vault: vault.address,
      calls,
      quote,
      now: NOW,
    });
    expect(quoted.nonce).toBe(7n);
    const reused = buildSponsoredTronOp({
      chain,
      vault: vault.address,
      calls,
      quote,
      now: NOW,
      nonce: 3n,
    });
    expect(reused.nonce).toBe(3n);
    expect(reused.fee).toEqual(quoted.fee);
    expect(reused.deadline).toBe(quoted.deadline);
  });
});
