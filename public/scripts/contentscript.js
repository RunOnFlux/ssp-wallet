const ext = chrome || browser;

async function request(details) {
  try {
    // eslint-disable-next-line no-undef
    const response = await ext.runtime.sendMessage(details);
    // console.log(response);
    return response;
  } catch (err) {
    console.error(err);
    return err;
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
