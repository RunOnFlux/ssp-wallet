/**
 * WK message grammar — which strings the wallet's WK identity key (…/10/0)
 * may sign through `wk_sign_message`, and under which requesting origin.
 *
 * The same /10/0 key (paired with SSP Key's) authenticates SSP Enterprise
 * logins, SSP_CRITICAL org actions, vault-xpub attestations, chain-sync
 * attestations and recovery records. Without domain separation any website
 * could relay a genuine SSP Enterprise challenge to `wk_sign_message` and walk
 * away with a 7-day enterprise session (security review H-6 / WEXT-1). So
 * every message is classified BEFORE it is displayed or signed:
 *
 *  - enterprise_login  `<ts13>:SSP_ENTERPRISE_LOGIN:<nonce32hex>:<origin>`
 *  - critical          `<ts13>:SSP_CRITICAL:<action>:<org>:<wk>:<nonce>:<origin>`
 *  - critical_legacy   the v1 critical challenge without the trailing origin
 *  - generic           any other 13-digit-timestamp message (third-party
 *                      "Login with SSP"), 45–500 chars, no control characters,
 *                      and none of the reserved SSP tags
 *  - invalid           everything else — refused outright
 *
 * Every message is 45–500 chars with no control, line-separator or bidi
 * characters, and the origin in a login/critical challenge must be a bare
 * origin (scheme://lowercase-host[:port]).
 *
 * This grammar mirrors SSP Key's `src/lib/wkMessage.ts` exactly — same checks,
 * same order, same reason codes (security fix contract, section WK). Keep the
 * two in sync; tests/lib/wkMessage.spec.ts carries the Key's vectors.
 */

export type WkMessageKind =
  | 'enterprise_login'
  | 'critical'
  | 'critical_legacy'
  | 'generic'
  | 'invalid';

export interface EnterpriseLoginFields {
  timestamp: number;
  nonce: string;
  origin: string;
}

export interface CriticalFields {
  timestamp: number;
  action: string;
  targetOrgId: string;
  targetWkIdentity: string;
  nonce: string;
  /** Present on v2 (`critical`) only. */
  origin?: string;
}

/** Why a message is `invalid` — identical codes to SSP Key's classifier. */
export type WkInvalidReason =
  | 'not_string'
  | 'length'
  | 'control_chars'
  | 'json'
  | 'reserved_tag'
  | 'no_timestamp';

export type WkMessageClass =
  | { kind: 'enterprise_login'; fields: EnterpriseLoginFields }
  | { kind: 'critical'; fields: CriticalFields & { origin: string } }
  | { kind: 'critical_legacy'; fields: CriticalFields }
  | { kind: 'generic'; fields: { timestamp: number } }
  | { kind: 'invalid'; reason: WkInvalidReason };

/** SSP-internal tags. A message carrying one of these must match its grammar. */
export const RESERVED_WK_TAGS = [
  'SSP_ENTERPRISE_LOGIN',
  'SSP_CRITICAL',
  'SSP_VAULT_XPUB',
  'SSP_CHAIN_SYNC',
  'SSP_RECOVERY',
] as const;

/** Length window for EVERY WK message (not only generic ones). */
export const WK_MESSAGE_MIN_LENGTH = 45;
export const WK_MESSAGE_MAX_LENGTH = 500;

const ENTERPRISE_LOGIN_RE =
  /^(\d{13}):SSP_ENTERPRISE_LOGIN:([0-9a-f]{32}):(https?:\/\/[^\s]+)$/;
const CRITICAL_RE =
  /^(\d{13}):SSP_CRITICAL:([a-z_]+):([^:]*):([^:]*):([0-9a-f]+):(https?:\/\/[^\s]+)$/;
const CRITICAL_LEGACY_RE =
  /^(\d{13}):SSP_CRITICAL:([a-z_]+):([^:]*):([^:]*):([0-9a-f]+)$/;
const LEADING_TIMESTAMP_RE = /^\d{13}/;

