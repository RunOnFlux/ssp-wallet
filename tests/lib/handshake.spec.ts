import { describe, it, expect } from 'vitest';
import {
  deriveHandshakePhase,
  handshakeTimeline,
  formatCountdown,
  ACTION_EXPIRY_SECONDS,
} from '../../src/lib/handshake';

describe('deriveHandshakePhase', () => {
  const empty = {
    approvedSignal: '',
    rejectedSignal: '',
    baselineApproved: '',
    baselineRejected: '',
  };

  it('stays waiting with no signals', () => {
    expect(deriveHandshakePhase('waiting', empty)).toBe('waiting');
  });

  it('latches approved on a fresh approved signal', () => {
    expect(
      deriveHandshakePhase('waiting', { ...empty, approvedSignal: 'txid123' }),
    ).toBe('approved');
  });

  it('latches rejected on a fresh rejected signal', () => {
    expect(
      deriveHandshakePhase('waiting', {
        ...empty,
        rejectedSignal: 'rejectedpayload',
      }),
    ).toBe('rejected');
  });

  it('rejected wins when both signals are present', () => {
    expect(
      deriveHandshakePhase('waiting', {
        ...empty,
        approvedSignal: 'txid123',
        rejectedSignal: 'rejectedpayload',
      }),
    ).toBe('rejected');
  });

  it('ignores stale signals matching the open-time baseline', () => {
    expect(
      deriveHandshakePhase('waiting', {
        approvedSignal: 'oldtxid',
        rejectedSignal: 'oldrejection',
        baselineApproved: 'oldtxid',
        baselineRejected: 'oldrejection',
      }),
    ).toBe('waiting');
  });

  it('detects a new signal even when a stale baseline exists', () => {
    expect(
      deriveHandshakePhase('waiting', {
        approvedSignal: 'newtxid',
        rejectedSignal: '',
        baselineApproved: 'oldtxid',
        baselineRejected: '',
      }),
    ).toBe('approved');
  });

  it('is sticky once terminal', () => {
    expect(deriveHandshakePhase('approved', empty)).toBe('approved');
    expect(
      deriveHandshakePhase('rejected', { ...empty, approvedSignal: 'txid' }),
    ).toBe('rejected');
  });
});

describe('handshakeTimeline', () => {
  it('waiting: sent finished, awaiting in progress, result pending', () => {
    expect(handshakeTimeline('waiting')).toEqual([
      { key: 'sent', status: 'finish' },
      { key: 'awaiting', status: 'process' },
      { key: 'result', status: 'wait' },
    ]);
  });

  it('approved: all steps finished', () => {
    expect(handshakeTimeline('approved')).toEqual([
      { key: 'sent', status: 'finish' },
      { key: 'awaiting', status: 'finish' },
      { key: 'result', status: 'finish' },
    ]);
  });

  it('rejected: result step is an error', () => {
    expect(handshakeTimeline('rejected')).toEqual([
      { key: 'sent', status: 'finish' },
      { key: 'awaiting', status: 'finish' },
      { key: 'result', status: 'error' },
    ]);
  });
});

describe('formatCountdown', () => {
  it('formats mm:ss zero-padded', () => {
    expect(formatCountdown(167)).toBe('02:47');
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(59)).toBe('00:59');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('clamps negative values to 00:00', () => {
    expect(formatCountdown(-5)).toBe('00:00');
  });

  it('floors fractional seconds', () => {
    expect(formatCountdown(61.9)).toBe('01:01');
  });

  it('full relay action validity renders as 15:00', () => {
    expect(formatCountdown(ACTION_EXPIRY_SECONDS)).toBe('15:00');
  });
});
