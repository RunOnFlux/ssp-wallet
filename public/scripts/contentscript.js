console.log('contentscript.js');

async function request(method, parameters) {
  // console.log('request', method, parameters);
  try {
    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({ method, parameters });
    // console.log(response);
    return response;
  } catch (err) {
    console.error(err);
  }
}

window.addEventListener('fromPageEvent', async function (event) {
  // console.log(event)
  const result = await request(event.detail);
  // console.log(result);
  const eventB = new CustomEvent('fromContentScript', { detail: result });
  window.dispatchEvent(eventB);
}, false);
