import { useNavigate } from 'react-router';
import { ChevronLeft as ChevronLeftIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { blockchains } from '@storage/blockchains';
import AutoLogout from '../AutoLogout/AutoLogout';
import './PageHeader.css';

interface Props {
  title: string;
  /**
   * Show the active chain as a STATIC context pill. The send flow is
   * chain-bound mid-flow — switching chains mid-send must not be casually
   * available, so this is deliberately context, never a switcher.
   */
  chainPill?: boolean;
  /** Optional right-side slot (e.g. the swap-history trigger on /swap). */
  right?: React.ReactNode;
  /** Back target — defaults to /home (deterministic, never a dead history). */
  onBack?: () => void;
}

/**
 * PageHeader — slim v2 chrome for the standalone flow pages (/send, /swap)
 * that live outside WalletShell. Replaces the legacy Navbar there: back
 * chevron + page title + optional chain context pill + optional right slot,
 * styled to the shell language (IdentityBar visual weight, 12-radius-family
 * controls, both themes).
 *
 * Re-homed from the deleted Navbar: <AutoLogout/> (the flow pages are outside
 * the shell, so the header owns the idle auto-lock there). Everything else
 * the Navbar offered on these pages (wallet switching, burger utilities,
 * manual lock) is reachable via the shell after backing out — deliberately
 * not duplicated mid-flow.
 */
function PageHeader({ title, chainPill = false, right, onBack }: Props) {
  const { t } = useTranslation(['common']);
  const navigate = useNavigate();
  const { activeChain } = useAppSelector((state) => state.sspState);
  const blockchainConfig = blockchains[activeChain];

  return (
    <>
      <header className="page-header">
        <button
          type="button"
          className="page-header-back"
          onClick={onBack ?? (() => navigate('/home'))}
          aria-label={t('common:back')}
          title={t('common:back')}
        >
          <ChevronLeftIcon />
        </button>
        <div className="page-header-middle">
          <h1 className="page-header-title">{title}</h1>
          {chainPill && blockchainConfig && (
            <span className="page-header-chain">
              <img
                className="page-header-chain-logo"
                src={blockchainConfig.logo}
                alt=""
              />
              <span className="page-header-chain-label">
                {blockchainConfig.name}
              </span>
            </span>
          )}
        </div>
        <div className="page-header-right">{right}</div>
      </header>
      <AutoLogout />
    </>
  );
}

export default PageHeader;
