import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
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
      <RouterProvider router={router} />
    </ConfigProvider>
  );
}

export default App;
