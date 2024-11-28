import { Image } from 'antd';
import { useState } from 'react';

interface Props {
  isClickeable?: boolean;
}
function PoweredByFlux({ isClickeable = false }: Props) {
  const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
  darkModePreference.addEventListener('change', (e) => changeTheme(e.matches));
  const [themeStyle, setThemeStyle] = useState(
    darkModePreference.matches ? 'light' : 'dark',
  );
  const [colorBox, setColorBox] = useState(
    darkModePreference.matches ? '#333' : '#ddd',
  );

  const changeTheme = (isDark: boolean) => {
    if (isDark) {
      setThemeStyle('light');
      setColorBox('#333');
    } else {
      setThemeStyle('dark');
      setColorBox('#ddd');
    }
  };

  const open = (url: string) => {
    window.open(url, '_blank');
  };
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        marginLeft: 'auto',
        marginRight: 'auto',
        zIndex: 1000,
        left: 0,
        right: 0,
        textAlign: 'center',
        boxShadow: `0 -7px 7px -7px ${colorBox}`,
        padding: 10,
        paddingBottom: 14,
      }}
      className="powered-by-flux"
    >
      {isClickeable && (
        <Image
          height={18}
          preview={false}
          src={`/powered_by_${themeStyle}.svg`}
          onClick={() => open('https://runonflux.com')}
          style={{ cursor: 'pointer' }}
        />
      )}
      {!isClickeable && (
        <Image
          height={18}
          preview={false}
          src={`/powered_by_${themeStyle}.svg`}
        />
      )}
    </div>
  );
}

PoweredByFlux.defaultProps = {
  isClickeable: false,
};

export default PoweredByFlux;
