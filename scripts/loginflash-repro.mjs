#!/usr/bin/env node
/**
 * Repro harness for the reported "QR sync view flashes for a split second
 * after unlocking" bug. Based on authlayout-screenshots.mjs (same restore +
 * pair flow, same LavaMoat constraint: locators only, no page.evaluate).
 *
 * Flow: fresh profile → restore + pair (same launch, so no fingerprint
 * drift) → lock via the identity-bar lock button → unlock → poll the Key
 * sync view marker ("Dual Signature SSP Key") every frame for 5s and log every
 * visibility transition. Records video for frame-level evidence.
 *
 * Output: .loginflash-shots/  (gitignored via .*-shots/)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, '.loginflash-shots');
const PROFILE = path.join(ROOT, '.loginflash-profile');
const NAV = 60_000;

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'UpgradeTest#123';
const TEST_KEY_XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

const field = (page, id) =>
  page
    .locator(`input#${id}, textarea#${id}, #${id} input, #${id} textarea`)
    .first();
const fill = async (page, id, v) => {
  const t = field(page, id);
  await t.waitFor({ timeout: NAV });
  await t.fill(v);
};

async function restoreAndPair(page, id) {
  await page.goto(`chrome-extension://${id}/index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV,
  });
  const restore = page.getByText('Restore with Seed', { exact: false }).first();
  await restore.waitFor({ timeout: NAV });
  await restore.click();
  await page.locator('#seedForm_mnemonic').waitFor({ timeout: NAV });
  await fill(page, 'seedForm_mnemonic', TEST_MNEMONIC);
  await fill(page, 'seedForm_password', TEST_PASSWORD);
  await fill(page, 'seedForm_confirm_password', TEST_PASSWORD);
  await page.locator('#seedForm_tos').check();
  await page.getByRole('button', { name: 'Import Wallet' }).click();

  const dialog = page.getByRole('dialog', { name: 'Backup Wallet Seed' });
  await dialog.waitFor({ timeout: NAV });
  // Redesigned backup modal: dashed "Show" button behind a Popconfirm.
  await dialog.getByRole('button', { name: /Show/ }).first().click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await dialog
    .getByText('I have backed up my wallet seed phrase', { exact: false })
    .click();
  await dialog.getByRole('button', { name: 'Restore Wallet' }).click();

  const personalize = page.getByRole('dialog', { name: 'Make it yours' });
  if (
    await personalize
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await personalize.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(600);
  }

  const keyHeading = page.getByRole('heading', { name: 'Dual Signature SSP Key' });
  const loginHeading = page.getByRole('heading', { name: 'Welcome back!' });
  await keyHeading.or(loginHeading).first().waitFor({ timeout: NAV });
  if (await loginHeading.isVisible().catch(() => false)) {
    await fill(page, 'loginForm_password', TEST_PASSWORD);
    await page.getByRole('button', { name: 'Unlock Wallet' }).click();
  }
  await keyHeading.waitFor({ timeout: NAV });
  await page.getByText('Enter manually', { exact: false }).click();
  await page.locator('textarea').first().fill(TEST_KEY_XPUB);
  await page
    .getByRole('button', { name: /Sync Key|Synchron/i })
    .first()
    .click();
  const cont = page.getByRole('button', { name: 'Continue to wallet' });
  await cont.waitFor({ timeout: NAV });
  await cont.click();
  try {
    await page
      .locator('[data-testid="key-verify-match"]')
      .click({ timeout: 15_000 });
  } catch {
    /* some flow variants go straight to Home without the verify step */
  }
  await keyHeading.waitFor({ state: 'hidden', timeout: NAV });
  try {
    const skip = page.getByRole('button', { name: 'Skip Tutorial' });
    await skip.waitFor({ timeout: 8000 });
    await page.screenshot({ path: path.join(OUT, 'tutorial-modal.png') });
    await skip.click();
  } catch {
    /* none */
  }
  await page.waitForTimeout(600);
}

