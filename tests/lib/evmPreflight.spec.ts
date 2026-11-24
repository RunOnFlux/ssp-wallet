// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  account: null,
  post: vi.fn(),
}));

vi.mock('../../src/lib/constructTx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createEvmSmartAccount: vi.fn(() =>
      Promise.resolve({
        rpcUrl: 'https://node-eth.sspwallet.io',
        multiSigSmartAccount: mocks.account,
      }),
    ),
  };
});

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    default: { ...actual.default, post: mocks.post, isCancel: actual.isCancel },
  };
});

import {
  classifyBundlerError,
  preflightEVMTransaction,
  preVerificationGasForFinalOp,
  userOpCalldataGas,
} from '../../src/lib/evmPreflight';

// ERC-4337 fixed overheads bundlers add: 21,000 per bundle + 18,300 per op.
const FIXED_OVERHEAD = 21000n + 18300n;
const DUMMY =
  '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c';
const SENDER = '0x' + '33'.repeat(20);

// Same byte layout as an Ethereum op the bundler rejected with
// "preVerificationGas is 45024 but must be at least 45372".
const OP = {
  sender: SENDER,
  nonce: '0x2',
  initCode: '0x',
  callData:
    '0xb61d27f6000000000000000000000000' +
    '11'.repeat(20) +
    '0'.repeat(64) +
    '0000000000000000000000000000000000000000000000000000000000000060' +
    '0000000000000000000000000000000000000000000000000000000000000044' +
    'a9059cbb000000000000000000000000' +
    '22'.repeat(20) +
    '00000000000000000000000000000000000000000000000000005af3107a4000' +
    '00000000000000000000000000000000000000000000000000000000',
  callGasLimit: '0x9658',
  verificationGasLimit: '0xea10',
  preVerificationGas: '0xafe0',
  maxFeePerGas: '0x1037b9a20',
  maxPriorityFeePerGas: '0x4a817c80',
  paymasterAndData: '0x',
  signature: '0x',
};
const ESTIMATE_OP = {
  ...OP,
  callGasLimit: '0x0',
  verificationGasLimit: '0x0',
  preVerificationGas: '0x0',
  signature: DUMMY,
};
const REAL_SIGNATURE = '0x' + 'ab'.repeat(95) + '00' + '00'.repeat(31) + '1b';

describe('evmPreflight — preVerificationGas', () => {
  it('prices calldata exactly like the bundler precheck', () => {
    expect(
      FIXED_OVERHEAD + userOpCalldataGas({ ...OP, signature: REAL_SIGNATURE }),
    ).toBe(45372n);
  });

  it('covers the 128-byte signature the bundler never saw', () => {
    const pvg = preVerificationGasForFinalOp(45024n, ESTIMATE_OP, OP, false);
    const required =
      FIXED_OVERHEAD +
      userOpCalldataGas({
        ...OP,
        preVerificationGas: '0x' + pvg.toString(16),
        signature: '0x' + 'ff'.repeat(128),
      });
    expect(pvg >= required).toBe(true);
    expect(pvg - 45372n < 2000n).toBe(true);
  });

  it('scales the whole estimate on an L2 (L1 data fee grows with size)', () => {
    const l1 = preVerificationGasForFinalOp(159705n, ESTIMATE_OP, OP, false);
    const l2 = preVerificationGasForFinalOp(159705n, ESTIMATE_OP, OP, true);
    expect(l2 > l1).toBe(true);
  });
});

describe('evmPreflight — bundler errors', () => {
  it('reads reverts, validation failures and refusals as "would fail"', () => {
    expect(
      classifyBundlerError({
        code: -32521,
        message: 'ERC20: transfer amount exceeds balance',
      }),
    ).toEqual({
      status: 'would_fail',
      reason: 'ERC20: transfer amount exceeds balance',
    });
    expect(
      classifyBundlerError({
        code: -32500,
        message: 'validation reverted: [reason]: AA25 invalid account nonce',
        data: { reason: 'AA25 invalid account nonce' },
      }),
    ).toEqual({
      status: 'would_fail',
      reason: 'AA25 invalid account nonce',
      code: 'AA25',
    });
    expect(
      classifyBundlerError({
        code: -32602,
        message: 'User operation must include a paymaster for sponsorship.',
      }).status,
    ).toBe('would_fail');
  });

  it('reads anything else as "could not check"', () => {
    expect(
      classifyBundlerError({ code: -32005, message: 'rate limited' }).status,
    ).toBe('unavailable');
    expect(classifyBundlerError({}).status).toBe('unavailable');
  });
});

