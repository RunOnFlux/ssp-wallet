import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { sanitizeRequest } from '../../src/lib/sanitizeRequest';
import type { bgRequest } from '../../src/lib/sanitizeRequest';

/**
 * Contract tests for the injected-provider request validator.
 *
 * The load-bearing case is `accepts the output of the real
 * stampVerifiedOrigin` — it executes the actual stamper from background.js and
 * pushes its output through the actual validator, so the two cannot drift. A
 * fixture-based version of this check is not sufficient: a key the stamper adds
 * but the fixture lacks reads back as undefined and passes vacuously.
 */

const stamperSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'scripts', 'background.js'),
  'utf8',
);

/** A request as the injected provider sends it, before stamping. */
const pageRequest = (method: string, params: Record<string, unknown> = {}) =>
  ({
    origin: 'ssp-background',
    data: { method, params },
  }) as unknown as bgRequest;

/** Exactly what background.js's stampVerifiedOrigin() produces. */
const stamped = (method: string, params: Record<string, unknown> = {}) =>
  pageRequest(method, {
    ...params,
    origin: 'https://enterprise.sspwallet.io',
    verifiedOrigin: 'https://enterprise.sspwallet.io',
    topOrigin: 'https://enterprise.sspwallet.io',
    isSubframe: false,
  });

