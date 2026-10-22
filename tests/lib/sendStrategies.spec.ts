import { describe, it, expect } from 'vitest';
import {
  sendStepReducer,
  sendStepIndex,
  SEND_STEPS,
  type SendStep,
} from '../../src/lib/sendStrategies/machine';
import {
  presetRateUtxo,
  rbfFeeFloor,
  utxoFeeForRate,
  computeUtxoMax,
  UTXO_RATE_MULTIPLIERS,
} from '../../src/lib/sendStrategies/utxo';
import {
  presetGasEvm,
  evmFeeTotalEth,
  computeEvmMaxNative,
  computeEvmMaxToken,
  EVM_PRIORITY_MULTIPLIERS,
} from '../../src/lib/sendStrategies/evm';
import {
  validateSolRecipient,
  computeSolAutoFee,
  computeSolMax,
  solPaymasterFeeCapLamports,
  assertSolPaymasterFeeWithinCap,
  buildSolKeyActionPayload,
  SOL_CONSUMER_MAX_FEE_LAMPORTS,
  type SolFeeSchedule,
} from '../../src/lib/sendStrategies/sol';
import {
  effectiveMaxFeeUsd,
  CONSUMER_FEE_USD_CEILING,
} from '../../src/lib/sendStrategies/feeCap';

describe('sendStrategies: consumer fee ceilings shared with the SSP Key', () => {
  it('clamps the configured USD fee limit to the Key ceiling (USD 100)', () => {
    expect(CONSUMER_FEE_USD_CEILING).toBe(100);
    expect(effectiveMaxFeeUsd(50)).toBe(50);
    expect(effectiveMaxFeeUsd(500)).toBe(100);
    expect(effectiveMaxFeeUsd(undefined)).toBe(100);
    expect(effectiveMaxFeeUsd(NaN)).toBe(100);
    expect(effectiveMaxFeeUsd(-1)).toBe(100);
  });

  it('CHN-7: caps the Solana paymaster fee at min(0.05 SOL, USD limit)', () => {
    // No price: absolute 0.05 SOL ceiling.
    expect(solPaymasterFeeCapLamports(undefined, 100)).toBe(
      BigInt(SOL_CONSUMER_MAX_FEE_LAMPORTS),
    );
    // SOL at $150: $100 = 0.66 SOL > 0.05 → 0.05 SOL.
    expect(solPaymasterFeeCapLamports(150, 100)).toBe(50_000_000n);
    // SOL at $10,000: $100 = 0.01 SOL < 0.05 → 0.01 SOL.
    expect(solPaymasterFeeCapLamports(10_000, 100)).toBe(10_000_000n);
    // A configured limit above $100 never exceeds the Key ceiling.
    expect(solPaymasterFeeCapLamports(10_000, 1_000)).toBe(10_000_000n);
  });

  it('refuses a relay-inflated reimbursement (2 SOL) but accepts a real one', () => {
    expect(() => assertSolPaymasterFeeWithinCap('2000000000')).toThrow(
      /exceeds the maximum/,
    );
    // first send + SPL bump = 5.7M lamports
    expect(() => assertSolPaymasterFeeWithinCap('5700000')).not.toThrow();
    // A caller-supplied cap can only tighten, never loosen, the ceiling.
    expect(() =>
      assertSolPaymasterFeeWithinCap('60000000', 10n ** 18n),
    ).toThrow();
    expect(() => assertSolPaymasterFeeWithinCap('1.5')).toThrow(/Invalid/);
  });
});

describe('sendStrategies: SOL Key payload (H-3 SOL-SPL)', () => {
  it('keeps native SOL sends bare base64', () => {
    expect(buildSolKeyActionPayload('AAAA')).toBe('AAAA');
  });

  it('adds splRecipientOwner + splMint for SPL sends', () => {
    const payload = JSON.parse(
      buildSolKeyActionPayload('AAAA', {
        mint: 'MintBase58',
        symbol: 'USDC',
        decimals: 6,
        recipientOwner: 'OwnerBase58',
      }),
    );
    expect(payload).toEqual({
      unsignedTxBase64: 'AAAA',
      tokenMint: 'MintBase58',
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      splRecipientOwner: 'OwnerBase58',
      splMint: 'MintBase58',
    });
  });
});

