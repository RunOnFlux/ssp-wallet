async function request(method, params) {
  const message = {
    method,
    params,
  };
  const event = new CustomEvent('fromPageEvent', { detail: message });
  window.dispatchEvent(event);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const response = await new Promise((resolve, reject) => {
    window.addEventListener(
      'message',
      function (eventReceived) {
        if (eventReceived.data.type === "fromContentScript") {
          resolve(eventReceived.data.detail);
        }
      },
      false,
    );
  });
  return response;
}

const sspObject = {
  request,
};

window.ssp = sspObject;
