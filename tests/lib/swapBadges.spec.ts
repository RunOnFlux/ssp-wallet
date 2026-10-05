import { describe, it, expect } from 'vitest';
import { knownBadges, isSwapBadge } from '../../src/lib/swapBadges';

describe('swapBadges', () => {
  it('keeps only the known badges, deduplicated, in a fixed order', () => {
    expect(
      knownBadges(['ZK', 'Featured', 'DEX', undefined, 'DEX', 'Private']),
    ).toEqual(['DEX', 'Private', 'ZK']);
  });

  it('ignores editorial and unknown tags', () => {
    expect(knownBadges(['Featured', 'Recommended', 'Something'])).toEqual([]);
    expect(isSwapBadge('constructor')).toBe(false);
  });
});
