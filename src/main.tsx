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
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';

// Popup vs Side Panel detection.
// The manifest tags each surface explicitly (index.html?ctx=popup /
// ?ctx=sidepanel) — deterministic, immune to the zoom/DPI/scrollbar rounding
// that made the old width heuristic misclassify the popup as a panel.
// The width heuristic remains only as a fallback for untagged opens (a full
// tab, an old pinned panel from before the manifest change).
const POPUP_WIDTH = 420;
const EXPLICIT_CTX = new URLSearchParams(window.location.search).get('ctx');

const detectExtensionContext = () => {
  const html = document.documentElement;
  const body = document.body;
  const isSidePanel =
    EXPLICIT_CTX === 'popup'
      ? false
      : EXPLICIT_CTX === 'sidepanel'
        ? true
        : window.innerWidth !== POPUP_WIDTH;

  html.classList.toggle('extension-sidepanel', isSidePanel);
  html.classList.toggle('extension-popup', !isSidePanel);
  body.classList.toggle('extension-sidepanel', isSidePanel);
  body.classList.toggle('extension-popup', !isSidePanel);
};

// Classify immediately — with an explicit ctx the answer is already known,
// and waiting 100ms let the first paint run unclamped (the popup window
// sized itself to that wide paint and never shrank back).
detectExtensionContext();
// Re-check after the browser settles the final width (fallback opens only).
setTimeout(detectExtensionContext, 100);

// Re-detect on resize (side-panel resizing; no-op when ctx is explicit)
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
