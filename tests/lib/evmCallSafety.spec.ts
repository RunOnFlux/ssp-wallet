// C-4 / EVM-1 / AA-5 + H-16 / EVM-4 regression tests.
//
// Built from ssp-security-review-2026-10-12/poc/evm1_value_calldata.cjs: a
// self-call `execute(account, 1 wei, upgradeToAndCall(evil, 0x))` used to be
// decoded as a plain "send 1 wei to yourself", with the calldata dropped.
import { describe, it, expect } from 'vitest';
import { encodeFunctionData, erc20Abi, parseAbi } from 'viem';
import * as abi from '@runonflux/aa-schnorr-multisig-sdk/dist/abi';

import {
  assertEvmCallSafe,
  assertUserOpCallDataSafe,
  checkEvmCallSafety,
  decodeAccountCallData,
  decodeErc20Transfer,
  EvmCallSafetyError,
  UPGRADE_TO_AND_CALL_SELECTOR,
  UPGRADE_TO_SELECTOR,
} from '../../src/lib/evmCallSafety';
import {
  decodeVaultTransaction,
  decodeEVMTransactionForApproval,
} from '../../src/lib/transactions';

const vault = '0x1111111111111111111111111111111111111111';
const evil = '0x2222222222222222222222222222222222222222';
const recipient = '0x3333333333333333333333333333333333333333';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

const upgradeToAndCall = (impl: string) =>
  encodeFunctionData({
    abi: parseAbi(['function upgradeToAndCall(address,bytes) payable']),
    functionName: 'upgradeToAndCall',
    args: [impl as `0x${string}`, '0x'],
  });
const upgradeTo = (impl: string) =>
  encodeFunctionData({
    abi: parseAbi(['function upgradeTo(address)']),
    functionName: 'upgradeTo',
    args: [impl as `0x${string}`],
  });
const execute = (to: string, value: bigint, data: `0x${string}` = '0x') =>
  encodeFunctionData({
    abi: abi.MultiSigSmartAccount_abi,
    functionName: 'execute',
    args: [to as `0x${string}`, value, data],
  });
const executeBatch = (targets: string[], datas: `0x${string}`[]) =>
  encodeFunctionData({
    abi: abi.MultiSigSmartAccount_abi,
    functionName: 'executeBatch',
    args: [targets as `0x${string}`[], datas],
  });
const transfer = (to: string, amount: bigint) =>
  encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to as `0x${string}`, amount],
  });
const approve = (spender: string, amount: bigint) =>
  encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender as `0x${string}`, amount],
  });
const transferFrom = (from: string, to: string, amount: bigint) =>
  encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transferFrom',
    args: [from as `0x${string}`, to as `0x${string}`, amount],
  });

function userOp(callData: string, sender = vault): string {
  return JSON.stringify({
    userOpRequest: {
      sender,
      nonce: '0x1',
      initCode: '0x',
      callData,
      callGasLimit: '0x10000',
      verificationGasLimit: '0x10000',
      preVerificationGas: '0x10000',
      maxFeePerGas: '0x3B9ACA00',
      maxPriorityFeePerGas: '0x3B9ACA00',
      paymasterAndData: '0x',
      signature: '0x',
    },
  });
}

describe('evmCallSafety — selectors', () => {
  it('pins the contract-mandated upgrade selectors', () => {
    expect(upgradeToAndCall(evil).slice(0, 10)).toBe(
      UPGRADE_TO_AND_CALL_SELECTOR,
    );
    expect(upgradeTo(evil).slice(0, 10)).toBe(UPGRADE_TO_SELECTOR);
    expect(UPGRADE_TO_AND_CALL_SELECTOR).toBe('0x4f1ef286');
    expect(UPGRADE_TO_SELECTOR).toBe('0x3659cfe6');
  });
});

