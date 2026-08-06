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

// Page → extension. The payload is whatever the page put in the event, so it is
// untrusted: background.js overwrites the requester identity with the real
// origin derived from the runtime `sender` before any consumer sees it. What
// this script must do is (a) not let the page choose a privileged routing
// value, and (b) round-trip the request id so the injected provider can match
// each reply to the request it belongs to.
window.addEventListener(
  'fromPageEvent',
  async function (event) {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;

    const { id, method, params } = detail;

    // Forward only the request's own fields. Dropping everything else stops the
    // page from supplying `origin: 'ssp'` (or 'ssp-ui-ready'/'ssp-background'),
    // which background.js uses to route privileged, UI-only messages.
    const result = await sendToBackground({ method, params });

    // Echo the id back so inpage.js resolves the matching promise. Target '/'
    // — "same origin as this document" — instead of '*', so the reply is not
    // broadcast to embedded third-party frames. '/' is used rather than
    // location.origin because it is also correct for opaque origins (file://).
    window.postMessage({ type: 'fromContentScript', id, detail: result }, '/');
  },
  false,
);
