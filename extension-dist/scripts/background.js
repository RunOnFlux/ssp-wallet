/*global browser*/
// https://github.com/MetaMask/metamask-extension/blob/develop/app/scripts/app-init.js

/*
 * This content script is injected programmatically because
 * MAIN world injection does not work properly via manifest
 * https://bugs.chromium.org/p/chromium/issues/detail?id=634381
 */

let awaitingSendResponse;
let popupId;

async function getAllWindows() {
  const windows = await window.browser.windows.getAll();
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
  await window.browser.windows.update(windowId, options);
}

window.browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

window.browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.origin === 'ssp' || request.origin === 'ssp-background') {
    return;
  }
  void (async () => {
    awaitingSendResponse = sendResponse;
    let top = 80;
    let left = 10;
    const lastFocused = await window.browser.windows.getLastFocused();
    if (lastFocused) {
      top = lastFocused.top + 80;
      left = Math.max(lastFocused.left + (lastFocused.width - 420 - 10), 10);
    }
    const popup = await getPopup(popupId);
    let timeout = 1000;
    if (popup) {
      const options = {
        focused: true,
      };
      // bring focus to existing popup
      await focusWindow(popup.id, options);
      timeout = 200;
    } else {
      const options = {
        url: window.browser.runtime.getURL('index.html'),
        type: 'popup',
        top,
        left,
        width: 420,
        height: 620,
      };
      const newPopup = await window.browser.windows.create(options);
      popupId = newPopup.id;
    }
    setTimeout(() => {
      void window.browser.runtime.sendMessage({
        origin: 'ssp-background',
        data: request,
      });
    }, timeout);
  })();
  return true;
});