describe('checkEvmCallSafety', () => {
  it('treats any non-empty calldata as a contract call, whatever the value', () => {
    const res = checkEvmCallSafety(
      { target: recipient, value: 5n, data: '0xdeadbeef' },
      vault,
    );
    expect(res.ok).toBe(true);
    expect(res.isContractCall).toBe(true);
    expect(res.selector).toBe('0xdeadbeef');
  });

  it('allows a plain native send', () => {
    const res = checkEvmCallSafety(
      { target: recipient, value: 1n, data: '0x' },
      vault,
    );
    expect(res).toEqual({
      ok: true,
      isContractCall: false,
      selector: undefined,
    });
  });

  it('refuses a self-call (case-insensitive), with or without calldata', () => {
    expect(
      checkEvmCallSafety(
        { target: vault.toUpperCase().replace('0X', '0x') },
        vault,
      ).reason,
    ).toBe('self_call');
    expect(
      checkEvmCallSafety({ target: vault, value: 1n, data: '0x' }, vault).ok,
    ).toBe(false);
  });

  it('refuses the upgrade selectors to ANY target', () => {
    for (const data of [upgradeToAndCall(evil), upgradeTo(evil)]) {
      const res = checkEvmCallSafety({ target: recipient, data }, vault);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('upgrade_selector');
    }
    // Uppercase hex selector is normalised before the check.
    const upper = '0x4F1EF286' + upgradeToAndCall(evil).slice(10);
    expect(
      checkEvmCallSafety({ target: recipient, data: upper }, vault).ok,
    ).toBe(false);
  });

  it('refuses malformed calldata and missing targets', () => {
    expect(
      checkEvmCallSafety({ target: recipient, data: '0xzz' }, vault).reason,
    ).toBe('malformed_calldata');
    expect(
      checkEvmCallSafety({ target: recipient, data: '0xabc' }, vault).reason,
    ).toBe('malformed_calldata');
    expect(checkEvmCallSafety({ target: '' }, vault).reason).toBe(
      'malformed_calldata',
    );
  });

  it('assertEvmCallSafe throws an EvmCallSafetyError', () => {
    expect(() =>
      assertEvmCallSafe({ target: vault, data: '0x' }, vault),
    ).toThrow(EvmCallSafetyError);
  });
});

describe('decodeAccountCallData / assertUserOpCallDataSafe', () => {
  it('decodes execute and executeBatch call by call', () => {
    expect(decodeAccountCallData(execute(recipient, 7n))).toEqual([
      { target: recipient, value: 7n, data: '0x' },
    ]);
    const batch = decodeAccountCallData(
      executeBatch([USDC, USDC], [transfer(recipient, 1n), transfer(evil, 2n)]),
    );
    expect(batch).toHaveLength(2);
    expect(batch[1].value).toBe(0n);
  });

  it('refuses a direct account function (no execute wrapper)', () => {
    expect(() => decodeAccountCallData(upgradeToAndCall(evil))).toThrow(
      EvmCallSafetyError,
    );
    expect(() => decodeAccountCallData('0xdeadbeef')).toThrow();
    expect(() => decodeAccountCallData('')).toThrow();
  });

  it('applies the rules to EVERY call of a batch', () => {
    expect(() =>
      assertUserOpCallDataSafe(
        executeBatch(
          [USDC, recipient],
          [transfer(recipient, 1n), upgradeTo(evil)],
        ),
        vault,
      ),
    ).toThrow(/upgrade/);
    expect(() =>
      assertUserOpCallDataSafe(
        executeBatch([USDC, vault], [transfer(recipient, 1n), '0x']),
        vault,
      ),
    ).toThrow(/self-call/);
  });
});

describe('decodeErc20Transfer (strict)', () => {
  it('accepts only the canonical 68-byte encoding', () => {
    const canonical = transfer(recipient, 10n);
    expect(decodeErc20Transfer(canonical)?.rawAmount).toBe(10n);
    expect(decodeErc20Transfer(canonical + '00')).toBeNull();
    expect(decodeErc20Transfer(approve(recipient, 10n))).toBeNull();
  });
});

