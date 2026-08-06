import { describe, it, expect } from 'vitest';
import {
  splitAddressForDisplay,
  truncateAddress,
  ADDRESS_EDGE_CHARS,
} from '../../src/lib/addressDisplay';

describe('splitAddressForDisplay', () => {
  it('splits long addresses into 6-char emphasized ends and a middle', () => {
    const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    const parts = splitAddressForDisplay(address);
    expect(parts.start).toBe('bc1qw5');
    expect(parts.end).toBe('v8f3t4');
    expect(parts.start + parts.middle + parts.end).toBe(address);
    expect(parts.start).toHaveLength(ADDRESS_EDGE_CHARS);
    expect(parts.end).toHaveLength(ADDRESS_EDGE_CHARS);
  });

  it('returns short strings whole (no fake truncation)', () => {
    const parts = splitAddressForDisplay('bc1qshortaddr');
    expect(parts).toEqual({ start: 'bc1qshortaddr', middle: '', end: '' });
  });

  it('trims surrounding whitespace', () => {
    const parts = splitAddressForDisplay('  bc1qshortaddr  ');
    expect(parts.start).toBe('bc1qshortaddr');
  });

  it('supports a custom edge length', () => {
    const address = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
    const parts = splitAddressForDisplay(address, 8);
    expect(parts.start).toBe('0x8ba1f1');
    expect(parts.end).toBe('d64DBA72');
  });
});

describe('truncateAddress', () => {
  it('produces the compact start…end form', () => {
    expect(truncateAddress('0x8ba1f109551bD432803012645Ac136ddd64DBA72')).toBe(
      '0x8ba1…4DBA72',
    );
  });

  it('returns short strings unchanged', () => {
    expect(truncateAddress('0xabc')).toBe('0xabc');
  });

  it('shows strings at exactly the threshold (edge*2+3) untruncated', () => {
    const fifteen = 'abcdefghijklmno';
    expect(fifteen).toHaveLength(ADDRESS_EDGE_CHARS * 2 + 3);
    expect(truncateAddress(fifteen)).toBe(fifteen);
  });
});