/**
 * C0/C1 controls, DEL, line/paragraph separators and the Unicode bidi
 * embedding/override/isolate controls. Any of these lets a requester make the
 * displayed text differ from the signed bytes, so a message carrying one is
 * refused outright. Same set as SSP Key.
 */
const CONTROL_CHARS_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

/**
 * A bare web origin exactly as `new URL(x).origin` prints it: scheme, lowercase
 * host, optional port — no path, query, fragment or userinfo. The browser's
 * `sender.origin` is always in this form, so an honest request never fails it,
 * while `https://enterprise.sspwallet.com@evil.example` or
 * `https://evil.example/enterprise.sspwallet.com` never classify as SSP
 * challenges. Same rule as SSP Key.
 */
const BARE_ORIGIN_RE =
  /^https?:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/;

/** True when `origin` is a bare, lowercase web origin. */
export function isBareOrigin(origin: string): boolean {
  if (typeof origin !== 'string' || !BARE_ORIGIN_RE.test(origin)) return false;
  const port = origin.match(/:(\d{1,5})$/);
  return !port || Number(port[1]) <= 65535;
}

/**
 * Classify a `wk_sign_message` message. Pure; never throws. The order of the
 * checks and the reason codes mirror SSP Key's `classifyWkMessage`
 * (ssp-key src/lib/wkMessage.ts) exactly, so both devices agree on every input.
 */
export function classifyWkMessage(message: unknown): WkMessageClass {
  if (typeof message !== 'string') {
    return { kind: 'invalid', reason: 'not_string' };
  }
  if (
    message.length < WK_MESSAGE_MIN_LENGTH ||
    message.length > WK_MESSAGE_MAX_LENGTH
  ) {
    return { kind: 'invalid', reason: 'length' };
  }
  if (CONTROL_CHARS_RE.test(message)) {
    return { kind: 'invalid', reason: 'control_chars' };
  }
  // Relay-auth payloads are JSON — never a WK message.
  if (message.startsWith('{')) {
    return { kind: 'invalid', reason: 'json' };
  }

  const login = ENTERPRISE_LOGIN_RE.exec(message);
  if (login && isBareOrigin(login[3])) {
    return {
      kind: 'enterprise_login',
      fields: {
        timestamp: Number(login[1]),
        nonce: login[2],
        origin: login[3],
      },
    };
  }

  const critical = CRITICAL_RE.exec(message);
  if (critical && isBareOrigin(critical[6])) {
    return {
      kind: 'critical',
      fields: {
        timestamp: Number(critical[1]),
        action: critical[2],
        targetOrgId: critical[3],
        targetWkIdentity: critical[4],
        nonce: critical[5],
        origin: critical[6],
      },
    };
  }

  const legacy = CRITICAL_LEGACY_RE.exec(message);
  if (legacy) {
    return {
      kind: 'critical_legacy',
      fields: {
        timestamp: Number(legacy[1]),
        action: legacy[2],
        targetOrgId: legacy[3],
        targetWkIdentity: legacy[4],
        nonce: legacy[5],
      },
    };
  }

  // Anything naming an SSP-internal format without matching its grammar
  // exactly (including a non-bare origin) is refused.
  if (RESERVED_WK_TAGS.some((tag) => message.includes(tag))) {
    return { kind: 'invalid', reason: 'reserved_tag' };
  }
  if (LEADING_TIMESTAMP_RE.test(message)) {
    return {
      kind: 'generic',
      fields: { timestamp: Number(message.slice(0, 13)) },
    };
  }
  return { kind: 'invalid', reason: 'no_timestamp' };
}

// ---------------------------------------------------------------------------
// Origin policy
// ---------------------------------------------------------------------------

/** Production origins of the SSP Enterprise app. */
export const ENTERPRISE_ORIGINS: readonly string[] = [
  'https://enterprise.sspwallet.com',
];

