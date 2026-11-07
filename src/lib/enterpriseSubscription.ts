/**
 * Result handling for the wallet's SSP Enterprise notification writes
 * (/v1/enterprise/subscribe, /unsubscribe, /preferences).
 *
 * The relay wraps the enterprise hook result in a success envelope, so a
 * refusal arrives as `{ status: 'success', data: { success: false, error,
 * errorCode } }`; a relay-level failure arrives as `{ status: 'error', data:
 * { code, name, message } }`.
 *
 * H-21 (server side): subscribing with an email that is not already on
 * record needs a fresh, single-use proof that this identity controls the
 * inbox — the code from /v1/enterprise/email/verify/request, confirmed via
 * /v1/enterprise/email/verify/confirm within the last 60 minutes. Without it
 * the server answers EMAIL_NOT_VERIFIED, and the only way forward is to
 * request and confirm a new code.
 */

export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

export type EnterpriseWriteResult =
  | { ok: true }
  | {
      ok: false;
      /** Machine-readable server code, when the server sent one. */
      errorCode?: string;
      /** Server-provided human-readable reason, when present. */
      serverMessage?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Read the body of an enterprise write. Anything other than an explicit
 * `status: 'success'` with `data.success === true` is a failure.
 */
export function readEnterpriseWriteResponse(
  body: unknown,
): EnterpriseWriteResult {
  if (!isRecord(body)) return { ok: false };
  const data = isRecord(body.data) ? body.data : undefined;
  if (body.status === 'success' && data?.success === true) {
    return { ok: true };
  }
  const errorCode =
    nonEmptyString(data?.errorCode) ??
    // Relay-level error envelope: { code, name, message }.
    (body.status === 'error' ? nonEmptyString(data?.name) : undefined);
  const serverMessage =
    nonEmptyString(data?.error) ?? nonEmptyString(data?.message);
  return {
    ok: false,
    ...(errorCode ? { errorCode } : {}),
    ...(serverMessage ? { serverMessage } : {}),
  };
}

/**
 * The server refused the subscription because the email has no unspent
 * ownership proof (expired, already used, or never verified): the user must
 * verify the email again.
 */
export function needsEmailReverification(
  result: EnterpriseWriteResult,
): boolean {
  return result.ok === false && result.errorCode === EMAIL_NOT_VERIFIED;
}