describe('sanitizeRequest — the stamped request shape', () => {
  it('accepts a params object shaped exactly as background.js stamps it', () => {
    const result = sanitizeRequest(
      stamped('wk_sign_message', { message: '1730000000000:abc', authMode: 2 }),
    );
    expect(result).not.toBeNull();
    expect(result?.data.method).toBe('wk_sign_message');
  });

  it('accepts the stamped shape for every method that reaches the bridge', () => {
    const methods = [
      'sign_message',
      'sspwid_sign_message',
      'wk_sign_message',
      'pay',
      'chains_info',
      'user_chains_info',
      'user_chains_addresses_all',
      'chain_tokens',
      'user_addresses',
      'enterprise_vault_xpub',
      'enterprise_vault_sign_tx',
      'enterprise_vault_sign_message',
      'enterprise_flux_node_start',
      'enterprise_nonce_sync',
      'enterprise_vault_address',
    ];
    for (const method of methods) {
      expect(sanitizeRequest(stamped(method)), method).not.toBeNull();
    }
  });

  it('accepts a stamped subframe request (isSubframe true)', () => {
    const req = stamped('wk_sign_message');
    (req.data.params as unknown as Record<string, unknown>).isSubframe = true;
    expect(sanitizeRequest(req)).not.toBeNull();
  });

  it('accepts a stamped request whose origin could not be derived (nulls)', () => {
    // verifiedOrigin/topOrigin are `string | null`; the loop skips null.
    const req = pageRequest('wk_sign_message', {
      origin: null,
      verifiedOrigin: null,
      topOrigin: null,
      isSubframe: false,
    });
    expect(sanitizeRequest(req)).not.toBeNull();
  });

  it('accepts a stamped request with no page params at all', () => {
    // stampVerifiedOrigin materialises `params` even when the page sent none.
    expect(sanitizeRequest(stamped('chains_info'))).not.toBeNull();
  });

  it('still rejects a non-boolean isSubframe', () => {
    const req = stamped('wk_sign_message');
    (req.data.params as unknown as Record<string, unknown>).isSubframe = 'yes';
    expect(sanitizeRequest(req)).toBeNull();
  });

  /**
   * Run the actual stamper from background.js and push its output through the
   * actual validator, so the two cannot drift. The fixture IS the stamper.
   */
  const realStamper = (() => {
    const start = stamperSource.indexOf('function verifiedOrigin');
    const end = stamperSource.indexOf(
      '\n}',
      stamperSource.indexOf('function stampVerifiedOrigin'),
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const src = stamperSource.slice(start, end + 2);
    // Plain functions over URL only — no extension APIs, so they run as-is.
    return new Function(`${src}\nreturn stampVerifiedOrigin;`)() as (
      request: unknown,
      sender: unknown,
    ) => bgRequest;
  })();

  const fakeSender = {
    id: 'ext-id',
    tab: { url: 'https://enterprise.sspwallet.io/login', windowId: 1 },
    url: 'https://enterprise.sspwallet.io/login',
    frameId: 0,
    origin: 'https://enterprise.sspwallet.io',
  };

  it('accepts the output of the real stampVerifiedOrigin, for every method', () => {
    const methods = [
      'wk_sign_message',
      'pay',
      'chains_info',
      'enterprise_vault_xpub',
      'enterprise_vault_sign_tx',
      'enterprise_flux_node_start',
      'enterprise_nonce_sync',
      'enterprise_vault_address',
    ];
    for (const method of methods) {
      const stampedByRealCode = realStamper(
        { method, params: { message: 'x', authMode: 2 } },
        fakeSender,
      );
      const result = sanitizeRequest({
        origin: 'ssp-background',
        data: stampedByRealCode,
      } as unknown as bgRequest);
      expect(
        result,
        `sanitizeRequest rejected the real stamper's output for "${method}" — ` +
          `params were ${JSON.stringify(
            (stampedByRealCode as unknown as { params: unknown }).params,
          )}. Every request from every origin would fail.`,
      ).not.toBeNull();
    }
  });

  it('accepts the real stamper output for a request with no params and a subframe sender', () => {
    const stampedByRealCode = realStamper(
      { method: 'chains_info' },
      { ...fakeSender, frameId: 3 },
    );
    expect(
      sanitizeRequest({
        origin: 'ssp-background',
        data: stampedByRealCode,
      } as unknown as bgRequest),
    ).not.toBeNull();
  });

  it('accepts the real stamper output when the origin cannot be derived', () => {
    const stampedByRealCode = realStamper(
      { method: 'pay', params: {} },
      {
        id: 'ext-id',
        tab: {},
        frameId: 0,
      },
    );
    expect(
      sanitizeRequest({
        origin: 'ssp-background',
        data: stampedByRealCode,
      } as unknown as bgRequest),
    ).not.toBeNull();
  });
});

describe('sanitizeRequest — existing validation still holds', () => {
  it('rejects a non-string top-level origin', () => {
    const req = { origin: 42, data: { method: 'pay', params: {} } };
    expect(sanitizeRequest(req as unknown as bgRequest)).toBeNull();
  });

  it('rejects an over-long method', () => {
    expect(sanitizeRequest(stamped('x'.repeat(51)))).toBeNull();
  });

  it('rejects an over-long string param', () => {
    expect(
      sanitizeRequest(stamped('pay', { amount: 'x'.repeat(50001) })),
    ).toBeNull();
  });

  it('rejects an out-of-range authMode and orgIndex', () => {
    expect(
      sanitizeRequest(stamped('wk_sign_message', { authMode: 3 })),
    ).toBeNull();
    expect(
      sanitizeRequest(stamped('enterprise_vault_xpub', { orgIndex: 99 })),
    ).toBeNull();
    expect(
      sanitizeRequest(stamped('enterprise_vault_xpub', { orgIndex: 100 })),
    ).not.toBeNull();
  });

  it('validates the reserved nonce object structure', () => {
    expect(
      sanitizeRequest(
        stamped('enterprise_vault_sign_tx', {
          reservedNonce: { kPublic: 'a' },
        }),
      ),
    ).toBeNull();
    expect(
      sanitizeRequest(
        stamped('enterprise_vault_sign_tx', {
          reservedNonce: { kPublic: 'a', kTwoPublic: 'b' },
        }),
      ),
    ).not.toBeNull();
  });

  it('validates the delegates array', () => {
    expect(
      sanitizeRequest(
        stamped('enterprise_flux_node_start', { delegates: 'no' }),
      ),
    ).toBeNull();
    expect(
      sanitizeRequest(
        stamped('enterprise_flux_node_start', { delegates: ['ab', 'cd'] }),
      ),
    ).not.toBeNull();
  });
});

describe('sanitizeRequest — enterprise vault transaction size', () => {
  // The 3-of-4 Flux vault tx the last signer could not sign: 41 inputs, two
  // signers already in, 50,698 characters.
  const partiallySignedFluxTx = 'ab'.repeat(25349);

  // sanitizeRequest logs the whole request; keep megabytes out of the output.
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a vault transaction over 50k characters', () => {
    expect(
      sanitizeRequest(
        stamped('enterprise_vault_sign_tx', {
          rawUnsignedTx: partiallySignedFluxTx,
          inputDetails: JSON.stringify(
            Array.from({ length: 2000 }, (_, index) => ({
              index,
              addressIndex: 0,
              amount: '100000000',
              redeemScript: 'ab'.repeat(275),
            })),
          ),
        }),
      ),
    ).not.toBeNull();
  });

  it('accepts a tx up to 10M characters and rejects a longer one', () => {
    expect(
      sanitizeRequest(
        stamped('enterprise_vault_sign_tx', {
          rawUnsignedTx: 'a'.repeat(10000000),
        }),
      ),
    ).not.toBeNull();
    expect(
      sanitizeRequest(
        stamped('enterprise_vault_sign_tx', {
          rawUnsignedTx: 'a'.repeat(10000001),
        }),
      ),
    ).toBeNull();
  });

  it('keeps the 50k limit on every other param of the method', () => {
    for (const key of ['memo', 'recipients', 'simulation', 'evmUserOp']) {
      expect(
        sanitizeRequest(
          stamped('enterprise_vault_sign_tx', { [key]: 'x'.repeat(50001) }),
        ),
      ).toBeNull();
    }
  });

  it('keeps the 50k limit on the same params for every other method', () => {
    for (const method of [
      'pay',
      'sign_message',
      'enterprise_vault_sign_message',
      'enterprise_flux_node_start',
    ]) {
      expect(
        sanitizeRequest(
          stamped(method, { rawUnsignedTx: partiallySignedFluxTx }),
        ),
      ).toBeNull();
      expect(
        sanitizeRequest(stamped(method, { inputDetails: 'x'.repeat(50001) })),
      ).toBeNull();
    }
  });
});
