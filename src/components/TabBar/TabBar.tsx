import { useNavigate } from 'react-router';
import {
  ChartPie as ChartPieIcon,
  History as HistoryIcon,
  House as HouseIcon,
  Menu as MenuIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WalletTab } from '../../storage/navPrefs';
import { tabToPath } from '../../storage/navPrefs';
import PoweredByFlux from '../PoweredByFlux/PoweredByFlux';
import './TabBar.css';

interface Props {
  activeTab: WalletTab;
}

/**
 * Bottom tab bar = "places" (Home · Portfolio · Activity · Menu). The
 * Send/Receive/Swap/Buy verbs are NOT tabs — they act on the current wallet and
 * live in Home's action row. Popup mode is a compact 44px icons-only bar
 * (labels move to title tooltips + aria-labels); in side-panel mode this
 * reflows into a left rail with visible labels (see TabBar.css) as a
 * first-class two-column layout.
 */
function TabBar({ activeTab }: Props) {
  const { t } = useTranslation(['home', 'common']);
  const navigate = useNavigate();

  const tabs: { key: WalletTab; label: string; icon: React.ReactNode }[] = [
    { key: 'home', label: t('home:tabs.home', 'Home'), icon: <HouseIcon /> },
    {
      key: 'portfolio',
      label: t('home:tabs.portfolio', 'Portfolio'),
      icon: <ChartPieIcon />,
    },
    {
      key: 'activity',
      label: t('common:activity'),
      icon: <HistoryIcon />,
    },
    {
      key: 'settings',
      label: t('home:tabs.menu', 'Menu'),
      icon: <MenuIcon />,
    },
  ];

  return (
    <nav className="tab-bar" aria-label={t('home:tabs.nav', 'Wallet sections')}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`tab-bar-item${activeTab === tab.key ? ' tab-bar-item-active' : ''}`}
          aria-current={activeTab === tab.key ? 'page' : undefined}
          aria-label={tab.label}
          title={tab.label}
          onClick={() => navigate(tabToPath(tab.key))}
          data-tutorial={`tab-${tab.key}`}
        >
          <span className="tab-bar-icon">{tab.icon}</span>
          <span className="tab-bar-label">{tab.label}</span>
        </button>
      ))}
      {/* Side-panel rail footer — version + Powered by Flux pinned at the rail
          bottom (margin-top:auto). display:none in the popup's bottom bar and
          the <500px popup-layout fallback (TabBar.css); the popup will get an
          About home for these in the Menu later. */}
      <div className="tab-bar-footer">
        <PoweredByFlux rail isClickeable />
      </div>
    </nav>
  );
}

export default TabBar;
