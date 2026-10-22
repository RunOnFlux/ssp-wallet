/**
 * H-15 (EVM-3): ONE normalised user operation for enterprise vault signing.
 *
 * The relay-supplied `evmUserOp` used to be hashed from `parsed.userOpRequest`
 * (when present) but DISPLAYED from the top-level fields of the same object,
 * so `{ ...benignTopLevel, userOpRequest: evil }` passed the hash check while
 * the benign operation was shown. Now the payload is parsed once into a single
 * normalised object; that exact object is decoded for display AND hashed for
 * the binding check. Payloads carrying both shapes are refused.
 */

/** Every ERC-4337 v0.6 UserOperation field. */
export const USER_OP_FIELDS = [
  'sender',
  'nonce',
  'initCode',
  'callData',
  'callGasLimit',
  'verificationGasLimit',
  'preVerificationGas',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'paymasterAndData',
  'signature',
] as const;

export interface NormalizedUserOp {
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

export type NormalizeUserOpResult =
  | { ok: true; op: NormalizedUserOp }
  | { ok: false; error: string };

const HEX_RE = /^0x[0-9a-fA-F]*$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse the relay-supplied evmUserOp JSON into the single object that is both
 * displayed and hashed. Accepts a flat user operation (the format the
 * enterprise backend stores) or `{ userOpRequest: {...} }` with NO top-level
 * operation fields; anything ambiguous or incomplete is refused.
 */
export function normalizeVaultUserOp(
  evmUserOp: unknown,
): NormalizeUserOpResult {
  let parsed: unknown;
  if (typeof evmUserOp === 'string') {
    try {
      parsed = JSON.parse(evmUserOp);
    } catch {
      return { ok: false, error: 'EVM user operation is not valid JSON' };
    }
  } else {
    parsed = evmUserOp;
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'EVM user operation is not an object' };
  }

  const hasNested = Object.prototype.hasOwnProperty.call(
    parsed,
    'userOpRequest',
  );
  const topLevelOpFields = USER_OP_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(parsed, field),
  );
  if (hasNested && topLevelOpFields.length > 0) {
    return {
      ok: false,
      error:
        'Ambiguous EVM user operation: both top-level fields and userOpRequest present — refused',
    };
  }
  const source = hasNested ? parsed.userOpRequest : parsed;
  if (!isPlainObject(source)) {
    return { ok: false, error: 'EVM user operation is not an object' };
  }

  const out: Record<string, string> = {};
  for (const field of USER_OP_FIELDS) {
    const value = source[field];
    if (field === 'signature' && (value === undefined || value === null)) {
      // Not part of the userOpHash; an unsigned operation may omit it.
      out[field] = '0x';
      continue;
    }
    if (typeof value !== 'string' || !HEX_RE.test(value)) {
      return {
        ok: false,
        error: `EVM user operation field ${field} is missing or not hex`,
      };
    }
    out[field] = value;
  }
  if (!ADDRESS_RE.test(out.sender)) {
    return { ok: false, error: 'EVM user operation sender is not an address' };
  }
  return { ok: true, op: out as unknown as NormalizedUserOp };
}
