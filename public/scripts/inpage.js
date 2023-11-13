// Define the variable you want to inject into the window object
const myInjectedVariable = 'Hello from the extension';

// Inject the variable into the window object
window.myInjectedVariable = myInjectedVariable;

console.log('Variable injected into the window object:', myInjectedVariable);

let requestRunning = false;

async function request(method, parameters) {
  if (requestRunning) {
    throw new Error('Another request is running');
  }
  requestRunning = true;
  const message = {
    method,
    parameters,
  };
  const event = new CustomEvent('fromPageEvent', { detail: message });
  window.dispatchEvent(event);
  const response = await new Promise((resolve, reject) => {
    window.addEventListener(
      'fromContentScript',
      async function (eventB) {
        console.log(eventB);
        resolve(eventB.detail);
      },
      false,
    );
  });
  requestRunning = false;
  return response;
}

const sspObject = {
  request,
};

window.ssp = sspObject;
