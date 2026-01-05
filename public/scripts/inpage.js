let pendingHandler = null;

async function request(method, params) {
  if (pendingHandler) {
    throw new Error('Another request is already pending');
  }

  const message = { method, params };

  return new Promise((resolve, reject) => {
    let timeoutId = null;

    function handleMessage(event) {
      if (event.data?.type !== 'fromContentScript') return;

      cleanup();
      const detail = event.data.detail;

      if (detail?.status === 'ERROR') {
        const error = new Error(detail.error || 'Request rejected');
        error.code = detail.code || 4001;
        reject(error);
        return;
      }

      resolve(detail);
    }

    function cleanup() {
      window.removeEventListener('message', handleMessage, false);
      if (timeoutId) clearTimeout(timeoutId);
      pendingHandler = null;
    }

    pendingHandler = handleMessage;
    window.addEventListener('message', handleMessage, false);

    const customEvent = new CustomEvent('fromPageEvent', { detail: message });
    window.dispatchEvent(customEvent);

    timeoutId = setTimeout(() => {
      if (pendingHandler) {
        cleanup();
        const error = new Error('Request timeout - wallet did not respond');
        error.code = 4100;
        reject(error);
      }
    }, 300000);
  });
}

const sspObject = {
  request,
  isConnected: () => true,
};

Object.defineProperty(window, 'ssp', {
  value: sspObject,
  writable: false,
  configurable: false,
});
