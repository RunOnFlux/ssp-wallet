const ext = typeof browser !== 'undefined' ? browser : chrome;

async function sendToBackground(details) {
  try {
    if (!ext?.runtime?.sendMessage) {
      throw new Error(
        'SSP Wallet extension context invalidated. Please refresh the page.',
      );
    }
    const response = await ext.runtime.sendMessage(details);
    return response;
  } catch (err) {
    console.error('[SSP Content Script]', err);
    return {
      status: 'ERROR',
      error: err.message || 'Extension communication failed',
      code: 4900,
    };
  }
}

window.addEventListener(
  'fromPageEvent',
  async function (event) {
    const result = await sendToBackground(event.detail);
    window.postMessage({ type: 'fromContentScript', detail: result }, '*');
  },
  false,
);
