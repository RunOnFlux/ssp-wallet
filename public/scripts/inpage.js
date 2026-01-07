async function request(method, params) {
  const message = { method, params };
  const event = new CustomEvent('fromPageEvent', { detail: message });
  window.dispatchEvent(event);

  const response = await new Promise((resolve, reject) => {
    function handleMessage(eventReceived) {
      if (eventReceived.data.type === 'fromContentScript') {
        window.removeEventListener('message', handleMessage, false);

        const detail = eventReceived.data.detail;

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
