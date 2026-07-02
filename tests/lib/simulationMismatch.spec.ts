// SIMULATION_DECODE_MISMATCH detection tests — detectDecodeMismatch +
// buildDecodeMismatchWarning branch coverage. This layer is ADVISORY only
// (never gates signing); the tests lock in its conservative behavior.
import { describe, it, expect } from 'vitest';

import {
  detectDecodeMismatch,
  buildDecodeMismatchWarning,
} from '../../src/lib/simulationMismatch';
import type { VaultDecodedTx } from '../../src/lib/transactions';
import type { ProposalSimulation } from '../../src/types/simulation';

const RECIPIENT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

function makeDecoded(overrides: Partial<VaultDecodedTx> = {}): VaultDecodedTx {
  return {
    sender: '0xsender',
    recipients: [{ address: RECIPIENT, amount: '1000' }],
    fee: '21000',
    ...overrides,
  };
}

function makeSim(
  overrides: Partial<ProposalSimulation> = {},
): ProposalSimulation {
  return {
    status: 'ok',
    balanceChanges: [],
    warnings: [],
    ...overrides,
  };
}

describe('detectDecodeMismatch', () => {
  it('returns no mismatch when simulation or decode is missing', () => {
    expect(detectDecodeMismatch(null, makeDecoded()).mismatch).toBe(false);
    expect(detectDecodeMismatch(undefined, makeDecoded()).mismatch).toBe(false);
    expect(detectDecodeMismatch(makeSim(), null).mismatch).toBe(false);
    expect(detectDecodeMismatch(makeSim(), undefined).mismatch).toBe(false);
    expect(detectDecodeMismatch(null, null).mismatch).toBe(false);
  });

  it('returns no mismatch for pending/unavailable simulation statuses (degradation, not contradiction)', () => {
    const sim = makeSim({
      decodedCall: { method: 'transfer', args: { to: OTHER } },
    });
    expect(
      detectDecodeMismatch({ ...sim, status: 'pending' }, makeDecoded())
        .mismatch,
    ).toBe(false);
    expect(
      detectDecodeMismatch({ ...sim, status: 'unavailable' }, makeDecoded())
        .mismatch,
    ).toBe(false);
  });

  it('returns no mismatch when the device decode itself failed', () => {
    const sim = makeSim({
      decodedCall: { method: 'transfer', args: { to: OTHER } },
    });
    const decoded = makeDecoded({ error: 'decode failed' });
    expect(detectDecodeMismatch(sim, decoded).mismatch).toBe(false);
  });

  it('returns no mismatch when the simulation carries no decodedCall (no comparable data)', () => {
    expect(detectDecodeMismatch(makeSim(), makeDecoded()).mismatch).toBe(false);
  });

  it('returns no mismatch when server and device recipients agree (case-insensitive)', () => {
    const sim = makeSim({
      decodedCall: {
        method: 'transfer',
        args: { to: RECIPIENT.toUpperCase().replace('0X', '0x') },
      },
    });
    const result = detectDecodeMismatch(sim, makeDecoded());
    expect(result.mismatch).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('flags a server-implied recipient absent from the device decode, with reason', () => {
    const sim = makeSim({
      decodedCall: { method: 'approve', args: { spender: OTHER } },
    });
    const result = detectDecodeMismatch(sim, makeDecoded());
    expect(result.mismatch).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain(OTHER);
    expect(result.reasons[0]).toContain('device decode does not contain');
  });

  it('flags a transfer-method recipient with zero overlap against device recipients (both rules, deduplicated)', () => {
    const sim = makeSim({
      status: 'reverted', // 'reverted' is also a comparable status
      decodedCall: { method: 'transfer', args: { to: OTHER } },
    });
    const result = detectDecodeMismatch(sim, makeDecoded());
    expect(result.mismatch).toBe(true);
    // Rule 1 (recipient divergence) + rule 2 (transfer overlap) both fire
    // with distinct reasons; duplicates are removed.
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[1]).toBe(
      'Server-decoded transfer recipient does not match any device recipient',
    );
    expect(new Set(result.reasons).size).toBe(result.reasons.length);
  });

  it('does not apply the transfer-overlap rule to non-transfer methods when recipients overlap partially', () => {
    const sim = makeSim({
      decodedCall: {
        method: 'swap',
        args: { to: RECIPIENT, target: OTHER },
      },
    });
    const result = detectDecodeMismatch(sim, makeDecoded());
    // 'target' still triggers rule 1, but the transfer rule stays silent.
    expect(result.mismatch).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain(OTHER);
  });

  it('returns no mismatch when the device decode has no recipients (one side empty)', () => {
    const sim = makeSim({
      decodedCall: { method: 'transfer', args: { to: OTHER } },
    });
    const decoded = makeDecoded({ recipients: [] });
    expect(detectDecodeMismatch(sim, decoded).mismatch).toBe(false);
  });

  it('ignores non-address decodedCall args (short / non-0x values)', () => {
    const sim = makeSim({
      decodedCall: {
        method: 'transfer',
        args: { to: '12345', recipient: '0x12' },
      },
    });
    expect(detectDecodeMismatch(sim, makeDecoded()).mismatch).toBe(false);
  });
});

describe('buildDecodeMismatchWarning', () => {
  it('builds a critical SIMULATION_DECODE_MISMATCH warning carrying the reasons as detail', () => {
    const warning = buildDecodeMismatchWarning({
      mismatch: true,
      reasons: ['reason a', 'reason b'],
    });
    expect(warning.code).toBe('SIMULATION_DECODE_MISMATCH');
    expect(warning.severity).toBe('critical');
    expect(warning.provider).toBe('device');
    expect(warning.message.length).toBeGreaterThan(0);
    expect(warning.detail).toBe('reason a; reason b');
  });

  it('omits detail when there are no reasons', () => {
    const warning = buildDecodeMismatchWarning({
      mismatch: false,
      reasons: [],
    });
    expect(warning.code).toBe('SIMULATION_DECODE_MISMATCH');
    expect(warning.detail).toBeUndefined();
  });
});
