import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  EMAIL_NOT_VERIFIED,
  needsEmailReverification,
  readEnterpriseWriteResponse,
} from '../../src/lib/enterpriseSubscription';

/**
 * SSP Enterprise notification writes from the wallet (security review
 * 2026-10: H-21 email-ownership proof, RA-2 signed relay writes).
 */

describe('readEnterpriseWriteResponse', () => {
  it('accepts only an explicit success', () => {
    expect(
      readEnterpriseWriteResponse({
        status: 'success',
        data: { success: true },
      }),
    ).toEqual({ ok: true });
    expect(
      readEnterpriseWriteResponse({ status: 'success', data: {} }),
    ).toEqual({ ok: false });
    expect(
      readEnterpriseWriteResponse({
        status: 'success',
        data: { success: 'true' },
      }).ok,
    ).toBe(false);
    expect(readEnterpriseWriteResponse(null).ok).toBe(false);
    expect(readEnterpriseWriteResponse('ok').ok).toBe(false);
    expect(readEnterpriseWriteResponse([]).ok).toBe(false);
  });

  it('reads the hook refusal: errorCode plus the server reason', () => {
    const result = readEnterpriseWriteResponse({
      status: 'success',
      data: {
        success: false,
        error:
          'Verify this email address with the code we sent to it before subscribing',
        errorCode: EMAIL_NOT_VERIFIED,
      },
    });
    expect(result).toEqual({
      ok: false,
      errorCode: 'EMAIL_NOT_VERIFIED',
      serverMessage:
        'Verify this email address with the code we sent to it before subscribing',
    });
    expect(needsEmailReverification(result)).toBe(true);
  });

  it('reads the relay error envelope { code, name, message }', () => {
    const result = readEnterpriseWriteResponse({
      status: 'error',
      data: { code: 401, name: 'UNAUTHORIZED', message: 'Unauthorized' },
    });
    expect(result).toEqual({
      ok: false,
      errorCode: 'UNAUTHORIZED',
      serverMessage: 'Unauthorized',
    });
    expect(needsEmailReverification(result)).toBe(false);
  });

  it('only EMAIL_NOT_VERIFIED asks for a new verification', () => {
    expect(needsEmailReverification({ ok: true })).toBe(false);
    expect(
      needsEmailReverification({ ok: false, errorCode: 'SUBSCRIBE_FAILED' }),
    ).toBe(false);
    expect(needsEmailReverification({ ok: false })).toBe(false);
    expect(
      needsEmailReverification({ ok: false, errorCode: EMAIL_NOT_VERIFIED }),
    ).toBe(true);
  });
});

const read = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

/** Source with comments removed, so assertions see only code. */
const code = (relativePath: string): string =>
  read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** The body of `const <name> = ` up to the next `const <next> = `. */
