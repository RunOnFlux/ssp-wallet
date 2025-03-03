async function request(method, params) {
  const message = {
    method,
    params,
  };
  const event = new CustomEvent('fromPageEvent', { detail: message });
  window.dispatchEvent(event);

  const response = await new Promise((resolve) => {
    window.addEventListener(
      'fromContentScript',
      function eventHandler(event) {
        resolve(event.detail);
        window.removeEventListener('fromContentScript', eventHandler);
      },
      false
    );
  });

  return response;
}

const sspObject = {
  request,
};

window.ssp = sspObject;