describe('vault decoder fails closed (C-4 PoC + H-16)', () => {
  it('PoC evm1: execute(vault, 1 wei, upgradeToAndCall(evil)) is refused, not a 1-wei send', () => {
    const res = decodeVaultTransaction(
      userOp(execute(vault, 1n, upgradeToAndCall(evil))),
      'eth',
    );
    expect(res.error).toMatch(/self-call/);
    expect(res.recipients).toEqual([]);
    expect(res.callData?.startsWith(UPGRADE_TO_AND_CALL_SELECTOR)).toBe(true);
  });

  it('refuses upgradeToAndCall to another target', () => {
    const res = decodeVaultTransaction(
      userOp(execute(evil, 0n, upgradeToAndCall(evil))),
      'eth',
    );
    expect(res.error).toMatch(/upgrade/i);
    expect(res.recipients).toEqual([]);
  });

  it('refuses a zero-value self-call (e.g. grantRole on the account)', () => {
    const grantRole = encodeFunctionData({
      abi: abi.MultiSigSmartAccount_abi,
      functionName: 'grantRole',
      args: [`0x${'00'.repeat(32)}`, evil as `0x${string}`],
    });
    const res = decodeVaultTransaction(
      userOp(execute(vault, 0n, grantRole)),
      'eth',
    );
    expect(res.error).toMatch(/self-call/);
  });

  it('refuses calldata that carries native value (never shown as a send)', () => {
    const res = decodeVaultTransaction(
      userOp(execute(recipient, 10n, '0xdeadbeef')),
      'eth',
    );
    expect(res.error).toMatch(/native value/);
    expect(res.recipients).toEqual([]);
  });

  it('refuses approve / transferFrom instead of returning an empty recipient list', () => {
    const a = decodeVaultTransaction(
      userOp(execute(USDC, 0n, approve(evil, 2n ** 256n - 1n))),
      'eth',
    );
    expect(a.error).toMatch(/not a token transfer \(approve\)/);
    expect(a.recipients).toEqual([]);
    const tf = decodeVaultTransaction(
      userOp(execute(USDC, 0n, transferFrom(vault, evil, 5n))),
      'eth',
    );
    expect(tf.error).toMatch(/transferFrom/);
  });

  it('refuses a zero-value call without calldata', () => {
    const res = decodeVaultTransaction(userOp(execute(recipient, 0n)), 'eth');
    expect(res.error).toBeDefined();
  });

  it('decodes an executeBatch of same-token transfers into every recipient', () => {
    const res = decodeVaultTransaction(
      userOp(
        executeBatch(
          [USDC, USDC],
          [transfer(recipient, 1_000_000n), transfer(evil, 2_000_000n)],
        ),
      ),
      'eth',
    );
    expect(res.error).toBeUndefined();
    expect(res.recipients).toEqual([
      { address: recipient, amount: '1000000' },
      { address: evil, amount: '2000000' },
    ]);
    expect(res.tokenSymbol).toBe('USDC');
    expect(res.tokenVerified).toBe(true);
  });

  it('refuses an executeBatch that mixes tokens or hides an unsafe call', () => {
    expect(
      decodeVaultTransaction(
        userOp(
          executeBatch(
            [USDC, USDT],
            [transfer(recipient, 1n), transfer(recipient, 1n)],
          ),
        ),
        'eth',
      ).error,
    ).toMatch(/different assets/);
    expect(
      decodeVaultTransaction(
        userOp(
          executeBatch(
            [USDC, evil],
            [transfer(recipient, 1n), upgradeTo(evil)],
          ),
        ),
        'eth',
      ).error,
    ).toMatch(/upgrade/i);
  });

  it('refuses a user operation without a valid sender', () => {
    const res = decodeVaultTransaction(
      userOp(execute(recipient, 1n), 'not-an-address'),
      'eth',
    );
    expect(res.error).toMatch(/sender/);
  });
});

describe('consumer decodeEVMTransactionForApproval', () => {
  it('flags value + calldata as a contract call (not a native send)', () => {
    const res = decodeEVMTransactionForApproval(
      userOp(execute(vault, 1n, upgradeToAndCall(evil))),
      'eth',
    );
    expect(res).toHaveProperty('contractCall', true);
  });
});
