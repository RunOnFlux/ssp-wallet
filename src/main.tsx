import React from 'react';
import ReactDOM from 'react-dom/client';
import { store } from './store';
import { Provider } from 'react-redux';
import './lib/axiosConfig'; // Setup axios interceptors for SSP infrastructure
import localForage from 'localforage';
import App from './App';
import { SocketProvider } from './contexts/SocketContext';
import { SspConnectProvider } from './contexts/sspConnectContext';
import { WalletConnectProvider } from './contexts/WalletConnectContext';
import FiatCurrencyController from './components/FiatCurrencyController/FiatCurrencyController.tsx';
import NetworkFeeController from './components/NetworkFeeController/NetworkFeeController.tsx';
import ServicesAvailabilityController from './components/ServicesAvailabilityController/ServicesAvailabilityController.tsx';
import ABEController from './components/ABEController/ABEController.tsx';
import './translations';
import './index.css';

// Popup vs Side Panel detection
// Popup opens at exactly 420px width (hardcoded in CSS)
// Side panel opens at browser's default (360px) or resized width
const POPUP_WIDTH = 420;

const detectExtensionContext = () => {
  const html = document.documentElement;
  const body = document.body;
  const isSidePanel = window.innerWidth !== POPUP_WIDTH;

  html.classList.toggle('extension-sidepanel', isSidePanel);
  html.classList.toggle('extension-popup', !isSidePanel);
  body.classList.toggle('extension-sidepanel', isSidePanel);
  body.classList.toggle('extension-popup', !isSidePanel);
};

// Initial detection after brief delay (allows browser to set final width)
setTimeout(detectExtensionContext, 100);

// Re-detect on resize (for side panel resizing)
window.addEventListener('resize', detectExtensionContext);

localForage.config({
  name: 'SSPWallet',
  driver: [localForage.INDEXEDDB, localForage.WEBSQL, localForage.LOCALSTORAGE],
  version: 1.0,
  size: 4980736, // Size of database, in bytes. WebSQL-only for now.
  storeName: 'keyvaluepairs', // Should be alphanumeric, with underscores.
  description: 'Database for SSP Wallet',
});

if (!navigator.userAgent.includes('Mac')) {
  // only import this css if on windows platform
  void import('./scrollbar.css')
    .then(() => {
      console.log('Scrollbar CSS loaded');
    })
    .catch((e) => console.log(e));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <SocketProvider>
        <SspConnectProvider>
          <WalletConnectProvider>
            <App />
            <FiatCurrencyController />
            <NetworkFeeController />
            <ServicesAvailabilityController />
            <ABEController />
          </WalletConnectProvider>
        </SspConnectProvider>
      </SocketProvider>
    </Provider>
  </React.StrictMode>,
);
