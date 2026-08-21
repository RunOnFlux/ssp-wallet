import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * Contract for the window a website's request opens.
 *
 * v2 made the side panel the default open behaviour, and the dapp path
 * honoured it: asking for a signature from a web page docked a full-height
 * panel that reflowed the page you were signing for. A request now always
 * gets the small floating window v1 used, sized to the wallet shell.
 *
 * background.js is a plain service worker with no test harness, so it is
 * pinned at the source level; each assertion names the declaration the
 * behaviour depends on.
 */

const readPublic = (relativePath: string): string =>
  readFileSync(
    new URL(`../../public/${relativePath}`, import.meta.url),
    'utf8',
  );

const readSrc = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

const background = readPublic('scripts/background.js');

/** The dapp-request branch: from the buffering comment to the end of the if. */
const dappRequestBranch = background.slice(
  background.indexOf('// Buffer message'),
  background.indexOf('// UI already open and listener registered'),
);

describe('dapp request window', () => {
  it('opens the floating window, never the docked side panel', () => {
    expect(dappRequestBranch).toContain('await openPopupWindow();');
    expect(dappRequestBranch).not.toContain('openSidePanel');
  });

  it('sizes the window to the wallet shell plus the title bar', () => {
    expect(background).toContain('const POPUP_WINDOW_WIDTH = 420;');
    expect(background).toContain('const POPUP_WINDOW_HEIGHT = 650;');

    // The shell body is a fixed 420x600; the window must not be narrower than
    // the body or the layout is clipped rather than scrolled.
    const css = readFileSync(
      new URL('../../src/index.css', import.meta.url),
      'utf8',
    );
    const body = css.slice(css.indexOf('body {'), css.indexOf('#root {'));
    expect(body).toContain('width: 420px;');
    expect(body).toContain('height: 600px;');
  });

  it('tags the window as the popup surface so the shell is not laid out wide', () => {
    // Without ?ctx=popup main.tsx falls back to `innerWidth !== 420`, which a
    // framed window fails on platforms that inset the viewport.
    expect(background).toContain("getURL('index.html?ctx=popup')");
  });

  it('focuses an existing wallet window instead of stacking a second one', () => {
    const openPopup = background.slice(
      background.indexOf('async function openPopupWindow()'),
      background.indexOf('async function openSidePanel('),
    );
    expect(openPopup).toContain('if (popupId !== null)');
    expect(openPopup).toContain('focused: true');
  });
});

describe('an already-open wallet takes the request', () => {
  it('forwards to the open UI instead of opening anything new', () => {
    // activeUIPort is set for any connected surface — side panel, our window,
    // or the browser action popup.
    const forwardBranch = background.slice(
      background.indexOf('// A wallet UI is already open'),
    );
    expect(background).toContain('const hasActiveUI = activeUIPort !== null;');
    expect(background).toContain('if (!hasActiveUI) {');
    expect(forwardBranch).toContain("origin: 'ssp-background'");
    // No new surface is opened on this branch.
    expect(
      forwardBranch.slice(0, forwardBranch.indexOf('return true;')),
    ).not.toContain('openPopupWindow()');
  });

  it('brings a wallet window that is behind the browser forward', () => {
    const forwardBranch = background.slice(
      background.indexOf('// A wallet UI is already open'),
      background.indexOf('// UI already open and listener registered'),
    );
    expect(forwardBranch).toContain('if (popupId !== null)');
    expect(forwardBranch).toContain('focused: true');
  });

  it('re-establishes the port the terminated service worker dropped', () => {
    // MV3 kills the idle worker, dropping the port while the wallet is still
    // on screen. Without a reconnect the background reads the open UI as
    // closed and opens a second window for the next request.
    const context = readSrc('contexts/sspConnectContext.tsx');
    const portEffect = context.slice(
      context.indexOf('// Port connection enables background.js'),
      context.indexOf('// Validate and sanitize iconUrl'),
    );
    expect(portEffect).toContain('port.onDisconnect.addListener');
    expect(portEffect).toContain('setPortGeneration');
    // Re-announcing readiness flushes whatever the background buffered while
    // the port was down, so the request is not lost.
    expect(context).toContain(
      '[wExternalIdentity, wkIdentity, portGeneration]',
    );
  });
});
