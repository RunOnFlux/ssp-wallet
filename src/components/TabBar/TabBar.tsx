import { useNavigate } from 'react-router';
import {
  HomeOutlined,
  PieChartOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { WalletTab } from '../../storage/navPrefs';
import { tabToPath } from '../../storage/navPrefs';
import './TabBar.css';

interface Props {
  activeTab: WalletTab;
}

/**
 * Bottom tab bar = "places" (Home · Portfolio · Activity · Settings). The
 * Send/Receive/Swap/Buy verbs are NOT tabs — they act on the current wallet and
 * live in Home's action row. In side-panel mode this reflows into a left rail
 * (see TabBar.css) as a first-class two-column layout.
 */
function TabBar({ activeTab }: Props) {
  const { t } = useTranslation(['home', 'common']);
  const navigate = useNavigate();

  const tabs: { key: WalletTab; label: string; icon: React.ReactNode }[] = [
    { key: 'home', label: t('home:tabs.home', 'Home'), icon: <HomeOutlined /> },
    {
      key: 'portfolio',
      label: t('home:tabs.portfolio', 'Portfolio'),
      icon: <PieChartOutlined />,
    },
    {
      key: 'activity',
      label: t('common:activity'),
      icon: <HistoryOutlined />,
    },
    {
      key: 'settings',
      label: t('home:settings.settings'),
      icon: <SettingOutlined />,
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
          onClick={() => navigate(tabToPath(tab.key))}
          data-tutorial={`tab-${tab.key}`}
        >
          <span className="tab-bar-icon">{tab.icon}</span>
          <span className="tab-bar-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default TabBar;
