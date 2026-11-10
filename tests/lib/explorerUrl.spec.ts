import { describe, it, expect } from 'vitest';
import { explorerTxUrl, explorerAddressUrl } from '../../src/lib/explorerUrl';

describe('explorerUrl', () => {
  it('builds tx and address urls for known chains', () => {
    expect(explorerTxUrl('eth', '0xabc')).toBe('https://etherscan.io/tx/0xabc');
    expect(explorerAddressUrl('solDevnet', 'Addr')).toBe(
      'https://explorer.solana.com/address/Addr?cluster=devnet',
    );
  });

  it('does not throw for a chain this build does not know', () => {
    expect(() => explorerTxUrl('unknownChain', '0xabc')).not.toThrow();
    expect(() => explorerTxUrl('', '0xabc')).not.toThrow();
  });
});
