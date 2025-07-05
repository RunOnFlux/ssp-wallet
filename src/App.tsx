import '@ant-design/v5-patch-for-react-19';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import WalletConnectModals from './components/WalletConnect/WalletConnectModals';
import router from './router';

function App() {
  const { defaultAlgorithm, darkAlgorithm } = theme;
  const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
  darkModePreference.addEventListener('change', (e) => changeTheme(e.matches));
  const [themeStyle, setThemeStyle] = useState(
    darkModePreference.matches ? 'dark' : 'light',
  );

  const changeTheme = (isDark: boolean) => {
    if (isDark) {
      setThemeStyle('dark');
    } else {
      setThemeStyle('light');
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: themeStyle === 'dark' ? darkAlgorithm : defaultAlgorithm,
      }}
    >
      <AntApp>
        <WalletConnectModals />
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
