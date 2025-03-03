async function request(details) {
  try {
    const response = await window.browser.runtime.sendMessage(details);
    return response;
  } catch (err) {
    console.error(err);
    return err;
  }
}

window.addEventListener(
  'fromPageEvent',
  async function (event) {
    const result = await request(event.detail);
    const eventB = new CustomEvent('fromContentScript', { detail: result });
    window.dispatchEvent(eventB);
  },
  false,
);
