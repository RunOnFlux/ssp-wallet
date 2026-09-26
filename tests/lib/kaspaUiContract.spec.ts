/**
 * Kaspa UI wiring: the SendFlow QR parser (a `kaspa:` URI keeps its prefix,
 * which is part of the address) and source-level guards on the screens that
 * are too large to render in a unit test.
 */
import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { addressFromScannedQr } from '../../src/lib/addressValidation';

const read = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

const KAS_ADDR =
  'kaspa:prfu8rp4ek453lkhcewmn7w9acdqms9q2pegav5vhx6zscu73xh4ux2mdv2wp';

describe('SendFlow QR parsing', () => {
  it('keeps the kaspa: prefix and drops only the query string', () => {
    expect(addressFromScannedQr(KAS_ADDR, 'kas')).toBe(KAS_ADDR);
    expect(addressFromScannedQr(`  ${KAS_ADDR}?amount=1.5  `, 'kas')).toBe(
      KAS_ADDR,
    );
    expect(addressFromScannedQr(`${KAS_ADDR}#label`, 'kas')).toBe(KAS_ADDR);
  });

  it('lowercases an all-uppercase (QR alphanumeric) Kaspa payload', () => {
    expect(
      addressFromScannedQr(`${KAS_ADDR.toUpperCase()}?AMOUNT=1`, 'kas'),
    ).toBe(KAS_ADDR);
  });

  it('still strips the scheme for other chains', () => {
    expect(addressFromScannedQr('bitcoin:bc1qabc?amount=1', undefined)).toBe(
      'bc1qabc',
    );
    expect(addressFromScannedQr('ethereum:0xabc@1?value=1', 'evm')).toBe(
      '0xabc',
    );
    expect(addressFromScannedQr('bc1qabc', 'utxo')).toBe('bc1qabc');
    // a kaspa: URI scanned on a non-Kaspa chain is not mistaken for Kaspa
    expect(addressFromScannedQr(KAS_ADDR, undefined)).toBe(
      KAS_ADDR.slice('kaspa:'.length),
    );
  });

  it('SendFlow routes every scan through the helper', () => {
    const source = read('pages/SendFlow/SendFlow.tsx');
    expect(source).toContain('addressFromScannedQr(value, chainType)');
  });
});

describe('Swap: Kaspa fee branch', () => {
  it('uses the kaspa-core sweep fee, ahead of the EVM and utxolib branches', () => {
    const source = read('pages/Swap/Swap.tsx');
    const kas = source.indexOf("blockchainConfig.chainType === 'kas'");
    const evm = source.indexOf("blockchainConfig.chainType === 'evm'");
    expect(kas).toBeGreaterThan(-1);
    expect(kas).toBeLessThan(evm);
    expect(source.slice(kas, evm)).toContain('estimateKasSwapFeeUnits(');
  });
});

describe('EnterpriseVaultSignTx: Kaspa sign gate', () => {
  it('handleSign returns early on a pending or failed Kaspa decode', () => {
    const source = read(
      'components/EnterpriseVaultSignTx/EnterpriseVaultSignTx.tsx',
    );
    const handleSign = source.slice(source.indexOf('const handleSign'));
    const guard = handleSign.slice(0, handleSign.indexOf('signingRef.current'));
    expect(guard).toContain('kasDecodePending');
    expect(guard).toContain('kasSignBlocked');
    expect(source).toContain(
      'const kasSignBlocked = isKasChain && !!kasDecodeState?.error;',
    );
  });
});
