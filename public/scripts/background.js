const ext = typeof browser !== 'undefined' ? browser : chrome;

let pendingRequest = null;
let pendingMessageData = null;
let popupId = null;
let activeUIPort = null;

const STORAGE_KEY_DEFAULT_OPEN = 'ssp_default_open_behavior';
const OPEN_MODE_POPUP = 'popup';
const OPEN_MODE_WINDOW = 'window';
const OPEN_MODE_SIDEPANEL = 'sidepanel';

const isSidePanelSupported = typeof ext.sidePanel !== 'undefined';

// ---------------------------------------------------------------------------
// Sender trust
//
// The extension UI and injected content scripts share one runtime.onMessage
// channel. Telling them apart is the job of the `sender` argument, which the
// browser process populates: fields inside the message body are page-supplied,
// since contentscript.js forwards page payloads verbatim. Every privileged path
// below therefore keys off `sender`.
// ---------------------------------------------------------------------------

const EXT_BASE_URL = ext.runtime.getURL('');

/** True only for our own extension pages (popup, side panel, options). */
function isFromExtensionUI(sender) {
  return (
    sender?.id === ext.runtime.id &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(EXT_BASE_URL)
  );
}

/** True only for our content script running in a web page/frame. */
function isFromContentScript(sender) {
  return (
    sender?.id === ext.runtime.id &&
    !!sender.tab &&
    typeof sender.url === 'string' &&
    !sender.url.startsWith(EXT_BASE_URL)
  );
}

/**
 * The requesting frame's real origin, as reported by the browser.
 * `sender.origin` is Chrome-only, so fall back to parsing the frame URL —
 * with all_frames:true this is the IFRAME's origin, which is the correct thing
 * to show the user. Returns null when the origin is opaque (sandboxed frame,
 * data:/about: URL), which callers must treat as untrusted rather than absent.
 */
function verifiedOrigin(sender) {
  if (typeof sender?.origin === 'string' && sender.origin !== 'null') {
    return sender.origin;
  }
  const url = sender?.url || sender?.tab?.url;
  if (typeof url !== 'string') return null;
  try {
    const { origin } = new URL(url);
    return origin && origin !== 'null' ? origin : null;
  } catch (_err) {
    return null;
  }
}

/**
 * Replace any caller-supplied origin/site identity with browser-verified
 * values. `siteName` and `iconUrl` stay page-supplied — they are cosmetic and
 * cannot be verified — but they are marked so the UI can label them as such
 * and must never be used to decide how much to trust a request.
 */
function stampVerifiedOrigin(request, sender) {
  const origin = verifiedOrigin(sender);
  const topUrl = sender?.tab?.url;
  let topOrigin = null;
  try {
    topOrigin = topUrl ? new URL(topUrl).origin : null;
  } catch (_err) {
    topOrigin = null;
  }
  return {
    ...request,
    params: {
      ...(request && typeof request.params === 'object' ? request.params : {}),
      // Authoritative. Overwrites whatever the page sent.
      origin,
      verifiedOrigin: origin,
      topOrigin,
      // NOTE: every key added here must also be accepted by sanitizeRequest()
      // (src/lib/sanitizeRequest.ts). Its param loop rejects any value that is
      // not a string unless the key has an explicit branch.
      isSubframe: typeof sender?.frameId === 'number' && sender.frameId !== 0,
    },
  };
}

async function getDefaultOpenBehavior() {
  try {
    const result = await ext.storage.local.get(STORAGE_KEY_DEFAULT_OPEN);
    return (
      result[STORAGE_KEY_DEFAULT_OPEN] ||
      (isSidePanelSupported ? OPEN_MODE_SIDEPANEL : OPEN_MODE_POPUP)
    );
  } catch (_err) {
    return isSidePanelSupported ? OPEN_MODE_SIDEPANEL : OPEN_MODE_POPUP;
  }
}

async function setDefaultOpenBehavior(mode) {
  await ext.storage.local.set({ [STORAGE_KEY_DEFAULT_OPEN]: mode });
  updateContextMenuCheckedState(mode);
  await updateActionBehavior(mode);
}

