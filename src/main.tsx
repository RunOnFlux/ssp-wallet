import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import router from './router';
import { store } from './store';
import { Provider } from 'react-redux';
import localForage from 'localforage';
import { SocketProvider } from './contexts/SocketContext';
import { SspConnectProvider } from './contexts/sspConnectContext';
import FiatCurrencyController from './components/FiatCurrencyController/FiatCurrencyController.tsx';
import NetworkFeeController from './components/NetworkFeeController/NetworkFeeController.tsx';
import './translations';
import './index.css';

localForage.config({
  name: 'SSPWallet',
  driver: [localForage.INDEXEDDB, localForage.WEBSQL, localForage.LOCALSTORAGE],
  version: 1.0,
  size: 4980736, // Size of database, in bytes. WebSQL-only for now.
  storeName: 'keyvaluepairs', // Should be alphanumeric, with underscores.
  description: 'Database for SSP Wallet',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <SocketProvider>
        <SspConnectProvider>
          <RouterProvider router={router} />
          <FiatCurrencyController />
          <NetworkFeeController />
        </SspConnectProvider>
      </SocketProvider>
    </Provider>
  </React.StrictMode>,
);
