import { Image } from 'antd';
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { useThemeMode } from '../../contexts/ThemeContext';
import { version } from '../../../package.json';

interface Props {
  isClickeable?: boolean;
  /**
   * Render in normal document flow instead of fixed to the viewport bottom.
   * Used on the pre-shell pages (login/create/restore) where there is no tab
   * bar owning the fixed footer slot.
   */
  inline?: boolean;
  /**
   * Compact stacked variant for the side-panel nav rail's bottom footer block
   * (logo above a small version caption, 10px scale). Keeps the same click
   * behaviors: logo → runonflux.com, 5× version click → /security-test.
   * Styled by the host (TabBar.css) via the class hooks.
   */
  rail?: boolean;
}
function PoweredByFlux({
  isClickeable = false,
  inline = false,
  rail = false,
}: Props) {
  const navigate = useNavigate();
  const clickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);
  const { isDark } = useThemeMode();
  const themeStyle = isDark ? 'light' : 'dark'; // powered_by asset variant (light art on dark bg)
  const colorBox = isDark ? '#3d3a38' : '#d6d3d1'; // border-secondary tokens

  const open = (url: string) => {
    window.open(url, '_blank');
  };

  const handleVersionClick = () => {
    const now = Date.now();

    // Reset counter if more than 1 second has passed since last click
    if (now - lastClickTimeRef.current > 1000) {
      clickCountRef.current = 0;
    }

    clickCountRef.current++;
    lastClickTimeRef.current = now;

    // If clicked 5 times within a second, navigate to security test
    if (clickCountRef.current >= 5) {
      navigate('/security-test');
      clickCountRef.current = 0; // Reset counter
    }
  };
  if (rail) {
    return (
      <div className="powered-by-flux-rail">
        <Image
          height={14}
          preview={false}
          src={`/powered_by_${themeStyle}.svg`}
          onClick={
            isClickeable ? () => open('https://runonflux.com') : undefined
          }
          style={isClickeable ? { cursor: 'pointer' } : undefined}
        />
        <div
          className="powered-by-flux-rail-version"
          onClick={isClickeable ? handleVersionClick : undefined}
        >
          v{version}
        </div>
      </div>
    );
  }

  return (
    <div
      style={
        inline
          ? {
              position: 'relative',
              marginTop: 16,
              textAlign: 'center',
              padding: 10,
              paddingBottom: 14,
            }
          : {
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
            }
      }
      className="powered-by-flux"
    >
      {isClickeable && (
        <>
          <Image
            height={18}
            preview={false}
            src={`/powered_by_${themeStyle}.svg`}
            onClick={() => open('https://runonflux.com')}
            style={{ cursor: 'pointer' }}
          />
          <div
            style={{ fontSize: 10, position: 'absolute', bottom: 10, left: 10 }}
            onClick={handleVersionClick}
          >
            v{version}
          </div>
        </>
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

export default PoweredByFlux;
