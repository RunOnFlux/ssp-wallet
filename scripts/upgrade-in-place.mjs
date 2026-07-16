#!/usr/bin/env node
/**
 * Upgrade-in-place release gate for SSP Wallet (Chrome extension).
 *
 * Proves that upgrading the extension over an existing browser profile NEVER
 * loses wallet state: no re-onboarding, no re-pair, no restore-from-seed —
 * only the password unlock is required after the upgrade.
 *
 * What it does:
 *   1. Builds the OLD version (default: the most recent commit whose
 *      package.json version differs from HEAD, i.e. the previous release
 *      state) in a temporary git worktree.
 *   2. Loads the old build as an unpacked extension in a fresh Chromium
 *      profile (Playwright launchPersistentContext, headful), restores a
 *      wallet from the fixed BIP39 TEST VECTOR mnemonic, unlocks it, pairs
 *      the SSP Key via manual xpub input, captures the receive address, and
 *      sets the theme to dark.
 *   3. Swaps the NEW build (HEAD dist/) over the SAME staging directory
 *      (same absolute path => same unpacked-extension ID => same storage
 *      origin) and relaunches Chromium with the SAME user-data-dir.
 *   4. Asserts continuity: app opens on /login (NOT /welcome), the same
 *      password unlocks, Home shows the SAME address, no SSP Key re-pair
 *      modal, theme is still dark.
 *
 * Usage:
 *   yarn test:upgrade                 # auto-resolves the previous release ref
 *   yarn test:upgrade <git-ref>       # explicit old ref
 *   yarn test:upgrade --reuse-dist    # skip rebuilding HEAD if dist/ exists
 *   yarn test:upgrade --keep          # keep temp dirs even on success
 *
 * Prereqs: `npx playwright install chromium` (one-time). Headful Chromium —
 * this is a local/manual release gate, not a CI job.
 *
 * NOTE: the mnemonic below is the well-known public BIP39 test vector.
 * It is a throwaway — never send funds to it. Nothing sensitive is logged.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixed test inputs (public throwaway values — safe to keep in source)
// ---------------------------------------------------------------------------
// Standard BIP39 test vector (all-zero entropy). Public knowledge, throwaway.
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Meets the app's strength rules (upper/lower/digit/special, >= 8 chars).
const TEST_PASSWORD = 'UpgradeTest#123';
// A valid BIP32 mainnet xpub (public BIP32 test vector 1, master key) used as
// the "SSP Key" second factor via the manual-input sync path. Any valid xpub
// different from the wallet xpub works — pairing math only needs a real key.
const TEST_KEY_XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';

// ---------------------------------------------------------------------------
// Paths — STAGING must be a FIXED absolute path reused for both runs, because
// the unpacked-extension ID is derived from the path and the extension's
// storage origin is derived from the ID.
// ---------------------------------------------------------------------------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, '.upgrade-test');
const STAGING = path.join(WORK, 'ext');
const PROFILE = path.join(WORK, 'profile');
const WORKTREE = path.join(WORK, 'worktree');

const argvRest = process.argv.slice(2);
const FLAGS = new Set(argvRest.filter((a) => a.startsWith('--')));
const OLD_REF_ARG = argvRest.find((a) => !a.startsWith('--')) ?? null;
const REUSE_DIST = FLAGS.has('--reuse-dist');
const KEEP = FLAGS.has('--keep');

const NAV_TIMEOUT = 60_000;

let stepNo = 0;
function step(msg) {
  stepNo += 1;
  console.log(`\n[upgrade-test] Step ${stepNo}: ${msg}`);
}
function info(msg) {
  console.log(`[upgrade-test]   ${msg}`);
}
function fail(msg) {
  console.error(`\n❌ UPGRADE-IN-PLACE GATE FAILED: ${msg}`);
  console.error(`   Debug artifacts kept at: ${WORK}`);
  process.exit(1);
}

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
  });
  if (res.status !== 0 && !opts.allowFail) {
    const extra = opts.quiet
      ? `\n${res.stdout ?? ''}\n${res.stderr ?? ''}`
      : '';
    throw new Error(
      `Command failed (${res.status}): ${cmd} ${args.join(' ')}${extra}`,
    );
  }
  return res;
}

function gitOut(args, opts = {}) {
  const res = sh('git', args, {
    ...opts,
    quiet: true,
    allowFail: opts.allowFail,
  });
  return (res.stdout ?? '').trim();
}

function readPkgVersionAt(ref) {
  const raw = gitOut(['show', `${ref}:package.json`]);
  return JSON.parse(raw).version;
}

// Most recent commit whose package.json version differs from HEAD's — i.e.
// the tip of the previous release's history.
function resolveOldRef() {
  const headVersion = readPkgVersionAt('HEAD');
  const commits = gitOut([
    'rev-list',
    '--max-count=500',
    'HEAD',
    '--',
    'package.json',
  ])
    .split('\n')
    .filter(Boolean);
  for (const c of commits) {
    let v;
    try {
      v = readPkgVersionAt(c);
    } catch {
      continue;
    }
    if (v !== headVersion) return { ref: c, version: v, headVersion };
  }
  throw new Error(
    `Could not find a commit with a package.json version different from HEAD (${headVersion}).`,
  );
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  rmrf(dest);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function readStagedManifestVersion() {
  return JSON.parse(
    fs.readFileSync(path.join(STAGING, 'manifest.json'), 'utf8'),
  ).version;
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------
async function launchWithExtension() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false, // extensions are not supported in classic headless
    colorScheme: 'light', // deterministic 'system' theme baseline
    viewport: { width: 480, height: 880 },
    args: [
      `--disable-extensions-except=${STAGING}`,
      `--load-extension=${STAGING}`,
    ],
  });
  // Discover the extension ID from the MV3 background service worker.
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: NAV_TIMEOUT });
  }
  const extensionId = new URL(sw.url()).host;
  return { context, extensionId };
}

async function openApp(context, extensionId) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`chrome-extension://${extensionId}/index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  });
  return page;
}

// antd Form.Item puts the field id on its direct child — sometimes the
// <input> itself, sometimes a wrapper <div>. Match the real input either way.
// NOTE: the app runs under LavaMoat lockdown which scuttles the main world,
// so page.evaluate()/locator.evaluate() are unusable — everything here must
// stay pure Playwright locators (they run in the isolated utility world).
function field(page, id) {
  return page
    .locator(`input#${id}, textarea#${id}, #${id} input, #${id} textarea`)
    .first();
}

async function fillField(page, id, value) {
  const target = field(page, id);
  await target.waitFor({ timeout: NAV_TIMEOUT });
  await target.fill(value);
}

async function unlockWithPassword(page) {
  await page
    .getByRole('heading', { name: 'Welcome back!' })
    .waitFor({ timeout: NAV_TIMEOUT });
  await fillField(page, 'loginForm_password', TEST_PASSWORD);
  await page.getByRole('button', { name: 'Unlock Wallet' }).click();
}

async function readHomeAddress(page) {
  const container = page.locator('[data-tutorial="wallet-address"]');
  await container.waitFor({ timeout: NAV_TIMEOUT });
  const text = (await container.innerText()).trim();
  // Old builds display "xxxxxxxx...yyyyyy" (first 8 + last 6); new builds use
  // the shared addressDisplay helper: "xxxxxx…yyyyyy" (first 6 + last 6).
  // Normalize both to first-6 + last-6 so the SAME-address assertion is
  // display-format agnostic across the upgrade boundary.
  const match = text.match(/([^\s.…]{6,10})(?:\.\.\.|…)([^\s.…]{6})/);
  if (!match) throw new Error(`Could not parse address from Home: "${text}"`);
  return `${match[1].slice(0, 6)}…${match[2].slice(-6)}`;
}

async function dismissTutorialIfShown(page) {
  // The onboarding welcome overlay appears ~1s after first sync. Skipping it
  // persists tutorial.cancelled = true, which itself must survive upgrade.
  try {
    const skip = page.getByRole('button', { name: 'Skip Tutorial' });
    await skip.waitFor({ timeout: 6_000 });
    await skip.click();
    info('Dismissed onboarding tutorial overlay (Skip Tutorial).');
  } catch {
    info('No tutorial overlay appeared (ok).');
  }
}

async function screenshotOnFailure(context, name) {
  try {
    const page = context.pages()[0];
    if (page) {
      const shot = path.join(WORK, `failure-${name}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      console.error(`[upgrade-test]   Failure screenshot: ${shot}`);
    }
  } catch {
    // best effort only
  }
}

// ---------------------------------------------------------------------------
// Phase 1: OLD build — restore wallet, pair key, capture state
// ---------------------------------------------------------------------------
async function phaseOne() {
  const { context, extensionId } = await launchWithExtension();
  try {
    const page = await openApp(context, extensionId);

    step('OLD build: expecting fresh profile to land on /welcome');
    const restoreLink = page.getByRole('link', { name: 'Restore with Seed' });
    await restoreLink.waitFor({ timeout: NAV_TIMEOUT });
    await restoreLink.click();

    step('OLD build: driving the Restore flow (BIP39 test vector)');
    await page.locator('#seedForm_mnemonic').waitFor({ timeout: NAV_TIMEOUT });
    await fillField(page, 'seedForm_mnemonic', TEST_MNEMONIC);
    await fillField(page, 'seedForm_password', TEST_PASSWORD);
    await fillField(page, 'seedForm_confirm_password', TEST_PASSWORD);
    await page.locator('#seedForm_tos').check();
    await page.getByRole('button', { name: 'Import Wallet' }).click();

    // Backup-confirmation modal: must reveal the seed once, tick the backup
    // checkbox, then confirm "Restore Wallet".
    const dialog = page.getByRole('dialog', { name: 'Backup Wallet Seed' });
    await dialog.waitFor({ timeout: NAV_TIMEOUT });
    await dialog.getByRole('button', { name: /Show Mnemonic/ }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await dialog
      .getByText('I have backed up my wallet seed phrase', { exact: false })
      .click();
    await dialog.getByRole('button', { name: 'Restore Wallet' }).click();

    step(
      'OLD build: proceeding to Home (auto-unlocks via session, or manual unlock)',
    );
    // After restore the app navigates to /login; with the fresh session
    // password blob it usually auto-unlocks straight into Home where the
    // SSP Key sync modal appears. Handle both variants.
    const keyDialog = page.getByRole('dialog', { name: 'Dual Factor SSP Key' });
    const loginHeading = page.getByRole('heading', { name: 'Welcome back!' });
    await keyDialog.or(loginHeading).first().waitFor({ timeout: NAV_TIMEOUT });
    if (await loginHeading.isVisible().catch(() => false)) {
      await unlockWithPassword(page);
    }

    step('OLD build: pairing SSP Key via manual xpub input');
    await keyDialog.waitFor({ timeout: NAV_TIMEOUT });
    await keyDialog.getByRole('button', { name: /Issues syncing/ }).click();
    await keyDialog.locator('textarea').fill(TEST_KEY_XPUB);
    await keyDialog.getByRole('button', { name: 'Sync Key' }).click();
    await keyDialog.waitFor({ state: 'hidden', timeout: NAV_TIMEOUT });

    step('OLD build: capturing receive address on Home');
    const address = await readHomeAddress(page);
    info(`Captured address: ${address} (identity chain: btc)`);

    await dismissTutorialIfShown(page);

    step('OLD build: setting theme to dark via Settings UI');
    // Open the burger submenu in the navbar, pick "Settings".
    await page
      .locator('[data-tutorial="extended-menu"]')
      .getByRole('menuitem')
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' });
    await settingsDialog.waitFor({ timeout: NAV_TIMEOUT });
    // The theme <Select> currently shows "System" — switch it to "Dark".
    await settingsDialog.getByText('System', { exact: true }).click();
    await page.getByRole('option', { name: 'Dark' }).click();
    await page
      .locator('html[data-theme="dark"]')
      .waitFor({ timeout: NAV_TIMEOUT });
    // Give localForage a moment to flush the preference to IndexedDB.
    await page.waitForTimeout(1_000);
    await settingsDialog.getByRole('button', { name: 'Close' }).click();
    // Re-open the app and re-check: proves dark mode was persisted, not
    // just applied. (page.reload() would 404 — the SPA pushState-ed to a
    // virtual route like /home that is not a real extension file.)
    await page.goto(`chrome-extension://${extensionId}/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });
    await page
      .locator('html[data-theme="dark"]')
      .waitFor({ timeout: NAV_TIMEOUT });
    info('Theme is dark and persisted (survives reload).');

    return { extensionId, address };
  } catch (err) {
    await screenshotOnFailure(context, 'phase1');
    throw err;
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Phase 2: NEW build over the SAME profile — assert continuity
// ---------------------------------------------------------------------------
async function phaseTwo(expected) {
  const { context, extensionId } = await launchWithExtension();
  try {
    if (extensionId !== expected.extensionId) {
      throw new Error(
        `Extension ID changed across upgrade (${expected.extensionId} -> ${extensionId}). ` +
          'Same staging path must yield the same ID; storage origin would be lost.',
      );
    }
    const page = await openApp(context, extensionId);

    step(
      'NEW build: asserting app opens on /login (wallet exists), not /welcome',
    );
    const loginHeading = page.getByRole('heading', { name: 'Welcome back!' });
    const welcomeRestore = page.getByRole('link', {
      name: 'Restore with Seed',
    });
    await loginHeading
      .or(welcomeRestore)
      .first()
      .waitFor({ timeout: NAV_TIMEOUT });
    if (await welcomeRestore.isVisible()) {
      throw new Error(
        'App landed on /welcome after upgrade — wallet storage was LOST. ' +
          'This is exactly the regression this gate exists to catch.',
      );
    }
    info('Landed on /login — encrypted wallet seed survived the upgrade.');

    step('NEW build: unlocking with the pre-upgrade password');
    await unlockWithPassword(page);

    step('NEW build: asserting Home shows the SAME address without re-pairing');
    // If the SSP Key pairing had been lost, the "Dual Factor SSP Key" modal
    // would block Home and the address would never render.
    const address = await readHomeAddress(page);
    if (address !== expected.address) {
      throw new Error(
        `Address changed across upgrade: expected "${expected.address}", got "${address}".`,
      );
    }
    const keyDialogVisible = await page
      .getByRole('dialog', { name: 'Dual Factor SSP Key' })
      .isVisible()
      .catch(() => false);
    if (keyDialogVisible) {
      throw new Error(
        'SSP Key re-pair modal appeared after upgrade — pairing was lost.',
      );
    }
    info(`Address preserved: ${address}`);

    step('NEW build: asserting settings survived (theme still dark)');
    // The theme preference lives in the extension-origin IndexedDB
    // (localForage "themeMode"); if storage had been lost the app would be
    // back on the light "system" default set by this launch's colorScheme.
    try {
      await page
        .locator('html[data-theme="dark"]')
        .waitFor({ timeout: 15_000 });
    } catch {
      throw new Error(
        'Dark theme preference not preserved after upgrade (html[data-theme="dark"] missing).',
      );
    }
    info('Theme still dark — settings storage survived.');
  } catch (err) {
    await screenshotOnFailure(context, 'phase2');
    throw err;
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = Date.now();
  if (!fs.existsSync(path.join(ROOT, 'package.json'))) {
    throw new Error(`Not at repo root: ${ROOT}`);
  }
  fs.mkdirSync(WORK, { recursive: true });
  // Fresh profile every run — the whole point is exercising a profile created
  // by the OLD build.
  rmrf(PROFILE);

  step('Resolving OLD ref (previous release state)');
  const headVersion = readPkgVersionAt('HEAD');
  let oldRef;
  let oldVersion;
  if (OLD_REF_ARG) {
    oldRef = gitOut(['rev-parse', OLD_REF_ARG]);
    oldVersion = readPkgVersionAt(oldRef);
    if (oldVersion === headVersion) {
      info(
        `Warning: OLD ref has the same package.json version as HEAD (${headVersion}).`,
      );
    }
  } else {
    const resolved = resolveOldRef();
    oldRef = resolved.ref;
    oldVersion = resolved.version;
  }
  info(`HEAD version: ${headVersion}`);
  info(`OLD ref: ${oldRef.slice(0, 10)} (version ${oldVersion})`);

  step(
    `Building OLD version ${oldVersion} in a git worktree (slow — yarn install + build)`,
  );
  // Reuse a previous run's built worktree if it is already at the right
  // commit and has a dist/ — saves several minutes when iterating.
  const worktreeHead = fs.existsSync(WORKTREE)
    ? gitOut(['rev-parse', 'HEAD'], { cwd: WORKTREE, allowFail: true })
    : '';
  if (
    worktreeHead === oldRef &&
    fs.existsSync(path.join(WORKTREE, 'dist', 'manifest.json'))
  ) {
    info(
      `Reusing existing built worktree at ${WORKTREE} (already at ${oldRef.slice(0, 10)}).`,
    );
  } else {
    sh('git', ['worktree', 'remove', '--force', WORKTREE], {
      allowFail: true,
      quiet: true,
    });
    rmrf(WORKTREE);
    sh('git', ['worktree', 'prune'], { quiet: true, allowFail: true });
    sh('git', ['worktree', 'add', '--force', '--detach', WORKTREE, oldRef]);
    info('Running yarn install in worktree...');
    sh('yarn', ['install'], { cwd: WORKTREE });
    info('Running yarn build in worktree...');
    sh('yarn', ['build'], { cwd: WORKTREE });
  }

  step('Staging OLD dist/ at the fixed extension path');
  copyDir(path.join(WORKTREE, 'dist'), STAGING);
  const stagedOldVersion = readStagedManifestVersion();
  info(`Staged manifest version: ${stagedOldVersion} at ${STAGING}`);

  step(
    'PHASE 1 — creating real wallet state on the OLD build (headful Chromium)',
  );
  const captured = await phaseOne();
  info(`Extension ID: ${captured.extensionId}`);

  step(
    `Building NEW version ${headVersion} at HEAD${REUSE_DIST ? ' (reuse requested)' : ''}`,
  );
  if (REUSE_DIST && fs.existsSync(path.join(ROOT, 'dist', 'manifest.json'))) {
    info('Reusing existing dist/ (--reuse-dist).');
  } else {
    sh('yarn', ['build'], { cwd: ROOT });
  }

  step('Swapping NEW dist/ over the SAME staging path');
  copyDir(path.join(ROOT, 'dist'), STAGING);
  const stagedNewVersion = readStagedManifestVersion();
  info(`Staged manifest version: ${stagedNewVersion} at ${STAGING}`);
  if (stagedNewVersion === stagedOldVersion) {
    info('Warning: old and new staged manifest versions are identical.');
  }

  step('PHASE 2 — relaunching over the SAME profile and asserting continuity');
  await phaseTwo(captured);

  const secs = Math.round((Date.now() - startedAt) / 1000);
  console.log('\n✅ UPGRADE-IN-PLACE GATE PASSED');
  console.log(
    `   Old build:        v${stagedOldVersion} (${oldRef.slice(0, 10)})`,
  );
  console.log(`   New build:        v${stagedNewVersion}`);
  console.log(
    `   Wallet address:   ${captured.address} — preserved across upgrade`,
  );
  console.log(
    '   Password unlock:  OK (no re-onboarding, no re-pair, no restore)',
  );
  console.log('   Theme/settings:   dark theme preserved');
  console.log(`   Duration:         ${secs}s`);

  if (KEEP) {
    console.log(`   Temp dirs kept (--keep): ${WORK}`);
  } else {
    step('Cleanup');
    sh('git', ['worktree', 'remove', '--force', WORKTREE], {
      allowFail: true,
      quiet: true,
    });
    sh('git', ['worktree', 'prune'], { quiet: true, allowFail: true });
    rmrf(WORK);
    info('Removed worktree, staging dir and temp profile.');
  }
}

main().catch((err) => {
  fail(err?.message ?? String(err));
});
