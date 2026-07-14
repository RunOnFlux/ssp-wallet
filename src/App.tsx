import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { ConfigProvider, App as AntApp } from 'antd';
import WalletConnectModals from './components/WalletConnect/WalletConnectModals';
import TutorialProvider from './components/Tutorial/TutorialProvider';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { ThemeProvider, useThemeMode } from './contexts/ThemeContext';
import { PrivacyProvider } from './contexts/PrivacyContext';
import { lightTheme, darkTheme } from './styles/theme';
import { setToastInstance } from './lib/toast';
import router from './router';

// Bridges the antd App message instance to the centralized toast service
function ToastBridge() {
  const { message } = AntApp.useApp();

  useEffect(() => {
    setToastInstance(message);
  }, [message]);

  return null;
}

function ThemedApp() {
  const { isDark } = useThemeMode();

  return (
    <ConfigProvider theme={isDark ? darkTheme : lightTheme}>
      <ErrorBoundary>
        <AntApp>
          <ToastBridge />
          <TutorialProvider>
            <WalletConnectModals />
            <RouterProvider router={router} />
          </TutorialProvider>
        </AntApp>
      </ErrorBoundary>
    </ConfigProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <ThemedApp />
      </PrivacyProvider>
    </ThemeProvider>
  );
}

export default App;
