/**
 * Shared parsing for user-typed amounts and fees in the send strategies.
 *
 * bignumber.js v11 THROWS on a non-numeric string ('', '.', 'abc', '---')
 * where v9 silently produced a NaN instance, so any
 * `new BigNumber(userTyped)` followed by an isFinite() check crashes before
 * the check ever runs. Every value that originates in an input field must go
 * through parseAmount instead of the raw constructor.
 */
import BigNumber from 'bignumber.js';

/**
 * Radix-prefixed literals ('0x10', '0b1', '0o7', with an optional sign) that
 * bignumber.js would happily read as hex / binary / octal. Nothing in SSP
 * produces them, and a user typing one would see a different amount than the
 * digits suggest (review KAS-7).
 */
const RADIX_PREFIX_RE = /^\s*[+-]?0[xXbBoO]/;

/**
 * BigNumber for a value, or null when it is not a finite number. Rejects
 * radix-prefixed literals. Exponent notation ('1e-7') is still accepted on
 * purpose: machine-produced strings (fee figures, history amounts converted
 * from JS numbers) may use it. Amounts a user TYPES for a chain whose units
 * are exact go through parsePlainDecimal / isPlainDecimalAmount first.
 */
export function parseAmount(value: string): BigNumber | null {
  if (typeof value !== 'string' || RADIX_PREFIX_RE.test(value)) return null;
  try {
    const numeric = new BigNumber(value);
    return numeric.isFinite() ? numeric : null;
  } catch {
    return null;
  }
}

/**
 * A plain non-negative decimal as a user types it: digits with at most one
 * '.' fraction ('1', '0.5', '.5', '1.'). No sign, exponent, radix prefix,
 * whitespace, thousands or '_' separators.
 */
const PLAIN_DECIMAL_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export function isPlainDecimalAmount(value: string): boolean {
  return typeof value === 'string' && PLAIN_DECIMAL_RE.test(value);
}

/** Strict parse of a user-typed amount (see isPlainDecimalAmount), or null. */
export function parsePlainDecimal(value: string): BigNumber | null {
  return isPlainDecimalAmount(value) ? parseAmount(value) : null;
}

/**
 * amount + fee in coin units at full precision (this is what the fiat
 * conversion consumes), or null when either side is not a number yet. Both are
 * user-typed strings ('' counts as 0), so the sum has to be parsed defensively
 * rather than thrown from render.
 */
export function totalNative(amount: string, fee: string): string | null {
  const amountParsed = parseAmount(amount || '0');
  const feeParsed = parseAmount(fee || '0');
  if (!amountParsed || !feeParsed) {
    return null;
  }
  return amountParsed.plus(feeParsed).toFixed();
}