async function updateActionBehavior(mode) {
  try {
    if (isSidePanelSupported) {
      await ext.sidePanel.setPanelBehavior({
        openPanelOnActionClick: mode === OPEN_MODE_SIDEPANEL,
      });
    }

    if (mode === OPEN_MODE_SIDEPANEL || mode === OPEN_MODE_WINDOW) {
      await ext.action.setPopup({ popup: '' });
    } else {
      await ext.action.setPopup({ popup: 'index.html' });
    }
  } catch (_err) {
    // Side panel API may not be fully available
  }
}

ext.action.onClicked.addListener(async (_tab) => {
  const mode = await getDefaultOpenBehavior();
  if (mode === OPEN_MODE_WINDOW) {
    await openPopupWindow();
  }
  // Popup and sidepanel are handled automatically by the browser
});

async function updateContextMenuCheckedState(mode) {
  try {
    await ext.contextMenus.update('set-default-popup', {
      checked: mode === OPEN_MODE_POPUP,
    });
    await ext.contextMenus.update('set-default-window', {
      checked: mode === OPEN_MODE_WINDOW,
    });
    if (isSidePanelSupported) {
      await ext.contextMenus.update('set-default-sidepanel', {
        checked: mode === OPEN_MODE_SIDEPANEL,
      });
    }
  } catch (_err) {
    /* Context menu not ready */
  }
}

function createContextMenus() {
  ext.contextMenus.removeAll(() => {
    // Open As items (flat)
    ext.contextMenus.create({
      id: 'open-popup',
      title: 'Open as Popup',
      contexts: ['action'],
    });

    ext.contextMenus.create({
      id: 'open-window',
      title: 'Open as Window',
      contexts: ['action'],
    });

    if (isSidePanelSupported) {
      ext.contextMenus.create({
        id: 'open-sidepanel',
        title: 'Open as Side Panel',
        contexts: ['action'],
      });
    }

    // Set Default submenu
    ext.contextMenus.create({
      id: 'set-default',
      title: 'Set Default',
      contexts: ['action'],
    });

    ext.contextMenus.create({
      id: 'set-default-popup',
      parentId: 'set-default',
      title: 'Popup',
      type: 'checkbox',
      checked: !isSidePanelSupported,
      contexts: ['action'],
    });

    ext.contextMenus.create({
      id: 'set-default-window',
      parentId: 'set-default',
      title: 'Window',
      type: 'checkbox',
      checked: false,
      contexts: ['action'],
    });

    if (isSidePanelSupported) {
      ext.contextMenus.create({
        id: 'set-default-sidepanel',
        parentId: 'set-default',
        title: 'Side Panel',
        type: 'checkbox',
        checked: true,
        contexts: ['action'],
      });
    }

    getDefaultOpenBehavior().then(updateContextMenuCheckedState);
  });
}

ext.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'open-popup':
      try {
        // Ensure popup is set before opening
        await ext.action.setPopup({ popup: 'index.html' });
        await ext.action.openPopup();
        // Restore behavior based on current default
        const currentMode = await getDefaultOpenBehavior();
        await updateActionBehavior(currentMode);
      } catch (_err) {
        // openPopup may not be available, fall back to window
        await openPopupWindow();
      }
      break;
    case 'open-window':
      await openPopupWindow();
      break;
    case 'open-sidepanel':
      await openSidePanel(tab?.windowId);
      break;
    case 'set-default-popup':
      await setDefaultOpenBehavior(OPEN_MODE_POPUP);
      break;
    case 'set-default-window':
      await setDefaultOpenBehavior(OPEN_MODE_WINDOW);
      break;
    case 'set-default-sidepanel':
      await setDefaultOpenBehavior(OPEN_MODE_SIDEPANEL);
      break;
  }
});

async function openPopupWindow() {
  let top = 80;
  let left = 10;
  try {
    const lastFocused = await ext.windows.getLastFocused();
    if (lastFocused) {
      top = lastFocused.top + 80;
      left = Math.max(
        (lastFocused.left || 0) + ((lastFocused.width || 500) - 420 - 10),
        10,
      );
    }
  } catch (_err) {
    // Use defaults
  }

  const popup = await ext.windows.create({
    url: ext.runtime.getURL('index.html'),
    type: 'popup',
    top,
    left,
    width: 420,
    height: 650, // Extra height to account for window title bar
  });
  popupId = popup.id;
  return popup;
}

