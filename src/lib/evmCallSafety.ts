/**
 * EVM call-safety rules shared by EVERY wallet signing entry point that can
 * put calldata into a user operation: the consumer send flow, the WalletConnect
 * eth_sendTransaction path (which signs through constructAndSignEVMTransaction)
 * and the enterprise vault decoder (decodeVaultTransaction).
 *
 * Contract (SECURITY_FIX_CONTRACT "EVM call-safety rules", C-4 / EVM-1 / AA-5):
 *  - Any non-empty inner calldata is a CONTRACT CALL, whatever the native
 *    value. It must never be presented as a plain native send.
 *  - REFUSE any call whose target is the account itself (target == sender).
 *    The SSP smart account is UUPS and authorises its own upgrades through a
 *    self-call, so `execute(self, 1 wei, upgradeToAndCall(evil, sweep))` would
 *    take the account over in one approved operation. Role changes
 *    (grantRole/revokeRole) and withdrawDepositTo are self-calls too.
 *  - REFUSE the upgrade selectors upgradeToAndCall (0x4f1ef286) and
 *    upgradeTo (0x3659cfe6) to ANY target.
 *  - executeBatch is decoded call by call and every call is held to the same
 *    rules. Anything that cannot be decoded is refused (fail closed).
 *
 * Pure module: no network, no storage. Safe to import from tests.
 */
import { decodeFunctionData, getAddress } from 'viem';
import * as abi from '@runonflux/aa-schnorr-multisig-sdk/dist/abi';

export const UPGRADE_TO_AND_CALL_SELECTOR = '0x4f1ef286';
export const UPGRADE_TO_SELECTOR = '0x3659cfe6';

/** Selectors refused to any target, on every device and in the builder. */
export const BLOCKED_SELECTORS: Readonly<Record<string, string>> = {
  [UPGRADE_TO_AND_CALL_SELECTOR]: 'upgradeToAndCall',
  [UPGRADE_TO_SELECTOR]: 'upgradeTo',
};

// ERC-20 `transfer(address,uint256)` selector. dApps send token transfers
// through eth_sendTransaction as an ordinary contract call: `to` is the token
// contract and the real recipient + amount live in the calldata.
export const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';

/** Well-known selectors that grant spend RIGHTS rather than moving funds. */
export const RISKY_ALLOWANCE_SELECTORS: Readonly<Record<string, string>> = {
  '0x095ea7b3': 'approve',
  '0x39509351': 'increaseAllowance',
  '0xa22cb465': 'setApprovalForAll',
  '0xd505accf': 'permit',
  '0x23b872dd': 'transferFrom',
};

export type EvmCallBlockReason =
  | 'self_call'
  | 'upgrade_selector'
  | 'malformed_calldata'
  | 'undecodable_account_call';

export interface EvmInnerCall {
  target: string;
  value: bigint;
  data: `0x${string}`;
}

export interface EvmCallSafetyResult {
  /** false = the call MUST NOT be signed. */
  ok: boolean;
  reason?: EvmCallBlockReason;
  /** Developer-facing explanation (English) for logs / decode errors. */
  message?: string;
  /** Non-empty calldata — always a contract call, whatever the value. */
  isContractCall: boolean;
  /** 4-byte selector (lowercase, 0x-prefixed) when calldata has one. */
  selector?: string;
}

export class EvmCallSafetyError extends Error {
  readonly reason: EvmCallBlockReason;

  constructor(reason: EvmCallBlockReason, message: string) {
    super(message);
    this.name = 'EvmCallSafetyError';
    this.reason = reason;
  }
}

/** True for absent / empty calldata ('', '0x', undefined, null). */
export function isEmptyCalldata(data: string | null | undefined): boolean {
  return !data || data === '0x' || data === '0X';
}

/** Lowercase 0x-hex with an even number of nibbles, or null. */
function normalizeHex(data: string): `0x${string}` | null {
  if (!/^0[xX][0-9a-fA-F]*$/.test(data)) return null;
  if ((data.length - 2) % 2 !== 0) return null;
  return `0x${data.slice(2).toLowerCase()}`;
}

/** 4-byte selector of non-empty calldata (lowercase), or undefined. */
export function calldataSelector(
  data: string | null | undefined,
): string | undefined {
  if (isEmptyCalldata(data)) return undefined;
  const hex = normalizeHex(data as string);
  if (!hex || hex.length < 10) return undefined;
  return hex.slice(0, 10);
}

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Apply the call-safety rules to ONE inner call made by `sender` (the smart
 * account). Never throws.
 */
export function checkEvmCallSafety(
  call: { target: string; value?: bigint | string | number; data?: string },
  sender: string,
): EvmCallSafetyResult {
  const rawData = call.data ?? '';
  const isContractCall = !isEmptyCalldata(rawData);
  let selector: string | undefined;
  if (isContractCall) {
    const hex = normalizeHex(rawData);
    if (!hex) {
      return {
        ok: false,
        reason: 'malformed_calldata',
        message: 'Calldata is not valid hex',
        isContractCall,
      };
    }
    selector = hex.length >= 10 ? hex.slice(0, 10) : undefined;
  }
  if (!call.target || typeof call.target !== 'string') {
    return {
      ok: false,
      reason: 'malformed_calldata',
      message: 'Call has no target address',
      isContractCall,
      selector,
    };
  }
  if (sender && sameAddress(call.target, sender)) {
    return {
      ok: false,
      reason: 'self_call',
      message:
        'Call targets the account itself (self-call) — refused: self-calls can upgrade the account or change its owners',
      isContractCall,
      selector,
    };
  }
  if (selector && BLOCKED_SELECTORS[selector]) {
    return {
      ok: false,
      reason: 'upgrade_selector',
      message: `Contract upgrade call (${BLOCKED_SELECTORS[selector]}) — refused`,
      isContractCall,
      selector,
    };
  }
  return { ok: true, isContractCall, selector };
}