const between = (src: string, name: string, next: string): string => {
  const start = src.indexOf(`const ${name} = `);
  const end = src.indexOf(`const ${next} = `, start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('RA-2: Settings never posts to the relay unsigned', () => {
  const settings = code('components/Settings/Settings.tsx');

  it('has no optional-auth branch left', () => {
    expect(settings).not.toMatch(/if \(auth\)/);
    expect(settings).not.toMatch(/Object\.assign\([^)]*auth\)/i);
  });

  it('signs the /v1/action post (public nonces request) or sends nothing', () => {
    const postAction = between(
      settings,
      'postAction',
      'handlePublicNoncesSync',
    );
    expect(postAction).toContain('attachRequiredWkAuth(');
    expect(postAction.indexOf('attachRequiredWkAuth(')).toBeLessThan(
      postAction.indexOf('axios.post('),
    );
    expect(postAction).toContain('/v1/action`, signedData)');
    expect(postAction).not.toContain('.catch(');
  });

  it('closes the waiting dialog and shows an error when the request fails', () => {
    const sync = between(settings, 'handlePublicNoncesSync', 'validateEmail');
    expect(sync).toContain('await postAction(');
    const failure = sync.slice(sync.indexOf('catch'));
    expect(failure).toContain('setPublicNoncesModalOpen(false)');
    expect(failure).toContain("displayMessage(\n        'error'");
    expect(settings).toContain(
      "error instanceof RelayAuthUnavailableError\n      ? t('home:settings.err_relay_auth')",
    );
  });

  it('signs subscribe, unsubscribe and preference saves', () => {
    for (const [name, next, path] of [
      ['completeSubscribe', 'completeUnsubscribe', '/v1/enterprise/subscribe'],
      ['completeUnsubscribe', 'displayMessage', '/v1/enterprise/unsubscribe'],
      [
        'handleSaveEnterprisePreferences',
        'renderEnterprisePreferenceControls',
        '/v1/enterprise/preferences',
      ],
    ] as const) {
      const fn = settings.includes(`const ${next} = `)
        ? between(settings, name, next)
        : settings.slice(settings.indexOf(`const ${name} = `));
      expect(fn).toContain('attachRequiredWkAuth(');
      expect(fn).toContain(path);
      expect(fn.indexOf('attachRequiredWkAuth(')).toBeLessThan(
        fn.indexOf(path),
      );
    }
  });
});

describe('H-21: an expired or spent email proof sends the user back to verification', () => {
  it('Settings resets to the email step on EMAIL_NOT_VERIFIED', () => {
    const settings = code('components/Settings/Settings.tsx');
    const subscribe = between(
      settings,
      'completeSubscribe',
      'completeUnsubscribe',
    );
    const branch = subscribe.slice(
      subscribe.indexOf('needsEmailReverification(outcome)'),
    );
    expect(branch).toContain('setVerifiedEmail(null)');
    expect(branch).toContain("setSubscriptionStep('email')");
    expect(branch).toContain('err_email_verification_expired');
  });

  it('the tutorial resets to the email step on EMAIL_NOT_VERIFIED', () => {
    const tutorial = code('components/Tutorial/TutorialProvider.tsx');
    expect(tutorial).not.toMatch(/if \(auth\)/);
    expect(tutorial).toContain('attachRequiredWkAuth(');
    const branch = tutorial.slice(
      tutorial.indexOf('needsEmailReverification(outcome)'),
    );
    expect(branch).toContain('setVerifiedEmail(null)');
    expect(branch).toContain("setEnterpriseSubscriptionStep('email')");
    expect(branch).toContain('err_email_verification_expired');
  });

  it('every new message key exists in the English locale', () => {
    const home = JSON.parse(read('translations/resources/en/home.json')) as {
      settings: Record<string, unknown> & {
        sspEnterprise: Record<string, unknown>;
      };
    };
    expect(typeof home.settings.err_relay_auth).toBe('string');
    expect(typeof home.settings.err_public_nonces_request).toBe('string');
    expect(
      typeof home.settings.sspEnterprise.err_email_verification_expired,
    ).toBe('string');
  });
});

describe('RA-2: background notification sync is signed or not sent', () => {
  it('signs the status read and the chain re-subscribe', () => {
    const hook = code('hooks/useEnterpriseNotificationSync.ts');
    expect(hook).not.toMatch(/if \(auth\)/);
    expect(hook).not.toMatch(/if \(subscribeAuth\)/);
    expect(hook.match(/attachRequiredWkAuth\(/g)).toHaveLength(2);
    expect(hook).toContain(
      '/v1/enterprise/subscription`,\n        signedStatusData',
    );
    expect(hook).toContain(
      '/v1/enterprise/subscribe`,\n            signedSubscribeData',
    );
  });
});

describe('dead code: the unsigned WalletConnect relay client is gone', () => {
  it('src/lib/walletConnectRelay.ts no longer exists', () => {
    expect(
      existsSync(
        new URL('../../src/lib/walletConnectRelay.ts', import.meta.url),
      ),
    ).toBe(false);
  });
});