async function main() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    colorScheme: 'dark',
    viewport: { width: 420, height: 600 },
    recordVideo: { dir: OUT, size: { width: 420, height: 600 } },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: NAV });
    const id = new URL(sw.url()).host;
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    console.log('Restoring + pairing…');
    await restoreAndPair(page, id);
    console.log('Paired, on Home. Locking…');

    await page.getByRole('button', { name: 'Lock' }).click();
    const loginHeading = page.getByRole('heading', { name: 'Welcome back!' });
    await loginHeading.waitFor({ timeout: NAV });
    await page.waitForTimeout(400);

    const keyHeading = page.getByRole('heading', {
      name: 'Dual Signature SSP Key',
    });
    const watchForFlash = async (tag, ms = 5000) => {
      const t0 = Date.now();
      let wasVisible = false;
      let sightings = 0;
      while (Date.now() - t0 < ms) {
        const vis = await keyHeading.isVisible().catch(() => false);
        if (vis !== wasVisible) {
          const at = Date.now() - t0;
          console.log(
            `  [${tag} ${at}ms] sync view ${vis ? 'APPEARED' : 'disappeared'}`,
          );
          if (vis) {
            sightings += 1;
            await page.screenshot({
              path: path.join(OUT, `flash-${tag}-${at}ms.png`),
            });
          }
          wasVisible = vis;
        }
        await page.waitForTimeout(16);
      }
      console.log(
        sightings > 0
          ? `  ${tag}: FLASH REPRODUCED (${sightings}x)`
          : `  ${tag}: no flash in ${ms}ms`,
      );
      return sightings;
    };

    console.log('Scenario 1: unlock on default chain…');
    await fill(page, 'loginForm_password', TEST_PASSWORD);
    await page.getByRole('button', { name: 'Unlock Wallet' }).click();
    await watchForFlash('btc-unlock');
    await page.screenshot({ path: path.join(OUT, 's1-final.png') });

    console.log('Scenario 2: switch active chain to Ethereum + pair it…');
    await page.locator('.identity-pill').click();
    await page.waitForTimeout(600);
    await page.getByText('Ethereum', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    // Ethereum is not paired in this profile, so the sync view opens
    // legitimately — complete the manual pairing so the chain ends up in
    // the same paired-and-stored state as a real user's chains.
    if (await keyHeading.isVisible().catch(() => false)) {
      await page.getByText('Enter manually', { exact: false }).click();
      await page.locator('textarea').first().fill(TEST_KEY_XPUB);
      await page
        .getByRole('button', { name: /Sync Key|Synchron/i })
        .first()
        .click();
      try {
        const cont2 = page.getByRole('button', { name: 'Continue to wallet' });
        await cont2.waitFor({ timeout: 10_000 });
        await cont2.click();
        await page
          .locator('[data-testid="key-verify-match"]')
          .click({ timeout: 15_000 });
      } catch {
        /* non-identity chains sync without the verification gate */
      }
      await keyHeading.waitFor({ state: 'hidden', timeout: NAV });
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 's2-on-eth.png') });

    console.log('Scenario 3: popup reopen with live session (auto-unlock)…');
    const page2 = await ctx.newPage();
    await page.close();
    const keyHeading2 = page2.getByRole('heading', {
      name: 'Dual Signature SSP Key',
    });
    await page2.goto(`chrome-extension://${id}/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: NAV,
    });
    {
      const t0 = Date.now();
      let wasVisible = false;
      let sightings = 0;
      while (Date.now() - t0 < 8000) {
        const vis = await keyHeading2.isVisible().catch(() => false);
        if (vis !== wasVisible) {
          const at = Date.now() - t0;
          console.log(
            `  [reopen ${at}ms] sync view ${vis ? 'APPEARED' : 'disappeared'}`,
          );
          if (vis) {
            sightings += 1;
            await page2.screenshot({
              path: path.join(OUT, `flash-reopen-${at}ms.png`),
            });
          }
          wasVisible = vis;
        }
        await page2.waitForTimeout(16);
      }
      console.log(
        sightings > 0
          ? `  reopen-eth: FLASH REPRODUCED (${sightings}x)`
          : '  reopen-eth: no flash in 8000ms',
      );
      await page2.screenshot({ path: path.join(OUT, 's3-final.png') });
    }
  } finally {
    await ctx.close();
    fs.rmSync(PROFILE, { recursive: true, force: true });
  }
  console.log('Done →', path.relative(ROOT, OUT));
}

main().catch((e) => {
  console.error('LOGINFLASH HARNESS FAILED:', e?.message ?? e);
  process.exit(1);
});