describe('preflightEVMTransaction', () => {
  const params = {
    chain: 'eth',
    sender: SENDER,
    receiver: '0x' + '11'.repeat(20),
    amount: '0.01',
    walletPublicKeyHex: '02' + '01'.repeat(32),
    keyPublicKeyHex: '03' + '02'.repeat(32),
    baseGasPrice: '2',
    priorityGasPrice: '1',
    token: '',
  };

  beforeEach(() => {
    mocks.post.mockReset();
    mocks.account = {
      address: SENDER,
      getNonce: vi.fn(() => Promise.resolve(2n)),
      isAccountDeployed: vi.fn(() => Promise.resolve(true)),
      getInitCode: vi.fn(() => Promise.resolve('0xfactory')),
      encodeExecute: vi.fn(() => Promise.resolve(OP.callData)),
      getDummySignature: vi.fn(() => DUMMY),
    };
  });

  it('returns the bundler gas with preVerificationGas corrected', async () => {
    mocks.post.mockResolvedValue({
      data: {
        result: {
          preVerificationGas: '0xafe0',
          callGasLimit: '0x9658',
          verificationGasLimit: '0xea10',
        },
      },
    });
    const result = await preflightEVMTransaction(params);
    expect(result.status).toBe('ok');
    expect(result.gas.callGasLimit).toBe(String(0x9658));
    expect(result.gas.verificationGasLimit).toBe(String(0xea10));
    expect(Number(result.gas.preVerificationGas)).toBeGreaterThan(45372);

    const [, body] = mocks.post.mock.calls[0];
    expect(body.method).toBe('eth_estimateUserOperationGas');
    const [op] = body.params;
    expect(op.signature).toBe(DUMMY);
    expect(op.initCode).toBe('0x');
    expect(op.nonce).toBe('0x2');
    expect(op.maxFeePerGas).toBe('0x' + (3n * 10n ** 9n).toString(16));
  });

  it('includes the deployment code for a new account', async () => {
    mocks.account.isAccountDeployed.mockResolvedValue(false);
    mocks.post.mockResolvedValue({
      data: {
        result: {
          preVerificationGas: '0xfa00',
          callGasLimit: '0x9658',
          verificationGasLimit: '0x60000',
        },
      },
    });
    await preflightEVMTransaction(params);
    expect(mocks.post.mock.calls[0][1].params[0].initCode).toBe('0xfactory');
  });

  it('reports a call the bundler says reverts', async () => {
    mocks.post.mockResolvedValue({
      data: {
        error: {
          code: -32521,
          message: 'ERC20: transfer amount exceeds balance',
        },
      },
    });
    expect(await preflightEVMTransaction(params)).toEqual({
      status: 'would_fail',
      reason: 'ERC20: transfer amount exceeds balance',
    });
  });

  it('reports "could not check" on a timeout or network error', async () => {
    mocks.post.mockRejectedValue(new Error('timeout of 10000ms exceeded'));
    expect((await preflightEVMTransaction(params)).status).toBe('unavailable');
  });

  it('does not check an account other than the sender', async () => {
    mocks.account.address = '0x' + '44'.repeat(20);
    expect(await preflightEVMTransaction(params)).toEqual({
      status: 'unavailable',
      reason: 'account mismatch',
    });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('BSC carries the whole gas price in both fee fields', async () => {
    mocks.post.mockResolvedValue({ data: { error: { code: -1 } } });
    await preflightEVMTransaction({ ...params, chain: 'bsc' });
    const [op] = mocks.post.mock.calls[0][1].params;
    expect(op.maxPriorityFeePerGas).toBe(op.maxFeePerGas);
  });
});
