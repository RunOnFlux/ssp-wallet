/**
 * Pre-signing check of an EVM send with the bundler.
 *
 * Before the user approves on SSP Wallet and SSP Key, the user operation is
 * built exactly as signing will build it (same account, call and fees) and
 * sent to `eth_estimateUserOperationGas`. The bundler simulates validation and
 * the call itself, so one request answers both "how much gas" and "will this
 * go through". The gas values are part of what gets signed, so this has to
 * happen before signing: changing them afterwards invalidates the signatures.
 */
import { Buffer } from 'buffer';
import axios from 'axios';
import { encodeAbiParameters } from 'viem';
import * as accountAbstraction from '@runonflux/aa-schnorr-multisig-sdk';
import { blockchains, Token } from '@storage/blockchains';
import { cryptos } from '../types';
import {
  buildRequestedEvmCall,
  createEvmSmartAccount,
  evmFeeFields,
} from './constructTx';
import { assertEvmCallSafe } from './evmCallSafety';

/** How long the user waits for the bundler before signing without a check. */
export const EVM_PREFLIGHT_TIMEOUT_MS = 10000;

/**
 * Chains whose bundler folds an L1 data fee into preVerificationGas. That part
 * grows with the op's size, so it is scaled rather than added to.
 */
const L2_CHAINS = new Set<string>(['base']);

/**
 * Worst case of the final signature: MultiSigSmartAccount takes exactly 128
 * bytes, abi.encode(px, e, s, uint8 parity) — three random words plus a parity
 * word of 31 zero bytes and 0x1b/0x1c. The bundler estimates with the
 * account's 65-byte dummy signature, so preVerificationGas is corrected for it.
 */
const FINAL_SIGNATURE_WORST_CASE = `0x${'ff'.repeat(96)}${'00'.repeat(31)}1c`;

/**
 * The amount sits in one 32-byte word of the call (the value, or the ERC-20
 * transfer amount). Max sends can still nudge it after the check; this covers
 * every zero byte of up to two such words turning non-zero.
 */
const AMOUNT_WORDS_CUSHION = 2n * 32n * 12n;

