const ext = typeof browser !== 'undefined' ? browser : chrome;

let pendingRequest = null;
let popupId = null;
let activeUIPort = null;

const STORAGE_KEY_DEFAULT_OPEN = 'ssp_default_open_behavior';
const OPEN_MODE_POPUP = 'popup';
const OPEN_MODE_WINDOW = 'window';
const OPEN_MODE_SIDEPANEL = 'sidepanel';

const isSidePanelSupported = typeof ext.sidePanel !== 'undefined';

async function getDefaultOpenBehavior() {
  try {
    const result = await ext.storage.local.get(STORAGE_KEY_DEFAULT_OPEN);
    return result[STORAGE_KEY_DEFAULT_OPEN] || OPEN_MODE_POPUP;
  } catch (_err) {
    return OPEN_MODE_POPUP;
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

function updateContextMenuCheckedState(mode) {
  try {
    ext.contextMenus.update('set-default-popup', {
      checked: mode === OPEN_MODE_POPUP,
    });
    ext.contextMenus.update('set-default-window', {
      checked: mode === OPEN_MODE_WINDOW,
    });
    if (isSidePanelSupported) {
      ext.contextMenus.update('set-default-sidepanel', {
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
      checked: true,
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
        checked: false,
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

ext.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.origin !== 'ssp') return false;

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
  if (request.origin === 'ssp' || request.origin === 'ssp-background') {
    return false;
  }

  pendingRequest = sendResponse;

  void (async () => {
    const hasActiveUI = activeUIPort !== null;

    if (!hasActiveUI) {
      const defaultMode = await getDefaultOpenBehavior();
      if (defaultMode === OPEN_MODE_SIDEPANEL && isSidePanelSupported) {
        await openSidePanel(sender.tab?.windowId);
      } else if (defaultMode === OPEN_MODE_WINDOW) {
        await openPopupWindow();
      } else {
        // For popup mode, open as window since we can't programmatically trigger the popup
        await openPopupWindow();
      }
    }

    setTimeout(
      () => {
        void ext.runtime.sendMessage({
          origin: 'ssp-background',
          data: request,
        });
      },
      hasActiveUI ? 100 : 1000,
    );
  })();

  return true;
});
