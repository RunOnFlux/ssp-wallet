import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import cr from '../../src/translations/resources/en/createrestore.json';
import login from '../../src/translations/resources/en/login.json';

/**
 * Contract for the onboarding/auth surfaces (Welcome, Login, Create, Restore,
 * CreationSteps). Rendered geometry can't be asserted without a layout engine,
 * so these lock the parts that are pure data: the English copy contract and the
 * source-level invariants those screens rely on.
 */

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const welcomeSource = read('../../src/pages/Welcome/Welcome.tsx');
const loginSource = read('../../src/pages/Login/Login.tsx');
const createSource = read('../../src/pages/Create/Create.tsx');
const restoreSource = read('../../src/pages/Restore/Restore.tsx');
const creationStepsSource = read(
  '../../src/components/CreationSteps/CreationSteps.tsx',
);
const createCss = read('../../src/pages/Create/Create.css');
const personalizeCss = read(
  '../../src/components/OnboardingPersonalize/OnboardingPersonalize.css',
);

describe('onboarding + auth copy contract (en)', () => {
  it('reports an invalid seed phrase in correct English', () => {
    expect(cr.err_seed_invalid_words).toBe(
      'Wallet seed phrase contains invalid words: {{words}}.',
    );
    expect(cr.err_seed_invalid_words).toContain('{{words}}');
  });

  it('names the seed phrase one way on the import screen', () => {
    for (const value of [
      cr.import_seed,
      cr.wallet_seed,
      cr.input_seed_phrase,
      cr.input_wallet_seed,
    ]) {
      expect(value.toLowerCase()).toContain('seed phrase');
    }
  });

  it('never says "mnemonic" in user-facing copy', () => {
    const jargon = Object.entries(cr).filter(([, value]) =>
      JSON.stringify(value).toLowerCase().includes('mnemonic'),
    );
    expect(jargon).toEqual([]);
  });

  it('drops the dead weak-password confirm labels', () => {
    expect(cr).not.toHaveProperty('weak_password_confirm_ok');
    expect(cr).not.toHaveProperty('weak_password_confirm_cancel');
    // the rendered pair stays verb-shaped
    expect(cr.weak_password_change).toBe('Change password');
    expect(cr.weak_password_keep).toBe('Use weak password anyway');
  });

  it('carries whole-phrase stepper labels (never single words to concatenate)', () => {
    const labels = [
      cr.steps.get_started,
      cr.steps.create_password,
      cr.steps.import_wallet,
      cr.steps.backup_wallet,
      cr.steps.sync_key,
    ];
    for (const label of labels) {
      expect(label.trim().split(' ').length).toBeGreaterThan(1);
    }
  });

  it('tells a fresh wallet the same seed rules a restored one is told', () => {
    // Create's callout renders these four alongside seed_loose_info
    for (const key of [
      'wallet_seed_info',
      'wallet_seed_info_2',
      'keep_seed_safe',
      'seed_handling_sec',
    ] as const) {
      expect(createSource).toContain(`t('cr:${key}')`);
      expect(restoreSource).toContain(`t('cr:${key}')`);
    }
    expect(cr.seed_handling_sec.toLowerCase()).toContain('never share');
    expect(cr.seed_handling_sec.toLowerCase()).toContain('clipboard');
    expect(cr.seed_handling_sec.toLowerCase()).toContain('screenshot');
  });

  it('has a required-password message for the unlock field', () => {
    expect(login.err_pw_required).toBe('Please enter your password.');
  });
});

describe('CreationSteps labels', () => {
  it('renders one translation call per node instead of <br/>-joined words', () => {
    expect(creationStepsSource).not.toContain('<br />');
    expect(creationStepsSource).not.toContain("t('common:");
    for (const key of [
      'steps.get_started',
      'steps.create_password',
      'steps.import_wallet',
      'steps.backup_wallet',
      'steps.sync_key',
    ]) {
      expect(creationStepsSource).toContain(`t('cr:${key}')`);
    }
  });

  it('takes the personalize node label from the modal title itself', () => {
    expect(creationStepsSource).toContain("t('cr:personalize.title')");
  });
});

describe('primary actions report their state', () => {
  it('Welcome navigates from the buttons, not a nested Link', () => {
    expect(welcomeSource).not.toContain('<Link to');
    expect(welcomeSource).toContain(
      "import { useNavigate } from 'react-router'",
    );
    expect(welcomeSource).toContain("onClick={() => navigate('/create')}");
    expect(welcomeSource).toContain("onClick={() => navigate('/restore')}");
  });

  it('Login gates an empty password and shows an in-flight CTA', () => {
    expect(loginSource).toContain("message: t('login:err_pw_required')");
    expect(loginSource).toContain('loading={submitting}');
    expect(loginSource).toContain('if (!values.password)');
    expect(loginSource).toContain('if (submitting)');
    // the two pre-decrypt branches release the flag directly, everything after
    // goes through failUnlock
    expect(loginSource.match(/setSubmitting\(false\)/g)?.length).toBe(3);
  });

  it('Login releases the CTA and the password on every unlock failure', () => {
    expect(loginSource).toContain('const failUnlock = (content: string) => {');
    const body = loginSource
      .split('const failUnlock = (content: string) => {')[1]
      .split('};')[0];
    expect(body).toContain('setIsLoading(false)');
    expect(body).toContain('setSubmitting(false)');
    // re-submitting the same string must not be a no-op state write
    expect(body).toContain("setPassword('')");
    // four call sites: L1, L2, L3 and the wrong-password catch
    expect(loginSource.match(/failUnlock\(/g)?.length).toBe(4);
  });

  it('both Backup Wallet Seed modals disable OK until backup is confirmed', () => {
    for (const source of [createSource, restoreSource]) {
      expect(source).toContain(
        'okButtonProps={{ disabled: !canConfirmBackup }}',
      );
      expect(source).toContain(
        'const canConfirmBackup = WSPbackedUp && (wspWasShown || wpCopied);',
      );
    }
  });

  it('gates the Terms checkbox inline in both onboarding forms', () => {
    for (const source of [createSource, restoreSource]) {
      expect(source).toContain("Promise.reject(new Error(t('cr:err_tos')))");
    }
  });
});

describe('onboarding form layout + field wiring', () => {
  it('keeps Input.Password as the Form.Item direct child (label/aria wiring)', () => {
    for (const source of [createSource, restoreSource]) {
      expect(source).toContain('className="password-strength-slot"');
      // the old wrapper that stole the field id
      expect(source).not.toContain("<div style={{ position: 'relative' }}>");
    }
  });

  it('caps the onboarding form as one column with full-width fields', () => {
    expect(createCss).toContain('.page-frame-onboarding form');
    expect(createCss).toContain('.page-frame-onboarding .password-input');
    expect(createCss).toContain('.password-strength-slot');
  });

  it('lays the accent swatches out as a balanced 4-up grid', () => {
    expect(personalizeCss).toContain('grid-template-columns: repeat(4, 34px)');
    expect(personalizeCss).not.toContain('flex-wrap: wrap');
  });

  it('never shows two onboarding steppers at once', () => {
    for (const source of [createSource, restoreSource]) {
      expect(source).toContain(
        "visibility: isOnboardingModalOpen ? 'hidden' : 'visible'",
      );
    }
    expect(createSource).toContain(
      'isModalOpen || isConfrimModalOpen || personalizeOpen',
    );
    expect(restoreSource).toContain('isModalOpen || personalizeOpen');
  });
});
