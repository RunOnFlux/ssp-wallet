const ext = typeof browser !== 'undefined' ? browser : chrome;

let pendingRequest = null;
let popupId = null;
let isPopupOpening = false;

ext.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupId) {
    if (pendingRequest) {
      try {
        pendingRequest({
          status: 'ERROR',
          error: 'User closed the wallet popup',
          code: 4001,
        });
      } catch (err) {
        console.error('[SSP Background] Error sending rejection:', err);
      }
      pendingRequest = null;
    }
    popupId = null;
    isPopupOpening = false;
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
    console.warn('[SSP Background] Content script registration:', err.message);
  }
};

void registerInPageContentScript();

async function getExistingPopup() {
  if (!popupId) return null;
  try {
    const windows = await ext.windows.getAll({ windowTypes: ['popup'] });
    return windows.find((win) => win.id === popupId) || null;
  } catch (_err) {
    return null;
  }
}

async function focusWindow(windowId) {
  try {
    await ext.windows.update(windowId, { focused: true });
  } catch (err) {
    console.error('[SSP Background] Error focusing window:', err);
  }
}

async function createPopupWindow() {
  let top = 80;
  let left = 10;

  try {
    const lastFocused = await ext.windows.getLastFocused();
    if (lastFocused && lastFocused.top !== undefined) {
      top = lastFocused.top + 80;
      left = Math.max(
        (lastFocused.left || 0) + ((lastFocused.width || 500) - 420 - 10),
        10,
      );
    }
  } catch (_err) {
    console.warn('[SSP Background] Could not get last focused window');
  }

  return ext.windows.create({
    url: ext.runtime.getURL('index.html'),
    type: 'popup',
    top,
    left,
    width: 420,
    height: 620,
  });
}

function sendRequestToPopup(request) {
  setTimeout(() => {
    ext.runtime
      .sendMessage({
        origin: 'ssp-background',
        data: request,
      })
      .catch(() => {});
  }, 100);
}

ext.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.origin !== 'ssp') {
    return false;
  }

  if (pendingRequest) {
    try {
      pendingRequest(message.data);
    } catch (err) {
      console.error('[SSP Background] Error sending response:', err);
    }
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

  if (pendingRequest) {
    try {
      pendingRequest({
        status: 'ERROR',
        error: 'New request received, previous request cancelled',
        code: 4001,
      });
    } catch (_err) {
      // Ignored - best effort rejection of previous request
    }
    pendingRequest = null;
  }

  pendingRequest = sendResponse;

  void (async () => {
    try {
      const existingPopup = await getExistingPopup();

      if (existingPopup) {
        await focusWindow(popupId);
        sendRequestToPopup(request);
      } else if (isPopupOpening) {
        setTimeout(() => sendRequestToPopup(request), 500);
      } else {
        isPopupOpening = true;
        const popup = await createPopupWindow();
        popupId = popup.id;
        isPopupOpening = false;
        setTimeout(() => sendRequestToPopup(request), 800);
      }
    } catch (err) {
      console.error('[SSP Background] Error handling request:', err);
      pendingRequest = null;
      sendResponse({
        status: 'ERROR',
        error: err.message || 'Failed to open wallet popup',
        code: 4900,
      });
    }
  })();

  return true;
});