/** Throwing variant of checkEvmCallSafety for signing paths. */
export function assertEvmCallSafe(
  call: { target: string; value?: bigint | string | number; data?: string },
  sender: string,
): void {
  const res = checkEvmCallSafety(call, sender);
  if (!res.ok) {
    throw new EvmCallSafetyError(
      res.reason ?? 'malformed_calldata',
      res.message ?? 'Unsafe contract call refused',
    );
  }
}

interface DecodedAccountCall {
  functionName: string;
  args: readonly unknown[];
}

/**
 * Decode a smart-account `callData` (what the EntryPoint invokes on the
 * account) into its inner calls. Only `execute(address,uint256,bytes)` and
 * `executeBatch(address[],bytes[])` are accepted; anything else — including a
 * direct call of an account function such as upgradeToAndCall — throws.
 */
export function decodeAccountCallData(callData: string): EvmInnerCall[] {
  const hex = typeof callData === 'string' ? normalizeHex(callData) : null;
  if (!hex || hex.length < 10) {
    throw new EvmCallSafetyError(
      'undecodable_account_call',
      'Account callData is empty or not valid hex',
    );
  }
  let decoded: DecodedAccountCall;
  try {
    decoded = decodeFunctionData({
      abi: abi.MultiSigSmartAccount_abi,
      data: hex,
    }) as unknown as DecodedAccountCall;
  } catch {
    throw new EvmCallSafetyError(
      'undecodable_account_call',
      'Account callData could not be decoded',
    );
  }
  if (decoded.functionName === 'execute') {
    const [target, value, data] = decoded.args as [string, bigint, string];
    if (typeof target !== 'string' || typeof value !== 'bigint') {
      throw new EvmCallSafetyError(
        'undecodable_account_call',
        'Malformed execute() arguments',
      );
    }
    return [{ target, value, data: (data || '0x') as `0x${string}` }];
  }
  if (decoded.functionName === 'executeBatch') {
    const [targets, datas] = decoded.args as [string[], string[]];
    if (
      !Array.isArray(targets) ||
      !Array.isArray(datas) ||
      targets.length === 0 ||
      targets.length !== datas.length
    ) {
      throw new EvmCallSafetyError(
        'undecodable_account_call',
        'Malformed executeBatch() arguments',
      );
    }
    // executeBatch carries no native value per call.
    return targets.map((target, i) => ({
      target,
      value: 0n,
      data: (datas[i] || '0x') as `0x${string}`,
    }));
  }
  throw new EvmCallSafetyError(
    'undecodable_account_call',
    `Unsupported account function ${decoded.functionName}`,
  );
}

/**
 * Decode `callData` and apply the call-safety rules to every inner call.
 * Throws EvmCallSafetyError on the first refused or undecodable call.
 */
export function assertUserOpCallDataSafe(
  callData: string,
  sender: string,
): EvmInnerCall[] {
  const calls = decodeAccountCallData(callData);
  for (const call of calls) {
    assertEvmCallSafe(call, sender);
  }
  return calls;
}

/**
 * Decode a canonical `transfer(address,uint256)` calldata.
 *
 * Deliberately strict: only the exact ABI encoding is accepted (4-byte
 * selector + a zero-padded address word + an amount word = 68 bytes). Dirty
 * padding above the address or trailing bytes mean the payload is not what it
 * looks like, and such a call must stay an opaque contract interaction that is
 * signed byte-for-byte instead of being re-interpreted as a token transfer.
 */
export function decodeErc20Transfer(
  data: string | undefined,
): { recipient: `0x${string}`; rawAmount: bigint } | null {
  if (!data) {
    return null;
  }
  const hex = data.toLowerCase();
  // 0x + 68 bytes
  if (hex.length !== 2 + 68 * 2 || !hex.startsWith(ERC20_TRANSFER_SELECTOR)) {
    return null;
  }
  if (!/^0x[0-9a-f]+$/.test(hex)) {
    return null;
  }
  const recipientWord = hex.slice(10, 74);
  if (!/^0{24}[0-9a-f]{40}$/.test(recipientWord)) {
    return null;
  }
  return {
    recipient: getAddress(`0x${recipientWord.slice(24)}`),
    rawAmount: BigInt(`0x${hex.slice(74)}`),
  };
}

/** Human name for a well-known risky selector, if any. */
export function riskySelectorName(
  selector: string | undefined,
): string | undefined {
  if (!selector) return undefined;
  return (
    RISKY_ALLOWANCE_SELECTORS[selector.toLowerCase()] ??
    BLOCKED_SELECTORS[selector.toLowerCase()]
  );
}
