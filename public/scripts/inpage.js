// Generate unique request IDs to match responses to requests
let requestIdCounter = 0;

async function request(method, params) {
  const requestId = ++requestIdCounter;
  const message = {
    method,
    params,
    requestId,
  };
  const event = new CustomEvent('fromPageEvent', { detail: message });
  window.dispatchEvent(event);

  const response = await new Promise((resolve, reject) => {
    function handleMessage(eventReceived) {
      if (eventReceived.data.type === "fromContentScript") {
        // Clean up listener after receiving response
        window.removeEventListener('message', handleMessage, false);

        const detail = eventReceived.data.detail;

        // Handle error responses (e.g., popup closed by user)
        if (detail && detail.status === 'ERROR') {
          const error = new Error(detail.error || 'Request rejected');
          error.code = detail.code || 4001;
          reject(error);
          return;
        }

        resolve(detail);
      }
    }

    window.addEventListener('message', handleMessage, false);
  });

  return response;
}

const sspObject = {
  request,
};

window.ssp = sspObject;
