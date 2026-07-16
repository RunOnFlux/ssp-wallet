import { Divider, Space, Tabs, Skeleton } from 'antd';
import { useAppSelector } from '../../hooks';
import './Home.css';
import Navigation from '../../components/Navigation/Navigation';
import Transactions from '../../components/Transactions/Transactions';
import Nodes from '../../components/Nodes/Nodes';
import Contacts from '../../components/Contacts/Contacts';
import Tokens from '../../components/TokensEVM/Tokens';
import Balances from '../../components/Balances/Balances';
import BackupHealthCard from '../../components/BackupHealthCard/BackupHealthCard';
import AddressContainer from '../../components/AddressContainer/AddressContainer.tsx';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';

/**
 * Home tab = the single-wallet operating view for the ACTIVE wallet: address +
 * balance hero, the Send/Receive/Swap/Buy action row, then the Tokens / Activity
 * / Contacts / Nodes tabs. The chrome (identity bar, tab bar, key sync, init
 * derivation) is owned by WalletShell — this is pure content.
 */
function Home() {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const isSynced = !!wallets?.[walletInUse]?.address;
  const chainType = blockchains[activeChain].chainType;

  if (!isSynced) {
    return (
      <div className="home-loading">
        <Skeleton.Input
          active
          size="large"
          style={{ width: 180, height: 34 }}
        />
        <div style={{ height: 8 }} />
        <Skeleton.Input
          active
          size="small"
          style={{ width: 120, height: 20 }}
        />
        <div style={{ height: 20 }} />
        <Skeleton.Button active size="large" style={{ width: '100%' }} />
        <div style={{ height: 24 }} />
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      </div>
    );
  }

  return (
    <div className="home-tab">
      <div data-tutorial="wallet-overview" className="home-hero">
        <AddressContainer />
        <Balances />
      </div>
      <BackupHealthCard />
      <Navigation />
      <Divider style={{ margin: '12px 0' }} />
      <Space direction="vertical" style={{ width: '100%' }}>
        {wallets?.[walletInUse]?.nodes && (
          <Tabs
            defaultActiveKey="activity"
            size="small"
            centered
            tabBarStyle={{ marginBottom: 0 }}
            items={[
              {
                label: t('common:activity'),
                key: 'activity',
                children: <Transactions />,
              },
              {
                label: t('home:contacts.contacts'),
                key: 'contacts',
                children: <Contacts />,
              },
              {
                label: t('common:nodes'),
                key: 'nodes',
                children: <Nodes />,
              },
            ]}
          />
        )}
        {(chainType === 'evm' || chainType === 'sol') && (
          <Tabs
            defaultActiveKey="tokens"
            size="small"
            centered
            tabBarStyle={{ marginBottom: 0 }}
            data-tutorial="tokens-section"
            items={[
              {
                label: t('common:tokens'),
                key: 'tokens',
                children: <Tokens />,
              },
              {
                label: t('common:activity'),
                key: 'activity',
                children: <Transactions />,
              },
              {
                label: t('home:contacts.contacts'),
                key: 'contacts',
                children: <Contacts />,
              },
            ]}
          />
        )}
        {wallets?.[walletInUse] &&
          !wallets[walletInUse].nodes &&
          chainType !== 'evm' &&
          chainType !== 'sol' && (
            <Tabs
              defaultActiveKey="activity"
              size="small"
              centered
              tabBarStyle={{ marginBottom: 0 }}
              items={[
                {
                  label: t('common:activity'),
                  key: 'activity',
                  children: <Transactions />,
                },
                {
                  label: t('home:contacts.contacts'),
                  key: 'contacts',
                  children: <Contacts />,
                },
              ]}
            />
          )}
      </Space>
      <PoweredByFlux inline isClickeable />
    </div>
  );
}

export default Home;
