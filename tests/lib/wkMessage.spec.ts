import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import {
  classifyWkMessage,
  checkWkSignPolicy,
  describeCriticalScope,
  isBareOrigin,
  WK_MESSAGE_MAX_LENGTH,
  WK_MESSAGE_MIN_LENGTH,
  isEnterpriseOrigin,
  ENTERPRISE_ORIGINS,
  RESERVED_WK_TAGS,
} from '../../src/lib/wkMessage';

/**
 * WK message grammar (security review H-6 / WEXT-1, fix contract section WK).
 *
 * The PoC (poc/wext_poc.js) showed the old validator — a 13-digit timestamp
 * prefix plus a length check — accepting a genuine SSP Enterprise login
 * challenge and an SSP_CRITICAL transfer_ownership challenge from ANY website.
 * These tests pin the replacement: classify first, then refuse SSP-internal
 * challenges unless the browser-verified requesting origin matches.
 */

const ENTERPRISE = 'https://enterprise.sspwallet.com';
const EVIL = 'https://evil.example';
const ts = () => String(Date.now());
const hex = (bytes: number) => randomBytes(bytes).toString('hex');

const loginV2 = (origin = ENTERPRISE) =>
  `${ts()}:SSP_ENTERPRISE_LOGIN:${hex(16)}:${origin}`;
const criticalV2 = (origin = ENTERPRISE, action = 'transfer_ownership') =>
  `${ts()}:SSP_CRITICAL:${action}:${hex(12)}:bc1q${'x'.repeat(58)}:${hex(12)}:${origin}`;
const criticalV1 = (action = 'transfer_ownership') =>
  `${ts()}:SSP_CRITICAL:${action}:${hex(12)}:bc1q${'x'.repeat(58)}:${hex(12)}`;
// What third-party "Login with SSP" sites (and the OLD enterprise challenge) use.
const genericLogin = () => `${ts()}${hex(16)}`;

