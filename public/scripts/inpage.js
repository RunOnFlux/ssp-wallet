// Define the variable you want to inject into the window object
const myInjectedVariable = 'Hello from the extension';

// Inject the variable into the window object
window.myInjectedVariable = myInjectedVariable;

console.log('Variable injected into the window object:', myInjectedVariable);

async function request(method, parameters) {
  const message = {
    method,
    parameters,
  };
  const event = new CustomEvent('fromPageEvent', { detail: message });
  window.dispatchEvent(event);
  const response = await new Promise((resolve, reject) => {
    window.addEventListener(
      'fromContentScript',
      function (eventB) {
        console.log(eventB);
        resolve(eventB.detail);
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
