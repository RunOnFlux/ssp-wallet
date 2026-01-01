/*global chrome*/
// https://github.com/MetaMask/metamask-extension/blob/develop/app/scripts/app-init.js

/*
 * This content script is injected programmatically because
 * MAIN world injection does not work properly via manifest
 * https://bugs.chromium.org/p/chromium/issues/detail?id=634381
 */

const ext = chrome || browser;
let awaitingSendResponse;
let popupId;

// Graceful shutdown: detect when popup is closed by user and reject pending promises
ext.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupId) {
    // Popup was closed - reject any pending request
    if (awaitingSendResponse) {
      awaitingSendResponse({
        status: 'ERROR',
        error: 'User closed the wallet popup',
        code: 4001, // User rejected request (EIP-1193 standard)
      });
      awaitingSendResponse = null;
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
    /**
     * An error occurs when background.js is reloaded. Attempts to avoid the duplicate script error:
     * 1. registeringContentScripts inside runtime.onInstalled - This caused a race condition
     *    in which the provider might not be loaded in time.
     * 2. await chrome.scripting.getRegisteredContentScripts() to check for an existing
     *    inpage script before registering - The provider is not loaded on time.
     */
    console.warn(`Dropped attempt to register inpage content script. ${err}`);
  }
};

void registerInPageContentScript();

async function getAllWindows() {
  const windows = await ext.windows.getAll();
  return windows;
}

function getPopupIn(windows) {
  return windows
    ? windows.find((win) => {
      // Returns notification popup
      return win && win.type === 'popup' && win.id === popupId;
    })
    : null;
}

async function getPopup() {
  const windows = await getAllWindows();
  return getPopupIn(windows);
}

async function focusWindow(windowId, options = { focused: true }) {
  await ext.windows.update(windowId, options);
}

ext.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(request);
  if (request.origin !== 'ssp') {
    return;
  }
  if (awaitingSendResponse) {
    awaitingSendResponse(request.data);
    awaitingSendResponse = null; // Clear callback after use
  } else {
    sendResponse('Something went wrong.');
  }
  if (popupId) {
    ext.windows.remove(popupId);
    popupId = null; // Clear popup ID after removal
  }
});

ext.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.origin === 'ssp' || request.origin === 'ssp-background') {
    return;
  }
  void (async () => {
    awaitingSendResponse = sendResponse;
    // we wait for user action on the popup
    // console.log('background.js got a message');
    // console.log(request);
    // console.log(sender);
    let top = 80;
    let left = 10;
    const lastFocused = await ext.windows.getLastFocused();
    if (lastFocused) {
      top = lastFocused.top + 80;
      left = Math.max(lastFocused.left + (lastFocused.width - 420 - 10), 10);
    }
    const options = {
      url: ext.runtime.getURL('index.html'),
      type: 'popup',
      top,
      left,
      width: 420,
      height: 620,
    };
    const newPopup = await ext.windows.create(options);
    popupId = newPopup.id;
    setTimeout(() => {
      void ext.runtime.sendMessage({
        // send new message to poup. We do not await a response. Instead we listen for a new message from popup
        origin: 'ssp-background',
        data: request,
        // data: {
        //   method: 'sign_message',
        //   params: {
        //     address: 'abc',
        //     message: 'edf',
        //     chain: 'lllll',
        //   }
        // }
        // data: {
        //   method: 'sspwid_sign_message',
        //   params: {
        //     message: 'edf',
        //   }
        // }
      });
    }, 1000);
  })();
  // Important! Return true to indicate you want to send a response asynchronously
  return true;
});
