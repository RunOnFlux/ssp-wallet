import { describe, it, expect } from 'vitest';
import { nodeStatusTone } from '../../src/lib/nodeStatus';

describe('nodeStatusTone', () => {
  it('maps unassigned collateral (no name) to neutral regardless of status', () => {
    expect(nodeStatusTone('confirmed', false)).toBe('neutral');
    expect(nodeStatusTone('', false)).toBe('neutral');
  });

  it('maps healthy statuses to success', () => {
    expect(nodeStatusTone('confirmed', true)).toBe('success');
    expect(nodeStatusTone('started', true)).toBe('success');
  });

  it('maps a start-tx timestamp to warning (starting)', () => {
    expect(nodeStatusTone('1767225600', true)).toBe('warning');
  });

  it('maps dos and offline to error', () => {
    expect(nodeStatusTone('dos', true)).toBe('error');
    expect(nodeStatusTone('offline', true)).toBe('error');
  });

  it('maps unknown/empty statuses to neutral', () => {
    expect(nodeStatusTone('', true)).toBe('neutral');
    expect(nodeStatusTone('something-new', true)).toBe('neutral');
  });
});
