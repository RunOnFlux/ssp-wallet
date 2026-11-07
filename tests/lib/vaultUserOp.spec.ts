// H-15 / EVM-3 regression, built from
// ssp-security-review-2026-10-12/poc/evm3_wallet_binding_desync.cjs.
//
// A relay-supplied `{ ...benignTopLevel, userOpRequest: evil }` used to pass
// the wallet's hash binding (which read userOpRequest) while the screen
// displayed the benign top-level fields. The wallet now parses ONE normalised
// object, displays it and hashes it, and refuses payloads with both shapes.
import { describe, it, expect } from 'vitest';
import { encodeFunctionData, erc20Abi } from 'viem';
import { entryPointRegistry } from '@alchemy/aa-core';
import * as abi from '@runonflux/aa-schnorr-multisig-sdk/dist/abi';

import { normalizeVaultUserOp } from '../../src/lib/vaultUserOp';
import { userOpHashMatches } from '../../src/lib/userOpVerify';
import { decodeVaultTransaction } from '../../src/lib/transactions';
import { blockchains } from '@storage/blockchains';

const vault = '0x1111111111111111111111111111111111111111';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const vendor = '0x000000000000000000000000000000000000bEEF';
const attacker = '0x000000000000000000000000000000000000dEaD';

const exec = (to: string, v: bigint, d: `0x${string}`) =>
  encodeFunctionData({
    abi: abi.MultiSigSmartAccount_abi,
    functionName: 'execute',
    args: [to as `0x${string}`, v, d],
  });
const xfer = (to: string, amt: bigint) =>
  encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to as `0x${string}`, amt],
  });

const base = {
  sender: vault,
  nonce: '0x5',
  initCode: '0x',
  callGasLimit: '0x10000',
  verificationGasLimit: '0x20000',
  preVerificationGas: '0xc000',
  maxFeePerGas: '0x3b9aca00',
  maxPriorityFeePerGas: '0x3b9aca00',
  paymasterAndData: '0x',
  signature: '0x',
};
// 100 USDC to vendor vs 1e9 USDC to attacker.
const benign = {
  ...base,
  callData: exec(USDC, 0n, xfer(vendor, 100n * 10n ** 6n)),
};
const evil = { ...base, callData: exec(USDC, 0n, xfer(attacker, 10n ** 15n)) };

function hashOf(op: Record<string, string>): string {
  const chain = blockchains.eth;
  return entryPointRegistry['0.6.0'].getUserOperationHash(
    op as never,
    chain.entrypointAddress as `0x${string}`,
    Number(chain.chainId),
  );
}

describe('normalizeVaultUserOp (H-15)', () => {
  it('PoC evm3: refuses a payload carrying both top-level fields and userOpRequest', () => {
    const evmUserOp = JSON.stringify({ ...benign, userOpRequest: evil });
    const res = normalizeVaultUserOp(evmUserOp);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Ambiguous/);
    // The pre-fix binding read userOpRequest and would have matched this hash.
    expect(
      userOpHashMatches(
        JSON.parse(evmUserOp).userOpRequest,
        'eth',
        hashOf(evil),
      ),
    ).toBe(true);
  });

  it('flat payload: the displayed object IS the hashed object', () => {
    const res = normalizeVaultUserOp(JSON.stringify(benign));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Binding: hash of the normalised op matches the honest rawUnsignedTx…
    expect(userOpHashMatches(res.op, 'eth', hashOf(benign))).toBe(true);
    // …and never the hash of a different op.
    expect(userOpHashMatches(res.op, 'eth', hashOf(evil))).toBe(false);
    // Display decodes the very same object.
    const shown = decodeVaultTransaction(
      JSON.stringify({ userOpRequest: res.op }),
      'eth',
    );
    expect(shown.error).toBeUndefined();
    expect(shown.recipients).toEqual([
      { address: vendor, amount: '100000000' },
    ]);
  });

  it('nested-only payload (no top-level op fields) is accepted and bound consistently', () => {
    const res = normalizeVaultUserOp(JSON.stringify({ userOpRequest: evil }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(userOpHashMatches(res.op, 'eth', hashOf(evil))).toBe(true);
    const shown = decodeVaultTransaction(
      JSON.stringify({ userOpRequest: res.op }),
      'eth',
    );
    expect(shown.recipients[0].address).toBe(attacker);
  });

  it('refuses incomplete, non-hex or malformed operations', () => {
    expect(normalizeVaultUserOp('not json').ok).toBe(false);
    expect(normalizeVaultUserOp('[]').ok).toBe(false);
    const { callData: _omit, ...noCallData } = benign;
    void _omit;
    expect(normalizeVaultUserOp(JSON.stringify(noCallData)).ok).toBe(false);
    expect(
      normalizeVaultUserOp(JSON.stringify({ ...benign, nonce: 5 })).ok,
    ).toBe(false);
    expect(
      normalizeVaultUserOp(JSON.stringify({ ...benign, sender: '0x1234' })).ok,
    ).toBe(false);
    expect(
      normalizeVaultUserOp(JSON.stringify({ userOpRequest: 'x' })).ok,
    ).toBe(false);
  });

  it('defaults a missing signature to 0x (not part of the userOpHash)', () => {
    const { signature: _sig, ...unsigned } = benign;
    void _sig;
    const res = normalizeVaultUserOp(JSON.stringify(unsigned));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.op.signature).toBe('0x');
      expect(userOpHashMatches(res.op, 'eth', hashOf(benign))).toBe(true);
    }
  });
});
