import { Skeleton } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { blockchains } from '@storage/blockchains';
import Transactions from '../../components/Transactions/Transactions';
import Identicon from '../../components/Identicon/Identicon';
import WalletName from '../../components/WalletName/WalletName';
import './Activity.css';

/**
 * Activity tab — the current wallet's transaction history as a first-class
 * place. Reuses the existing <Transactions> component (same fetch, pending +
 * confirmed tables); adds a wallet/chain context header so it's clear whose
 * activity this is (the same list also appears inside Home's sub-tabs).
 */
function Activity() {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  const isSynced = !!wallets?.[walletInUse]?.address;

  return (
    <div className="activity-tab">
      <div className="activity-header">
        <Identicon
          value={wallets?.[walletInUse]?.address || walletInUse}
          size={26}
        />
        <div className="activity-header-meta">
          <span className="activity-header-title">{t('common:activity')}</span>
          <span className="activity-header-sub">
            <WalletName
              walletId={walletInUse}
              chain={activeChain}
              editable={false}
            />
            {' · '}
            {blockchainConfig.name}
          </span>
        </div>
      </div>
      {isSynced ? (
        <Transactions />
      ) : (
        <Skeleton active paragraph={{ rows: 6 }} title={false} />
      )}
    </div>
  );
}

export default Activity;