export interface EvmUserOpFields {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

export interface EvmCheckedGas {
  preVerificationGas: string;
  callGasLimit: string;
  verificationGasLimit: string;
}

export type EvmPreflightResult =
  | { status: 'ok'; gas: EvmCheckedGas }
  | { status: 'would_fail'; reason: string; code?: string }
  | { status: 'unavailable'; reason?: string };

const toHex = (n: bigint): string => `0x${n.toString(16)}`;

/**
 * Calldata gas of a v0.6 UserOperation as bundlers price preVerificationGas:
 * 4 per zero byte, 16 per non-zero byte of the ABI-encoded op, 4 per word.
 */
export function userOpCalldataGas(op: EvmUserOpFields): bigint {
  const encoded = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'callGasLimit', type: 'uint256' },
          { name: 'verificationGasLimit', type: 'uint256' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'maxFeePerGas', type: 'uint256' },
          { name: 'maxPriorityFeePerGas', type: 'uint256' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    [
      {
        sender: op.sender as `0x${string}`,
        nonce: BigInt(op.nonce),
        initCode: op.initCode as `0x${string}`,
        callData: op.callData as `0x${string}`,
        callGasLimit: BigInt(op.callGasLimit),
        verificationGasLimit: BigInt(op.verificationGasLimit),
        preVerificationGas: BigInt(op.preVerificationGas),
        maxFeePerGas: BigInt(op.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(op.maxPriorityFeePerGas),
        paymasterAndData: op.paymasterAndData as `0x${string}`,
        signature: op.signature as `0x${string}`,
      },
    ],
  );
  const hex = encoded.slice(2);
  let gas = 0n;
  for (let i = 0; i < hex.length; i += 2) {
    gas += hex.slice(i, i + 2) === '00' ? 4n : 16n;
  }
  return gas + 4n * BigInt(Math.ceil(hex.length / 64));
}

/**
 * The bundler's preVerificationGas for the estimated op, raised to cover the
 * op that is actually broadcast: final gas limits and the 128-byte signature.
 * On an L2 the whole estimate is scaled by the same calldata ratio, since its
 * L1 data fee grows with size too.
 */
export function preVerificationGasForFinalOp(
  bundlerPreVerificationGas: bigint,
  estimateOp: EvmUserOpFields,
  finalOp: EvmUserOpFields,
  isL2: boolean,
): bigint {
  const estimateGas = userOpCalldataGas(estimateOp);
  const requiredFor = (pvg: bigint): bigint => {
    const finalGas =
      userOpCalldataGas({
        ...finalOp,
        preVerificationGas: toHex(pvg),
        signature: FINAL_SIGNATURE_WORST_CASE,
      }) + AMOUNT_WORDS_CUSHION;
    if (isL2) {
      return (
        (bundlerPreVerificationGas * finalGas + estimateGas - 1n) / estimateGas
      );
    }
    return bundlerPreVerificationGas + finalGas - estimateGas;
  };
  // The preVerificationGas field is itself priced calldata: settle on a value
  // that covers the op carrying it (converges in at most two passes).
  let pvg = bundlerPreVerificationGas;
  for (let pass = 0; pass < 3; pass++) {
    const required = requiredFor(pvg);
    if (required <= pvg) break;
    pvg = required;
  }
  return pvg;
}

interface BundlerError {
  code?: number;
  message?: string;
  data?: { reason?: string };
}

/**
 * Rundler's answers that mean the bundler will refuse this operation:
 * -32521 the call reverts, -32500 validation reverts (AA codes),
 * -32602 a precheck or policy refuses it. Anything else is treated as
 * "could not check".
 */
export function classifyBundlerError(error: BundlerError): EvmPreflightResult {
  const reason = (error.data?.reason || error.message || '').trim();
  if (error.code === -32521 || error.code === -32500 || error.code === -32602) {
    const aa = /\b(AA\d\d)\b/.exec(reason);
    return {
      status: 'would_fail',
      reason: reason || 'execution reverted',
      ...(aa ? { code: aa[1] } : {}),
    };
  }
  return { status: 'unavailable', ...(reason ? { reason } : {}) };
}

export interface EvmPreflightParams {
  chain: keyof cryptos;
  /** The sending smart account; the derived account must match it. */
  sender: string;
  receiver: `0x${string}`;
  amount: string;
  /** SSP Wallet and SSP Key public keys (hex) at the sending address. */
  walletPublicKeyHex: string;
  keyPublicKeyHex: string;
  baseGasPrice: string;
  priorityGasPrice: string;
  token?: `0x${string}` | '';
  importedTokens?: Token[];
  customData?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function preflightEVMTransaction(
  params: EvmPreflightParams,
): Promise<EvmPreflightResult> {
  const timeoutMs = params.timeoutMs ?? EVM_PREFLIGHT_TIMEOUT_MS;
  try {
    const publicKeys = [
      new accountAbstraction.types.Key(
        Buffer.from(params.walletPublicKeyHex, 'hex'),
      ),
      new accountAbstraction.types.Key(
        Buffer.from(params.keyPublicKeyHex, 'hex'),
      ),
    ];
    const { rpcUrl, multiSigSmartAccount } = await createEvmSmartAccount(
      params.chain,
      publicKeys,
    );
    if (
      multiSigSmartAccount.address.toLowerCase() !== params.sender.toLowerCase()
    ) {
      return { status: 'unavailable', reason: 'account mismatch' };
    }
    const call = buildRequestedEvmCall(
      params.chain,
      params.receiver,
      params.amount,
      params.token,
      params.importedTokens,
      params.customData,
    );
    assertEvmCallSafe(call, multiSigSmartAccount.address);

    const [nonce, isDeployed, callData] = await Promise.all([
      multiSigSmartAccount.getNonce(),
      multiSigSmartAccount.isAccountDeployed(),
      multiSigSmartAccount.encodeExecute(call),
    ]);
    const initCode = isDeployed
      ? '0x'
      : await multiSigSmartAccount.getInitCode();
    const fees = evmFeeFields(
      params.chain,
      params.baseGasPrice,
      params.priorityGasPrice,
    );
    const estimateOp: EvmUserOpFields = {
      sender: multiSigSmartAccount.address,
      nonce: toHex(nonce),
      initCode,
      callData,
      callGasLimit: '0x0',
      verificationGasLimit: '0x0',
      preVerificationGas: '0x0',
      maxFeePerGas: toHex(BigInt(fees.maxFeePerGas)),
      maxPriorityFeePerGas: toHex(BigInt(fees.maxPriorityFeePerGas)),
      paymasterAndData: '0x',
      signature: multiSigSmartAccount.getDummySignature() as string,
    };

    const response = await axios.post<{
      result?: {
        preVerificationGas: string;
        callGasLimit: string;
        verificationGasLimit: string;
      };
      error?: BundlerError;
    }>(
      rpcUrl,
      {
        id: Date.now(),
        jsonrpc: '2.0',
        method: 'eth_estimateUserOperationGas',
        params: [estimateOp, blockchains[params.chain].entrypointAddress],
      },
      { timeout: timeoutMs, signal: params.signal },
    );
    if (response.data?.error) {
      return classifyBundlerError(response.data.error);
    }
    const result = response.data?.result;
    if (!result) {
      return { status: 'unavailable' };
    }
    const callGasLimit = BigInt(result.callGasLimit);
    const verificationGasLimit = BigInt(result.verificationGasLimit);
    const bundlerPvg = BigInt(result.preVerificationGas);
    if (!callGasLimit || !verificationGasLimit || !bundlerPvg) {
      return { status: 'unavailable', reason: 'zero gas estimate' };
    }
    const preVerificationGas = preVerificationGasForFinalOp(
      bundlerPvg,
      estimateOp,
      {
        ...estimateOp,
        callGasLimit: result.callGasLimit,
        verificationGasLimit: result.verificationGasLimit,
      },
      L2_CHAINS.has(params.chain),
    );
    return {
      status: 'ok',
      gas: {
        preVerificationGas: preVerificationGas.toString(),
        callGasLimit: callGasLimit.toString(),
        verificationGasLimit: verificationGasLimit.toString(),
      },
    };
  } catch (error) {
    // Upgrade / self-call refusals are hard stops, decided by the wallet.
    if ((error as Error)?.name === 'EvmCallSafetyError') {
      throw error;
    }
    if (axios.isCancel(error)) {
      return { status: 'unavailable', reason: 'cancelled' };
    }
    const bundlerError = (
      error as { response?: { data?: { error?: BundlerError } } }
    )?.response?.data?.error;
    if (bundlerError) {
      return classifyBundlerError(bundlerError);
    }
    return {
      status: 'unavailable',
      reason: (error as Error)?.message || 'request failed',
    };
  }
}