describe('sendStrategies: step machine', () => {
  it('exposes the three steps in order', () => {
    expect(SEND_STEPS).toEqual(['compose', 'review', 'approve']);
    expect(sendStepIndex('compose')).toBe(0);
    expect(sendStepIndex('review')).toBe(1);
    expect(sendStepIndex('approve')).toBe(2);
  });

  it('advances compose → review only when compose is valid', () => {
    expect(
      sendStepReducer('compose', { type: 'CONTINUE', composeError: null }),
    ).toBe('review');
    expect(
      sendStepReducer('compose', {
        type: 'CONTINUE',
        composeError: 'Invalid receiver address.',
      }),
    ).toBe('compose');
  });

  it('CONTINUE does nothing outside compose', () => {
    expect(
      sendStepReducer('review', { type: 'CONTINUE', composeError: null }),
    ).toBe('review');
    expect(
      sendStepReducer('approve', { type: 'CONTINUE', composeError: null }),
    ).toBe('approve');
  });

  it('BACK returns review → compose and is a no-op elsewhere', () => {
    expect(sendStepReducer('review', { type: 'BACK' })).toBe('compose');
    expect(sendStepReducer('compose', { type: 'BACK' })).toBe('compose');
    expect(sendStepReducer('approve', { type: 'BACK' })).toBe('approve');
  });

  it('APPROVE_OPEN only enters approve from review', () => {
    expect(sendStepReducer('review', { type: 'APPROVE_OPEN' })).toBe('approve');
    expect(sendStepReducer('compose', { type: 'APPROVE_OPEN' })).toBe(
      'compose',
    );
  });

  it('APPROVE_CLOSED returns approve → review only', () => {
    expect(sendStepReducer('approve', { type: 'APPROVE_CLOSED' })).toBe(
      'review',
    );
    expect(sendStepReducer('compose', { type: 'APPROVE_CLOSED' })).toBe(
      'compose',
    );
    expect(sendStepReducer('review', { type: 'APPROVE_CLOSED' })).toBe(
      'review',
    );
  });

  it('a full happy path walks compose → review → approve and back', () => {
    let step: SendStep = 'compose';
    step = sendStepReducer(step, { type: 'CONTINUE', composeError: null });
    step = sendStepReducer(step, { type: 'APPROVE_OPEN' });
    expect(step).toBe('approve');
    step = sendStepReducer(step, { type: 'APPROVE_CLOSED' });
    expect(step).toBe('review');
  });
});

describe('sendStrategies: UTXO fee presets + MAX', () => {
  it('normal preset returns the relay base rate untouched (legacy auto fee)', () => {
    expect(presetRateUtxo('normal', 4)).toBe('4');
    expect(presetRateUtxo('normal', 1050)).toBe('1050');
    expect(presetRateUtxo('normal', 2.5)).toBe('2.5');
  });

  it('slow/fast scale the base rate by the documented multipliers', () => {
    expect(UTXO_RATE_MULTIPLIERS.slow).toBe(0.75);
    expect(UTXO_RATE_MULTIPLIERS.fast).toBe(1.5);
    expect(presetRateUtxo('slow', 100)).toBe('75');
    expect(presetRateUtxo('fast', 100)).toBe('150');
    // fractional rates keep at most 2 decimals
    expect(presetRateUtxo('slow', 2.5)).toBe('1.88');
  });

  it('slow is floored at 1 sat/vB so the tx still relays', () => {
    expect(presetRateUtxo('slow', 1)).toBe('1');
    expect(presetRateUtxo('slow', 0.5)).toBe('1');
  });

  it('derives the fee in coin units from tx size × rate', () => {
    // 226 vB * 4 sat/vB = 904 sats = 0.00000904 (8 decimals)
    expect(utxoFeeForRate(226, '4', 8)).toBe('0.00000904');
    // unknown size → null (fee not yet estimable)
    expect(utxoFeeForRate(0, '4', 8)).toBeNull();
  });

  it('MAX = spendable − fee, floored at 0 (legacy math)', () => {
    // 1 FLUX spendable (1e8 sats), 0.0001 fee
    expect(computeUtxoMax('100000000', 8, '0.0001')).toBe('0.9999');
    // fee exceeds balance → 0
    expect(computeUtxoMax('1000', 8, '1')).toBe('0');
    // empty fee treated as 0
    expect(computeUtxoMax('100000000', 8, '')).toBe('1');
  });

  // BIP125 rule 4. RBF used to recompute a byte-identical fee to the original
  // send, so the node rejected the replacement and the stuck transaction stayed
  // stuck with no explanation.
  describe('rbfFeeFloor', () => {
    it('is the replaced fee plus the replacement size at the min relay rate', () => {
      // 250 vB @ 1 sat/vB = 250 sats bump on top of a 1000 sat original
      expect(rbfFeeFloor(250, '1000', 1, 8)).toBe('0.0000125');
      // 8 decimals: (1000 + 250) / 1e8
      expect(rbfFeeFloor(250, '1000', 1, 8)).toBe(
        ((1000 + 250) / 1e8).toString(),
      );
    });

    it('always exceeds the replaced fee, so a replacement can never pay less', () => {
      const replaced = 5000;
      const floor = rbfFeeFloor(221, String(replaced), 1, 8);
      expect(floor).not.toBeNull();
      expect(Number(floor) * 1e8).toBeGreaterThan(replaced);
    });

    it('rounds the bump up to whole satoshis for fractional relay rates', () => {
      // 221 vB @ 0.5 sat/vB = 110.5 → 111
      expect(rbfFeeFloor(221, '0', 0.5, 8)).toBe((111 / 1e8).toString());
    });

    it('scales with the chain decimals', () => {
      expect(rbfFeeFloor(100, '900', 1, 4)).toBe((1000 / 1e4).toString());
    });

    it('returns null when the size or replaced fee is unusable', () => {
      expect(rbfFeeFloor(0, '1000', 1, 8)).toBeNull();
      expect(rbfFeeFloor(-5, '1000', 1, 8)).toBeNull();
      expect(rbfFeeFloor(250, 'not-a-number', 1, 8)).toBeNull();
      expect(rbfFeeFloor(250, '-1', 1, 8)).toBeNull();
    });
  });
});