describe('classifyWkMessage', () => {
  it('classifies the v2 enterprise login challenge and parses its fields', () => {
    const message = loginV2();
    const result = classifyWkMessage(message);
    expect(result.kind).toBe('enterprise_login');
    if (result.kind !== 'enterprise_login') return;
    expect(result.fields.origin).toBe(ENTERPRISE);
    expect(result.fields.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(String(result.fields.timestamp)).toBe(message.slice(0, 13));
  });

  it('accepts an origin with a port (the origin is last because it has colons)', () => {
    const result = classifyWkMessage(loginV2('http://localhost:5173'));
    expect(result.kind).toBe('enterprise_login');
  });

  it('classifies the v2 critical challenge and parses every field', () => {
    const message = `1730000000000:SSP_CRITICAL:delete_organization:org123:bc1qtarget:abcdef0123:${ENTERPRISE}`;
    const result = classifyWkMessage(message);
    expect(result).toEqual({
      kind: 'critical',
      fields: {
        timestamp: 1730000000000,
        action: 'delete_organization',
        targetOrgId: 'org123',
        targetWkIdentity: 'bc1qtarget',
        nonce: 'abcdef0123',
        origin: ENTERPRISE,
      },
    });
  });

  it('allows empty org / target fields in critical challenges', () => {
    const result = classifyWkMessage(
      `1730000000000:SSP_CRITICAL:change_email:::abcdef:${ENTERPRISE}`,
    );
    expect(result.kind).toBe('critical');
  });

  it('classifies the v1 critical challenge (no origin) as critical_legacy', () => {
    const result = classifyWkMessage(criticalV1());
    expect(result.kind).toBe('critical_legacy');
    if (result.kind !== 'critical_legacy') return;
    expect(result.fields.action).toBe('transfer_ownership');
    expect(result.fields.origin).toBeUndefined();
  });

  it('classifies a third-party timestamp+random login as generic', () => {
    expect(classifyWkMessage(genericLogin()).kind).toBe('generic');
  });

  it('classifies the in-app enterprise subscription message as generic', () => {
    expect(
      classifyWkMessage(
        `${ts()} SSP Enterprise subscription for someone@example.com`,
      ).kind,
    ).toBe('generic');
  });

  it.each([
    [
      'relay-auth JSON',
      JSON.stringify({
        timestamp: Date.now(),
        action: 'action',
        identity: 'bc1q',
        nonce: hex(32),
      }),
    ],
    [
      'vault xpub attestation',
      `SSP_VAULT_XPUB:key:xpub6${'A'.repeat(100)}:eth:150`,
    ],
    [
      'vault xpub attestation behind a timestamp',
      `${ts()}SSP_VAULT_XPUB:key:xpub6${'A'.repeat(60)}:eth:150`,
    ],
    ['chain sync attestation', `SSP_CHAIN_SYNC:eth:xpubA:xpubB`],
    [
      'chain sync tag behind a timestamp',
      `${ts()} SSP_CHAIN_SYNC:eth:${'a'.repeat(60)}`,
    ],
    ['recovery tag', `${ts()} SSP_RECOVERY ${'a'.repeat(60)}`],
    [
      'login tag with an uppercase nonce',
      `${ts()}:SSP_ENTERPRISE_LOGIN:${hex(16).toUpperCase()}:${ENTERPRISE}`,
    ],
    [
      'login tag with a short nonce',
      `${ts()}:SSP_ENTERPRISE_LOGIN:${hex(8)}:${ENTERPRISE}`,
    ],
    ['login tag without origin', `${ts()}:SSP_ENTERPRISE_LOGIN:${hex(16)}`],
    [
      'login tag with a non-http origin',
      `${ts()}:SSP_ENTERPRISE_LOGIN:${hex(16)}:chrome-extension://abc`,
    ],
    [
      'login tag with whitespace in origin',
      `${ts()}:SSP_ENTERPRISE_LOGIN:${hex(16)}:https://a.com x`,
    ],
    ['login with trailing newline', `${loginV2()}\n`],
    [
      'critical with an uppercase action',
      `${ts()}:SSP_CRITICAL:Transfer:org:wk:abcd:${ENTERPRISE}`,
    ],
    [
      'critical with a non-hex nonce',
      `${ts()}:SSP_CRITICAL:transfer_ownership:org:wk:zzzz:${ENTERPRISE}`,
    ],
    [
      'critical with an extra field',
      `${ts()}:SSP_CRITICAL:transfer_ownership:org:wk:extra:abcd`,
    ],
    [
      'critical tag in free text',
      `${ts()} please sign SSP_CRITICAL ${'a'.repeat(40)}`,
    ],
    ['legacy recovery record', `ssp-recovery-xpub\nbc1q\nxpub`],
    ['no leading timestamp', `hello ${'a'.repeat(60)}`],
    ['12-digit timestamp', `${'1'.repeat(12)}x${hex(16)}`],
    ['too short', `${ts()}${hex(8)}`],
    ['too long', `${ts()}${'a'.repeat(490)}`],
    ['newline', `${ts()}${hex(16)}\nsecond line`],
    ['NUL', `${ts()}${hex(16)}\u0000`],
    ['DEL', `${ts()}${hex(16)}\u007f`],
    ['C1 control', `${ts()}${hex(16)}\u0085`],
    ['empty', ''],
  ])('refuses %s as invalid', (_label, message) => {
    expect(classifyWkMessage(message).kind).toBe('invalid');
  });

  it('refuses non-string input', () => {
    expect(classifyWkMessage(undefined).kind).toBe('invalid');
    expect(classifyWkMessage(42).kind).toBe('invalid');
    expect(classifyWkMessage({ message: 'x' }).kind).toBe('invalid');
  });

  it('treats every reserved tag as reserved', () => {
    for (const tag of RESERVED_WK_TAGS) {
      expect(classifyWkMessage(`${ts()} ${tag} ${'a'.repeat(50)}`).kind).toBe(
        'invalid',
      );
    }
  });

  it('accepts the generic boundaries 45 and 500', () => {
    expect(classifyWkMessage(`${ts()}${'a'.repeat(32)}`).kind).toBe('generic');
    expect(classifyWkMessage(`${ts()}${'a'.repeat(487)}`).kind).toBe('generic');
  });
});

describe('checkWkSignPolicy — the WEXT-1 PoC as a regression', () => {
  it('refuses an enterprise login challenge relayed by another site', () => {
    const result = checkWkSignPolicy(loginV2(ENTERPRISE), EVIL, {
      allowLocalhost: false,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe('origin_mismatch');
  });

  it('refuses an SSP_CRITICAL v2 challenge relayed by another site', () => {
    const result = checkWkSignPolicy(criticalV2(ENTERPRISE), EVIL, {
      allowLocalhost: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('refuses a v2 challenge whose embedded origin differs only by path or case', () => {
    expect(
      checkWkSignPolicy(loginV2(`${ENTERPRISE}/`), ENTERPRISE).allowed,
    ).toBe(false);
    expect(
      checkWkSignPolicy(loginV2('https://Enterprise.sspwallet.com'), ENTERPRISE)
        .allowed,
    ).toBe(false);
  });

  it('refuses a v2 challenge naming the attacker itself unless the attacker IS the requester', () => {
    // evil.com can only obtain signatures over messages naming evil.com, which
    // the enterprise server (EL-1/EL-4) rejects.
    expect(checkWkSignPolicy(loginV2(EVIL), EVIL).allowed).toBe(true);
    expect(checkWkSignPolicy(loginV2(EVIL), ENTERPRISE).allowed).toBe(false);
  });

  it('refuses the legacy critical challenge from a non-enterprise origin', () => {
    const result = checkWkSignPolicy(criticalV1(), EVIL, {
      allowLocalhost: false,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe('not_enterprise_origin');
  });

  it('refuses relay-auth JSON from anyone', () => {
    const json = JSON.stringify({ timestamp: Date.now(), action: 'action' });
    expect(checkWkSignPolicy(json, ENTERPRISE).allowed).toBe(false);
  });

  it('refuses when the requesting origin is unknown', () => {
    expect(checkWkSignPolicy(loginV2(), null).allowed).toBe(false);
    expect(checkWkSignPolicy(loginV2(), 'Unknown').allowed).toBe(false);
    expect(checkWkSignPolicy(criticalV1(), undefined).allowed).toBe(false);
  });
});

describe('checkWkSignPolicy — what stays allowed', () => {
  it('allows the enterprise app to sign its own login and critical challenges', () => {
    expect(checkWkSignPolicy(loginV2(), ENTERPRISE).allowed).toBe(true);
    expect(checkWkSignPolicy(criticalV2(), ENTERPRISE).allowed).toBe(true);
    expect(
      checkWkSignPolicy(criticalV1(), ENTERPRISE, { allowLocalhost: false })
        .allowed,
    ).toBe(true);
  });

  it('allows third-party generic logins from any origin', () => {
    expect(checkWkSignPolicy(genericLogin(), EVIL).allowed).toBe(true);
  });

  it('allows generic in-app messages and refuses SSP challenges in-app', () => {
    const internal = { internal: true };
    expect(
      checkWkSignPolicy(
        `${ts()} SSP Enterprise unsubscribe for a@b.example`,
        'SSP Wallet',
        internal,
      ).allowed,
    ).toBe(true);
    expect(checkWkSignPolicy(loginV2(), ENTERPRISE, internal).allowed).toBe(
      false,
    );
    expect(checkWkSignPolicy(criticalV1(), ENTERPRISE, internal).allowed).toBe(
      false,
    );
  });

  it('allows localhost only when development origins are enabled', () => {
    expect(
      checkWkSignPolicy(criticalV1(), 'http://localhost:5173', {
        allowLocalhost: true,
      }).allowed,
    ).toBe(true);
    expect(
      checkWkSignPolicy(criticalV1(), 'http://localhost:5173', {
        allowLocalhost: false,
      }).allowed,
    ).toBe(false);
  });
});

describe('isEnterpriseOrigin', () => {
  it('accepts exactly the production enterprise origin', () => {
    expect(ENTERPRISE_ORIGINS).toEqual([ENTERPRISE]);
    expect(isEnterpriseOrigin(ENTERPRISE, false)).toBe(true);
  });

  it.each([
    'http://enterprise.sspwallet.com',
    'https://enterprise.sspwallet.com.evil.example',
    'https://evil.example',
    'https://enterprise.sspwallet.io',
    'https://sub.enterprise.sspwallet.com',
    '',
    'null',
  ])('refuses %s', (origin) => {
    expect(isEnterpriseOrigin(origin, false)).toBe(false);
  });

  it('gates localhost on the development flag', () => {
    expect(isEnterpriseOrigin('http://localhost:4001', false)).toBe(false);
    expect(isEnterpriseOrigin('http://localhost:4001', true)).toBe(true);
    expect(isEnterpriseOrigin('http://127.0.0.1:5173', true)).toBe(true);
    expect(isEnterpriseOrigin('https://localhost.evil.example', true)).toBe(
      false,
    );
    expect(isEnterpriseOrigin('http://localhost.evil.example', true)).toBe(
      false,
    );
  });
});

describe('critical challenges as the enterprise server issues them (WP2)', () => {
  const nonce = 'ab'.repeat(12); // 24 hex
  const issue = (action: string, f1: string, f2: string) =>
    `${ts()}:SSP_CRITICAL:${action}:${f1}:${f2}:${nonce}:${ENTERPRISE}`;

  it('reads an organization action with a target identity', () => {
    const result = classifyWkMessage(
      issue('transfer_ownership', '65f0c0ffee0123456789abcd', 'bc1qtarget'),
    );
    expect(result.kind).toBe('critical');
    if (result.kind !== 'critical') return;
    expect(describeCriticalScope(result.fields)).toEqual({
      kind: 'organization',
      orgId: '65f0c0ffee0123456789abcd',
      target: 'bc1qtarget',
    });
    expect(
      checkWkSignPolicy(
        issue('delete_organization', 'org1', 'none'),
        ENTERPRISE,
      ).allowed,
    ).toBe(true);
  });

  it('reads a vault-scoped action (orgId/vaultId)', () => {
    const result = classifyWkMessage(
      issue('freeze_vault', 'org1/vault9', 'none'),
    );
    expect(result.kind).toBe('critical');
    if (result.kind !== 'critical') return;
    expect(describeCriticalScope(result.fields)).toEqual({
      kind: 'vault',
      orgId: 'org1',
      vaultId: 'vault9',
      target: null,
    });
  });

  it("reads an email action on the user's own account", () => {
    const result = classifyWkMessage(
      issue('change_email', 'user', 'new.address@example.com'),
    );
    expect(result.kind).toBe('critical');
    if (result.kind !== 'critical') return;
    expect(describeCriticalScope(result.fields)).toEqual({
      kind: 'account',
      newEmail: 'new.address@example.com',
    });
    expect(
      describeCriticalScope({ targetOrgId: 'user', targetWkIdentity: 'none' }),
    ).toEqual({ kind: 'account', newEmail: null });
  });

  it('still refuses any of them from another origin', () => {
    expect(
      checkWkSignPolicy(issue('change_email', 'user', 'a@b.example'), EVIL)
        .allowed,
    ).toBe(false);
  });
});

/**
 * SSP Key's own vectors (ssp-key tests/lib/wkMessage.test.ts). Both devices
 * must classify every one of these identically, reason codes included.
 */
describe('shared vectors with SSP Key', () => {
  const TS = '1760000000000';
  const NONCE32 = '0123456789abcdef0123456789abcdef';
  const ORIGIN = 'https://enterprise.sspwallet.com';
  const WK = 'bc1qwkidentityexample0000000000000000000000000000000000000000';
  const TARGET_WK =
    'bc1qtargetidentity00000000000000000000000000000000000000000';
  const XPUB =
    'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz';
  const login = (origin = ORIGIN, nonce = NONCE32, t = TS) =>
    `${t}:SSP_ENTERPRISE_LOGIN:${nonce}:${origin}`;
  const critical = (
    action = 'transfer_ownership',
    org = '6650f0c2e4b0a1b2c3d4e5f6',
    target = TARGET_WK,
    nonce = NONCE32,
  ) => `${TS}:SSP_CRITICAL:${action}:${org}:${target}:${nonce}`;

  it('parses the v2 login and v2/v1 critical challenges', () => {
    expect(classifyWkMessage(login())).toEqual({
      kind: 'enterprise_login',
      fields: { timestamp: Number(TS), nonce: NONCE32, origin: ORIGIN },
    });
    expect(classifyWkMessage(`${critical()}:${ORIGIN}`)).toEqual({
      kind: 'critical',
      fields: {
        timestamp: Number(TS),
        action: 'transfer_ownership',
        targetOrgId: '6650f0c2e4b0a1b2c3d4e5f6',
        targetWkIdentity: TARGET_WK,
        nonce: NONCE32,
        origin: ORIGIN,
      },
    });
    expect(classifyWkMessage(critical()).kind).toBe('critical_legacy');
    expect(classifyWkMessage(login('http://localhost:5173')).kind).toBe(
      'enterprise_login',
    );
  });

  it.each([
    ['uppercase nonce', login(ORIGIN, NONCE32.toUpperCase())],
    ['short nonce', login(ORIGIN, NONCE32.slice(1))],
    ['long nonce', login(ORIGIN, `${NONCE32}a`)],
    ['origin with a path', login(`${ORIGIN}/login`)],
    ['origin with a trailing slash', login(`${ORIGIN}/`)],
    ['origin with userinfo', login(`${ORIGIN}@evil.example`)],
    ['spoofing path', login('https://evil.example/enterprise.sspwallet.com')],
    ['uppercase host', login('https://Enterprise.SSPWallet.com')],
    ['non-http scheme', login('ftp://enterprise.sspwallet.com')],
    ['port out of range', login('https://enterprise.sspwallet.com:65536')],
    ['12-digit timestamp', login(ORIGIN, NONCE32, TS.slice(1))],
    ['query string', login(`${ORIGIN}?a=b`)],
    ['trailing whitespace', `${login()} `],
  ])('login-tagged message with %s is invalid', (_label, message) => {
    expect(classifyWkMessage(message).kind).toBe('invalid');
  });

  it.each([
    ['uppercase action', critical('TRANSFER_OWNERSHIP')],
    ['digits in action', critical('transfer2')],
    ['extra field', `${critical()}:extra`],
    ['non-hex nonce', critical('remove_member', 'org', TARGET_WK, 'xyz123')],
    ['origin with a path', `${critical()}:${ORIGIN}/x`],
    ['missing nonce', `${TS}:SSP_CRITICAL:remove_member:org:${TARGET_WK}:`],
  ])('critical-tagged message with %s is reserved_tag', (_label, message) => {
    expect(classifyWkMessage(message)).toEqual({
      kind: 'invalid',
      reason: 'reserved_tag',
    });
  });

  it.each([
    ['vault xpub attestation', `SSP_VAULT_XPUB:key:${XPUB}:eth:150`],
    [
      'vault xpub attestation behind a timestamp',
      `${TS}SSP_VAULT_XPUB:key:${XPUB}:eth:150`,
    ],
    [
      'chain sync attestation',
      `SSP_CHAIN_SYNC:eth:${XPUB}:${XPUB}`.slice(0, 400),
    ],
    ['chain sync tag behind a timestamp', `${TS}${NONCE32}SSP_CHAIN_SYNC:eth`],
    ['recovery tag behind a timestamp', `${TS}${NONCE32}SSP_RECOVERY`],
    ['login tag inside generic text', `${TS}${NONCE32} SSP_ENTERPRISE_LOGIN`],
  ])('%s is invalid', (_label, message) => {
    expect(classifyWkMessage(message)).toEqual({
      kind: 'invalid',
      reason: expect.stringMatching(/reserved_tag|no_timestamp/),
    });
  });

  it("refuses relay JSON and the recovery record with the Key's reasons", () => {
    const json = JSON.stringify({
      timestamp: Number(TS),
      action: 'action',
      identity: WK,
      nonce: NONCE32 + NONCE32,
    });
    expect(classifyWkMessage(json)).toEqual({
      kind: 'invalid',
      reason: 'json',
    });
    expect(
      classifyWkMessage(`ssp-recovery-xpub\n${WK}\n${XPUB}`.slice(0, 300)),
    ).toEqual({ kind: 'invalid', reason: 'control_chars' });
  });

  it.each([
    ['newline', `${TS}${NONCE32}\nhidden`],
    ['NUL', `${TS}${NONCE32}\u0000`],
    ['DEL', `${TS}${NONCE32}\u007f`],
    ['C1 control', `${TS}${NONCE32}\u0085`],
    ['RTL override', `${TS}${NONCE32}\u202e`],
    ['bidi isolate', `${TS}${NONCE32}\u2066x`],
    ['line separator', `${TS}${NONCE32}\u2028`],
    ['paragraph separator', `${TS}${NONCE32}\u2029`],
  ])('a %s is control_chars', (_label, message) => {
    expect(classifyWkMessage(message)).toEqual({
      kind: 'invalid',
      reason: 'control_chars',
    });
  });

  it("uses the Key's not_string / length / no_timestamp reasons", () => {
    for (const value of [12345, null, undefined]) {
      expect(classifyWkMessage(value)).toEqual({
        kind: 'invalid',
        reason: 'not_string',
      });
    }
    expect(classifyWkMessage(`${TS}${'a'.repeat(31)}`)).toEqual({
      kind: 'invalid',
      reason: 'length',
    });
    expect(
      classifyWkMessage(`${TS}${'a'.repeat(WK_MESSAGE_MAX_LENGTH - 12)}`),
    ).toEqual({ kind: 'invalid', reason: 'length' });
    expect(
      classifyWkMessage(`${TS}${'a'.repeat(WK_MESSAGE_MIN_LENGTH - 13)}`).kind,
    ).toBe('generic');
    expect(classifyWkMessage(`hello world ${NONCE32}${NONCE32}`)).toEqual({
      kind: 'invalid',
      reason: 'no_timestamp',
    });
  });

  it('keeps the documented generic "Login with SSP" format', () => {
    expect(classifyWkMessage(`${TS}${NONCE32}`)).toEqual({
      kind: 'generic',
      fields: { timestamp: Number(TS) },
    });
  });

  it.each([
    'https://enterprise.sspwallet.com',
    'http://localhost:5173',
    'https://a.b-c.example:443',
    'https://xn--bcher-kva.example',
  ])('isBareOrigin accepts %s', (origin) => {
    expect(isBareOrigin(origin)).toBe(true);
  });

  it.each([
    'https://enterprise.sspwallet.com/',
    'https://-bad.example',
    'https://bad-.example',
    'https://user@host.example',
    'https://host.example:99999',
    'https://[::1]',
    'javascript:alert(1)',
  ])('isBareOrigin refuses %s', (origin) => {
    expect(isBareOrigin(origin)).toBe(false);
  });
});
