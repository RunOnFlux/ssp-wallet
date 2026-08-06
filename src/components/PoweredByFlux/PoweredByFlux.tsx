import { Image } from 'antd';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useThemeMode } from '../../contexts/ThemeContext';
import { version } from '../../../package.json';
import './PoweredByFlux.css';

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
   * (version caption above the logo, 10px scale). Keeps the same click
   * behaviors: logo → runonflux.com, 5× version click → /security-test.
   * Styled by the host (TabBar.css) via the class hooks.
   */
  rail?: boolean;
  /**
   * Single-row variant for the Menu → About block: version left, Powered by
   * Flux right, one consistent 11px line. Same click behaviors as the rail.
   * Styled by the host (Settings.css) via the class hooks.
   */
  about?: boolean;
}
function PoweredByFlux({
  isClickeable = false,
  inline = false,
  rail = false,
  about = false,
}: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation(['common']);
  const clickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);
  const { isDark } = useThemeMode();
  const themeStyle = isDark ? 'light' : 'dark'; // powered_by asset variant (light art on dark bg)
  const colorBox = isDark ? '#3d3a38' : '#d6d3d1'; // border-secondary tokens

  const open = (url: string) => {
    // noopener/noreferrer: the opened page must not get a window.opener handle
    // back to the extension document — that is a reverse-tabnabbing lever, and
    // the side panel does not close on blur the way the popup does.
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  /**
   * The Flux logo as a real button when it is clickable.
   *
   * It used to be an antd <Image onClick>, which renders a bare <img>: no role,
   * no tab stop, no keyboard activation and no accessible name, so the only
   * external link in the footer was reachable by mouse alone. All three
   * variants (rail / about / default) render through this.
   */
  const FluxLogo = ({ height }: { height: number }) => {
    const img = (
      <Image
        height={height}
        preview={false}
        src={`/powered_by_${themeStyle}.svg`}
      />
    );
    if (!isClickeable) {
      return img;
    }
    return (
      <button
        type="button"
        className="powered-by-flux-link"
        onClick={() => open('https://runonflux.com')}
        aria-label={t('common:powered_by_flux_link')}
        title={t('common:powered_by_flux_link')}
      >
        {img}
      </button>
    );
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
        <div
          className="powered-by-flux-rail-version"
          onClick={isClickeable ? handleVersionClick : undefined}
        >
          v{version}
        </div>
        <FluxLogo height={14} />
      </div>
    );
  }

  if (about) {
    return (
      <div className="powered-by-flux-about">
        <div
          className="powered-by-flux-about-version"
          onClick={isClickeable ? handleVersionClick : undefined}
        >
          v{version}
        </div>
        <FluxLogo height={14} />
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
          <FluxLogo height={18} />
          <div
            style={{ fontSize: 10, position: 'absolute', bottom: 10, left: 10 }}
            onClick={handleVersionClick}
          >
            v{version}
          </div>
        </>
      )}
      {!isClickeable && <FluxLogo height={18} />}
    </div>
  );
}

export default PoweredByFlux;