describe('sendStrategies: EVM fee presets + MAX', () => {
  it('normal preset keeps base + priority untouched (legacy auto fee)', () => {
    expect(presetGasEvm('normal', 5, 2)).toEqual({
      base: '5',
      priority: '2',
    });
  });

  it('slow/fast vary ONLY the priority tip, never the base', () => {
    expect(EVM_PRIORITY_MULTIPLIERS.slow).toBe(0.5);
    expect(EVM_PRIORITY_MULTIPLIERS.fast).toBe(2);
    expect(presetGasEvm('slow', 5, 2)).toEqual({ base: '5', priority: '1' });
    expect(presetGasEvm('fast', 5, 2)).toEqual({ base: '5', priority: '4' });
  });

  it('total fee mirrors legacy calculateTxFee: gas × (base+priority) gwei → ETH', () => {
    // 21000 gas * (5+2) gwei = 147000 gwei = 0.000147 ETH
    expect(evmFeeTotalEth(21000, 5, 2)).toBe('0.000147');
  });

  it('total fee returns null on NaN inputs (legacy showed ---)', () => {
    expect(evmFeeTotalEth('abc', 5, 2)).toBeNull();
    expect(evmFeeTotalEth(21000, 'x', 2)).toBeNull();
  });

  it('MAX native = spendable − fee floored at 0; MAX token = full balance', () => {
    // 1 ETH (1e18 wei) − 0.000147 fee
    expect(computeEvmMaxNative('1000000000000000000', 18, '0.000147')).toBe(
      '0.999853',
    );
    expect(computeEvmMaxNative('1000', 18, '1')).toBe('0');
    // 250.5 USDT with 6 decimals
    expect(computeEvmMaxToken('250500000', 6)).toBe('250.5');
  });
});

describe('sendStrategies: SOL fee + validation + MAX', () => {
  const schedule: SolFeeSchedule = {
    subsequentSendLamports: 1_000_000,
    firstSendLamports: 5_000_000,
    splFeeBumpLamports: 2_500_000,
    minReimbursementLamports: 1_000_000,
  };

  it('validates base58 recipients (32–44 chars, no 0OIl)', () => {
    expect(
      validateSolRecipient('7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy'),
    ).toBe(true);
    expect(validateSolRecipient('short')).toBe(false);
    expect(validateSolRecipient('')).toBe(false);
    expect(
      // contains 0 (zero) — not base58
      validateSolRecipient('0cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy'),
    ).toBe(false);
    expect(
      validateSolRecipient(
        '7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy7cVfgArCheMR', // too long
      ),
    ).toBe(false);
  });

  it('auto fee: first-send tier + SPL bump (legacy effect math)', () => {
    // subsequent native send: 1,000,000 lamports = 0.001 SOL
    expect(computeSolAutoFee(schedule, false, false, null, 9)).toBe('0.001');
    // first send: 5,000,000 = 0.005 SOL
    expect(computeSolAutoFee(schedule, true, false, null, 9)).toBe('0.005');
    // SPL send, ATA unknown (null) → bump charged defensively
    expect(computeSolAutoFee(schedule, false, true, null, 9)).toBe('0.0035');
    // SPL send, ATA known to exist → bump dropped
    expect(computeSolAutoFee(schedule, false, true, true, 9)).toBe('0.001');
    // SPL send, ATA known missing → bump charged
    expect(computeSolAutoFee(schedule, false, true, false, 9)).toBe('0.0035');
    // no schedule yet → 0
    expect(computeSolAutoFee(null, true, true, null, 9)).toBe('0');
  });

  it('MAX native = balance − fee floored at 0; SPL = full token balance', () => {
    // 2 SOL (2e9 lamports) − 0.001 fee
    expect(computeSolMax('2000000000', 9, true, '0.001')).toBe('1.999');
    expect(computeSolMax('1000', 9, true, '1')).toBe('0');
    // SPL: 12.5 tokens with 6 decimals, fee irrelevant
    expect(computeSolMax('12500000', 6, false, '0.001')).toBe('12.5');
  });
});
