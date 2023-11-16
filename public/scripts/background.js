// https://github.com/MetaMask/metamask-extension/blob/develop/app/scripts/app-init.js

/*
 * This content script is injected programmatically because
 * MAIN world injection does not work properly via manifest
 * https://bugs.chromium.org/p/chromium/issues/detail?id=634381
 */

let awaitingSendResponse;
let popupId;

const registerInPageContentScript = async () => {
  try {
    // eslint-disable-next-line no-undef
    await chrome.scripting.registerContentScripts([
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
    console.warn(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Dropped attempt to register inpage content script. ${err}`,
    );
  }
};

void registerInPageContentScript();

async function getAllWindows() {
  const windows = await chrome.windows.getAll();
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await chrome.windows.update(windowId, options);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(request);
  if (request.origin !== 'ssp') {
    return;
  }
  if (awaitingSendResponse) {
    awaitingSendResponse(request.data);
  } else {
    sendResponse('Something went wrong.');
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.origin === 'ssp' || request.origin === 'ssp-background') {
    return;
  }
  void (async () => {
    awaitingSendResponse = sendResponse;
    // we wait for user action on the popup
    console.log('background.js got a message');
    console.log(request);
    console.log(sender);
    let top = 80;
    let left = 10;
    const lastFocused = await chrome.windows.getLastFocused();
    if (lastFocused) {
      top = lastFocused.top + 80;
      left = Math.max(
        lastFocused.left + (lastFocused.width - 420 - 10),
        10,
      );
    }
    const popup = await getPopup(popupId);
    let timeout = 1000;
    if (popup) {
      const options = {
        focused: true,
      };
      // bring focus to existing chrome popup
      await focusWindow(popup.id, options);
      timeout = 200;
    } else {
      const options = {
        url: chrome.runtime.getURL( // here just index? and send runtime message?
          'index.html?request=' +
          JSON.stringify(request) +
          '&sender=' +
          JSON.stringify(sender),
        ),
        type: 'popup',
        top,
        left,
        width: 420,
        height: 620,
      };
      const newPopup = await chrome.windows
        .create(options)
      popupId = newPopup.id;
    }
    setTimeout(() => {
      void chrome.runtime.sendMessage({ // send new message to poup. We do not await a response. Instead we listen for a new message from popup
        origin: 'ssp-background',
        dataB: 'hello from ssp background',
        data: {
          type: 'sign_message',
          address: 'abc',
          message: 'edf',
          chain: 'lllll',
        }
      });
    }, timeout);
  })();
  // Important! Return true to indicate you want to send a response asynchronously
  return true;
});
