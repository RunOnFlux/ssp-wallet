import { useState } from 'react';
import { Globe as GlobeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './DappRequest.css';

/**
 * Shared origin header for dapp-facing approval surfaces (WalletConnect
 * modals + SspConnect prompts): favicon (globe fallback), app name and
 * host — the user always sees WHO is asking before WHAT is asked.
 * Presentation only; callers pass whatever metadata the request carries.
 */
function DappOrigin(props: { name?: string; url?: string; icon?: string }) {
  const { t } = useTranslation(['home']);
  const [iconFailed, setIconFailed] = useState(false);
  const host = (() => {
    if (!props.url) return '';
    try {
      return new URL(props.url).host;
    } catch {
      return props.url;
    }
  })();
  const title = props.name || host || t('home:walletconnect.unknown_dapp');
  return (
    <div className="dapp-origin">
      <span className="dapp-origin-icon" aria-hidden="true">
        {props.icon && !iconFailed ? (
          <img src={props.icon} alt="" onError={() => setIconFailed(true)} />
        ) : (
          <GlobeIcon size={18} />
        )}
      </span>
      <span className="dapp-origin-text">
        <span className="dapp-origin-name">{title}</span>
        {host && host !== title && (
          <span className="dapp-origin-host">{host}</span>
        )}
      </span>
    </div>
  );
}

export default DappOrigin;
