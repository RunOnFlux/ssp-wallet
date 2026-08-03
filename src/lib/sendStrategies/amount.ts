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

/** BigNumber for a user-typed value, or null when it is not a finite number. */
export function parseAmount(value: string): BigNumber | null {
  try {
    const numeric = new BigNumber(value);
    return numeric.isFinite() ? numeric : null;
  } catch {
    return null;
  }
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
