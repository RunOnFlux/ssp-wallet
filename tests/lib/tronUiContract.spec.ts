/**
 * TRON UI wiring: source-level guards on the screens that are too large to
 * render in a unit test, plus the chain-sync cap.
 */
import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { CHAIN_SYNC_MAX_CHAINS } from '../../src/lib/chainSync';

const read = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

describe('SendFlow: TRON strategy', () => {
  it('routes chainType tron to useTronSendStrategy', () => {
    const source = read('pages/SendFlow/SendFlow.tsx');
    expect(source).toContain('tron: useTronSendStrategy');
    expect(read('pages/SendFlow/types.ts')).toContain(
      "chainType: 'utxo' | 'evm' | 'sol' | 'tron';",
    );
    // the fee section replaces the speed presets when a strategy supplies one
    expect(source).toContain('strategy.feeSection ?');
    expect(source).toContain(
      'strategy.receiverReview ?? strategy.receiver.value',
    );
  });

  it('posts the ssp-tron-op payload on the wallet path', () => {
    const hook = read('pages/SendFlow/useTronSendStrategy.tsx');
    expect(hook).toContain("'tx',");
    expect(hook).toContain('signConsumerTronOp(');
    expect(hook).toContain("chainType: 'tron'");
    // socket completion is filtered by chain
    expect(hook).toContain('socketChain === activeChain');
  });
});

describe('Swap: no TRON swaps', () => {
  it('has a TRON branch ahead of the EVM and utxolib branches', () => {
    const source = read('pages/Swap/Swap.tsx');
    const tron = source.indexOf("blockchainConfig.chainType === 'tron'");
    const evm = source.indexOf("blockchainConfig.chainType === 'evm'");
    expect(tron).toBeGreaterThan(-1);
    expect(tron).toBeLessThan(evm);
  });

  it('never maps TRON assets for ABE', () => {
    const source = read('components/ABEController/ABEController.tsx');
    expect(source).toContain("blockchains[chain].chainType !== 'tron'");
  });
});

describe('EnterpriseVaultSignTx: TRON sign gate', () => {
  const source = read(
    'components/EnterpriseVaultSignTx/EnterpriseVaultSignTx.tsx',
  );
  const handleSign = source.slice(source.indexOf('const handleSign'));

  it('handleSign returns early on a failed TRON verification', () => {
    // handleSign re-checks the shared fail-closed gate, which refuses a
    // failed TRON verification.
    const guard = handleSign.slice(0, handleSign.indexOf('signingRef.current'));
    expect(guard).toContain('if (signDisabled) return;');
    const reason = source.slice(source.indexOf('const signBlockReason'));
    expect(reason.slice(0, reason.indexOf('const signPending'))).toContain(
      'if (tronSignBlocked) {',
    );
    expect(source).toContain(
      'const tronSignBlocked = isTronChain && !tronVerification?.proposal;',
    );
  });

  it('the TRON branch comes before the key_only / UTXO branches', () => {
    const tron = handleSign.indexOf('} else if (isTronChain) {');
    const keyOnly = handleSign.indexOf("} else if (vaultMode === 'key_only')");
    expect(tron).toBeGreaterThan(-1);
    expect(keyOnly).toBeGreaterThan(-1);
    expect(tron).toBeLessThan(keyOnly);
  });

  it('never sets walletSignedHex for TRON and forwards tronOp to Key', () => {
    const builder = read('lib/vaultRelayPayload.ts');
    expect(builder).toContain("input.chainType !== 'tron' &&");
    expect(builder).toContain('payload.tronOp = input.tronOp;');
    expect(source).toContain('      tronOp,');
  });

  it('the decode branch comes before the UTXO fall-through', () => {
    const decode = source.slice(source.indexOf('const decodedTx = useMemo'));
    const tron = decode.indexOf("chainConfig?.chainType === 'tron'");
    const utxo = decode.indexOf('// UTXO: decode from raw TX hex');
    expect(tron).toBeGreaterThan(-1);
    expect(tron).toBeLessThan(utxo);
  });
});

describe('Chain sync', () => {
  it('raises the batch cap to 24 (tron + tronNile)', () => {
    expect(CHAIN_SYNC_MAX_CHAINS).toBe(24);
  });

  it('switchToChain refuses a TRON network that is not live', () => {
    const source = read('lib/chainSwitching.ts');
    const fn = source.slice(
      source.indexOf('export async function switchToChain'),
    );
    expect(fn.indexOf('isChainAvailable(targetChain)')).toBeLessThan(
      fn.indexOf('switchQueue('),
    );
  });
});
