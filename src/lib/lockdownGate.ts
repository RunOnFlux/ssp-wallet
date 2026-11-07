/**
 * Startup gate for SES lockdown.
 *
 * Production builds load `lavamoat-lockdown.js` as the first script of every
 * page (packages/vite-plugin-lavamoat). It runs SES `lockdown()`, which
 * freezes every JavaScript intrinsic, and stops the page itself if that
 * fails. This gate is the second line of defence: if that script never ran
 * at all (removed from the HTML, failed to load, blocked), the intrinsics are
 * still mutable and any dependency could have poisoned the primordials the
 * signing code relies on. The wallet then refuses to mount and shows a
 * blocking error instead of asking for a password or a seed phrase.
 *
 * Dev builds (`vite` dev server) never run lockdown, so the gate is off there.
 */

/** Intrinsics SES freezes. If any is still mutable, lockdown did not run. */
function lockdownIntrinsics(): readonly object[] {
  return [Object.prototype, Function.prototype, Array.prototype];
}

/** True when the JavaScript intrinsics are frozen (SES lockdown ran). */
export function isLockdownActive(
  intrinsics: readonly object[] = lockdownIntrinsics(),
): boolean {
  return intrinsics.every((intrinsic) => Object.isFrozen(intrinsic));
}

/**
 * Whether startup must be refused. Only production builds are gated; a
 * production build without lockdown always fails closed.
 */
export function shouldBlockStartup(
  isProductionBuild: boolean,
  lockdownActive: boolean = isLockdownActive(),
): boolean {
  return isProductionBuild && !lockdownActive;
}

export const LOCKDOWN_FAILURE_TITLE = 'SSP Wallet cannot start safely';
export const LOCKDOWN_FAILURE_MESSAGE =
  'The security lockdown that protects your keys did not run, so the wallet ' +
  'has stopped before loading. Your funds are not affected. Close this ' +
  'window and reopen SSP Wallet. If this message persists, reinstall the ' +
  'extension from the official store and do not enter your password or ' +
  'seed phrase.';

/**
 * Replace the page content with a static, blocking error. Uses DOM APIs and
 * textContent only (no React, no HTML parsing), so it works even when the
 * rest of the bundle cannot be trusted.
 */
export function renderLockdownFailure(
  container: HTMLElement,
  doc: Document = container.ownerDocument,
): void {
  container.replaceChildren();

  const box = doc.createElement('div');
  box.setAttribute('role', 'alert');
  box.setAttribute('data-testid', 'lockdown-failure');
  box.style.cssText =
    'max-width:360px;margin:48px auto;padding:24px 16px;text-align:center;' +
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'color:#b91c1c;background:#fef2f2;border:1px solid #fca5a5;' +
    'border-radius:12px;line-height:1.5;';

  const title = doc.createElement('h1');
  title.style.cssText = 'font-size:18px;margin:0 0 12px;';
  title.textContent = LOCKDOWN_FAILURE_TITLE;

  const message = doc.createElement('p');
  message.style.cssText = 'font-size:14px;margin:0;color:#7f1d1d;';
  message.textContent = LOCKDOWN_FAILURE_MESSAGE;

  box.append(title, message);
  container.append(box);
}