const LOCALHOST_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/** True in a Vite development build only; production bundles hard-code false. */
function isDevBuild(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

/**
 * Is `origin` (a browser-verified origin string) the SSP Enterprise app?
 * `http://localhost:*` is accepted in development builds only.
 */
export function isEnterpriseOrigin(
  origin: string | null | undefined,
  allowLocalhost: boolean = isDevBuild(),
): boolean {
  if (typeof origin !== 'string' || !origin) return false;
  if (ENTERPRISE_ORIGINS.includes(origin)) return true;
  return allowLocalhost && LOCALHOST_ORIGIN_RE.test(origin);
}

export type WkPolicyRefusal =
  | 'invalid_message'
  | 'origin_mismatch'
  | 'not_enterprise_origin'
  | 'internal_not_allowed';

export type WkPolicyResult =
  | {
      allowed: true;
      classification: Exclude<WkMessageClass, { kind: 'invalid' }>;
    }
  | { allowed: false; reason: WkPolicyRefusal; classification: WkMessageClass };

/**
 * May the wallet sign `message` for this requester?
 *
 * @param requesterOrigin the browser-verified origin of the requesting frame
 *   (`sender.origin`, stamped by background.js) — NEVER a page-supplied value.
 * @param options.internal true for in-app callers (Settings, Tutorial). They
 *   only ever sign generic messages; SSP-internal challenges are refused there.
 */
export function checkWkSignPolicy(
  message: unknown,
  requesterOrigin: string | null | undefined,
  options: { internal?: boolean; allowLocalhost?: boolean } = {},
): WkPolicyResult {
  const classification = classifyWkMessage(message);
  const allowLocalhost = options.allowLocalhost ?? isDevBuild();

  switch (classification.kind) {
    case 'invalid':
      return { allowed: false, reason: 'invalid_message', classification };
    case 'generic':
      return { allowed: true, classification };
    case 'enterprise_login':
    case 'critical':
      if (options.internal) {
        return {
          allowed: false,
          reason: 'internal_not_allowed',
          classification,
        };
      }
      // The origin is signed into the message; it must be exactly the frame
      // the browser says is asking.
      if (
        typeof requesterOrigin !== 'string' ||
        !requesterOrigin ||
        classification.fields.origin !== requesterOrigin
      ) {
        return { allowed: false, reason: 'origin_mismatch', classification };
      }
      return { allowed: true, classification };
    case 'critical_legacy':
      if (options.internal) {
        return {
          allowed: false,
          reason: 'internal_not_allowed',
          classification,
        };
      }
      // No origin in the signed bytes — only the enterprise app may ask.
      if (!isEnterpriseOrigin(requesterOrigin, allowLocalhost)) {
        return {
          allowed: false,
          reason: 'not_enterprise_origin',
          classification,
        };
      }
      return { allowed: true, classification };
  }
}

// ---------------------------------------------------------------------------
// Critical-action field meaning (for the dedicated warning)
//
// The enterprise server issues `ts13:SSP_CRITICAL:action:F1:F2:nonce:origin`:
//  - organization actions: F1 = orgId,          F2 = target wkIdentity | 'none'
//  - vault-scoped actions: F1 = 'orgId/vaultId', F2 = target wkIdentity | 'none'
//  - email actions:        F1 = 'user',          F2 = new email | 'none'
// ---------------------------------------------------------------------------

export type CriticalScope =
  | { kind: 'organization'; orgId: string; target: string | null }
  | { kind: 'vault'; orgId: string; vaultId: string; target: string | null }
  | { kind: 'account'; newEmail: string | null };

function noneToNull(value: string): string | null {
  return value && value !== 'none' ? value : null;
}

/** Interpret a parsed critical challenge's F1/F2 for display. */
export function describeCriticalScope(fields: {
  targetOrgId: string;
  targetWkIdentity: string;
}): CriticalScope {
  const f1 = fields.targetOrgId;
  const f2 = noneToNull(fields.targetWkIdentity);
  if (f1 === 'user') {
    return { kind: 'account', newEmail: f2 };
  }
  const slash = f1.indexOf('/');
  if (slash > 0 && slash < f1.length - 1) {
    return {
      kind: 'vault',
      orgId: f1.slice(0, slash),
      vaultId: f1.slice(slash + 1),
      target: f2,
    };
  }
  return { kind: 'organization', orgId: f1, target: f2 };
}