async function openSidePanel(windowId) {
  if (!isSidePanelSupported) {
    return openPopupWindow();
  }
  try {
    const targetWindowId = windowId || (await ext.windows.getCurrent()).id;
    await ext.sidePanel.open({ windowId: targetWindowId });
  } catch (_err) {
    // Expected: sidePanel.open() requires user gesture, so programmatic
    // requests (e.g. from websites) will fall back to window
    return openPopupWindow();
  }
}

async function initializeExtension() {
  createContextMenus();
  const mode = await getDefaultOpenBehavior();
  await updateActionBehavior(mode);
}

ext.runtime.onInstalled.addListener(initializeExtension);
ext.runtime.onStartup.addListener(initializeExtension);
initializeExtension();

ext.runtime.onConnect.addListener((port) => {
  if (port.name === 'ssp-ui') {
    activeUIPort = port;

    port.onDisconnect.addListener(() => {
      if (activeUIPort === port) {
        activeUIPort = null;
        pendingMessageData = null;
        if (pendingRequest) {
          try {
            pendingRequest({
              status: 'ERROR',
              error: 'User closed the wallet',
              code: 4001,
            });
          } catch (_err) {
            /* Response channel closed */
          }
          pendingRequest = null;
        }
      }
    });
  }
});

ext.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupId) {
    pendingMessageData = null;
    if (pendingRequest) {
      try {
        pendingRequest({
          status: 'ERROR',
          error: 'User closed the wallet popup',
          code: 4001,
        });
      } catch (_err) {
        // Response channel closed
      }
      pendingRequest = null;
    }
    popupId = null;
  }
});

const registerInPageContentScript = async () => {
  try {
    await ext.scripting.registerContentScripts([
      {
        id: 'sspinpage',
        matches: ['file://*/*', 'http://*/*', 'https://*/*'],
        js: ['scripts/inpage.js'],
        runAt: 'document_start',
        world: 'MAIN',
      },
    ]);
  } catch (err) {
    // Script already registered on background reload
    console.warn('[SSP Background] Content script registration:', err.message);
  }
};

registerInPageContentScript();

// UI listener is ready — forward any buffered message.
// Only our own extension pages may claim this origin.
ext.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  if (message.origin !== 'ssp-ui-ready') return false;
  if (!isFromExtensionUI(sender)) return false;

  if (pendingMessageData) {
    const data = pendingMessageData;
    pendingMessageData = null;
    void ext.runtime.sendMessage({
      origin: 'ssp-background',
      data,
    });
  }

  return false;
});

// The wallet UI's answer to a pending dapp request. This resolves the dapp's
// sendResponse, so it MUST come from our own UI — otherwise any web page could
// resolve another site's in-flight request with data of its choosing.
ext.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  if (message.origin !== 'ssp') return false;
  if (!isFromExtensionUI(sender)) return false;

  if (pendingRequest) {
    pendingRequest(message.data);
    pendingRequest = null;
  }

  if (popupId) {
    ext.windows.remove(popupId).catch(() => {});
    popupId = null;
  }

  return false;
});

ext.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (
    request.origin === 'ssp' ||
    request.origin === 'ssp-background' ||
    request.origin === 'ssp-ui-ready'
  ) {
    return false;
  }

  // Only our content script may raise a dapp request. Anything else reaching
  // here is not a web page asking for something.
  if (!isFromContentScript(sender)) {
    return false;
  }

  // Overwrite the page's self-declared identity with the browser-verified
  // origin BEFORE the request is buffered or forwarded, so every consumer —
  // the approval UI, and the SSP Key via the relay — sees the real requester.
  const verifiedRequest = stampVerifiedOrigin(request, sender);

  pendingRequest = sendResponse;

  void (async () => {
    const hasActiveUI = activeUIPort !== null;

    if (!hasActiveUI) {
      // Buffer message — it will be sent when the UI port connects
      pendingMessageData = verifiedRequest;

      const defaultMode = await getDefaultOpenBehavior();
      if (defaultMode === OPEN_MODE_SIDEPANEL && isSidePanelSupported) {
        await openSidePanel(sender.tab?.windowId);
      } else if (defaultMode === OPEN_MODE_WINDOW) {
        await openPopupWindow();
      } else {
        // For popup mode, open as window since we can't programmatically trigger the popup
        await openPopupWindow();
      }
    } else {
      // UI already open and listener registered — short delay is safe
      setTimeout(() => {
        void ext.runtime.sendMessage({
          origin: 'ssp-background',
          data: verifiedRequest,
        });
      }, 100);
    }
  })();

  return true;
});
