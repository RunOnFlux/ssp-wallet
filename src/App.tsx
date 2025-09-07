import '@ant-design/v5-patch-for-react-19';
import { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import WalletConnectModals from './components/WalletConnect/WalletConnectModals';
import TutorialProvider from './components/Tutorial/TutorialProvider';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import router from './router';

function App() {
  const { defaultAlgorithm, darkAlgorithm } = theme;
  const [themeStyle, setThemeStyle] = useState(() => {
    const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
    return darkModePreference.matches ? 'dark' : 'light';
  });

  const changeTheme = (isDark: boolean) => {
    if (isDark) {
      setThemeStyle('dark');
    } else {
      setThemeStyle('light');
    }
  };

  useEffect(() => {
    const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => changeTheme(e.matches);
    
    darkModePreference.addEventListener('change', handleChange);
    
    return () => {
      darkModePreference.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: themeStyle === 'dark' ? darkAlgorithm : defaultAlgorithm,
      }}
    >
      <ErrorBoundary>
        <AntApp>
          <TutorialProvider>
            <WalletConnectModals />
            <RouterProvider router={router} />
          </TutorialProvider>
        </AntApp>
      </ErrorBoundary>
    </ConfigProvider>
  );
}

export default App;
