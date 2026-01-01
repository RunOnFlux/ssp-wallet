/*global chrome, browser*/
// Firefox uses 'browser', Chrome uses 'chrome' - prefer browser for native promise support
const ext = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;

async function request(details) {
  try {
    // Check if extension context is still valid
    if (!ext || !ext.runtime || !ext.runtime.sendMessage) {
      throw new Error('SSP Wallet extension context invalidated. Please refresh the page.');
    }
    const response = await ext.runtime.sendMessage(details);
    return response;
  } catch (err) {
    console.error('[SSP Content Script]', err);
    // Return error in format that inpage.js can handle
    return {
      status: 'ERROR',
      error: err.message || 'Extension communication failed',
      code: 4900, // Disconnected error code
    };
  }
}

window.addEventListener(
  'fromPageEvent',
  async function (event) {
    // console.log(event)
    const result = await request(event.detail);
    // console.log(result);
    window.postMessage({ type: "fromContentScript", detail: result }, "*");
  },
  false,
);
