// content.js
// Define the variable you want to inject into the window object
const myInjectedVariable = 'Hello from the extension';

// Inject the variable into the window object
window.myInjectedVariable = myInjectedVariable;

console.log('Variable injected into the window object:', myInjectedVariable);
