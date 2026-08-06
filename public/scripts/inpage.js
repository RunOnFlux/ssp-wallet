// SSP injected provider (window.ssp), MAIN world.
//
// This bridge talks to contentscript.js over window events. The contract in
// both directions:
//   * every request carries a unique id, and a pending request resolves only on
//     the reply bearing that id;
//   * replies are accepted only from THIS window (event.source === window) and
//     this document's own origin.
//
// Neither check makes the page trusted. The wallet authenticates the requesting
// origin itself in the background worker, from the runtime `sender`.

let requestSequence = 0;

async function request(method, params) {
  const id = `ssp-${Date.now()}-${++requestSequence}-${Math.random()
    .toString(36)
    .slice(2)}`;

  return await new Promise((resolve, reject) => {
    function handleMessage(eventReceived) {
      // Only this window's own messages. A message posted by another frame —
      // including an embedded third-party iframe — carries a different
      // `source`, so this single check is all that is needed.
      // (No origin string comparison: source === window already implies this
      // document's origin, and comparing strings breaks on opaque origins such
      // as file:// pages, where both sides report "null".)
      if (eventReceived.source !== window) return;

      const data = eventReceived.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'fromContentScript') return;
      // Ignore replies belonging to a different request.
      if (data.id !== id) return;

      window.removeEventListener('message', handleMessage, false);

      const detail = data.detail;

      if (detail && detail.status === 'ERROR') {
        const error = new Error(
          detail.data || detail.result || detail.error || 'Request rejected',
        );
        error.code = detail.code || 4001;
        if (detail.errorCode) {
          error.errorCode = detail.errorCode;
        }
        reject(error);
        return;
      }

      resolve(detail);
    }

    window.addEventListener('message', handleMessage, false);

    // Dispatch only after the listener is attached, so a fast reply cannot be
    // missed (the original dispatched first and relied on the round trip being
    // slower than the rest of this function).
    window.dispatchEvent(
      new CustomEvent('fromPageEvent', { detail: { id, method, params } }),
    );
  });
}

const sspObject = {
  request,
};

window.ssp = sspObject;
