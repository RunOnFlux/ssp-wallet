import { useEffect, useState } from 'react';
import { Button, Skeleton, Tooltip, Typography } from 'antd';
import {
  History as HistoryIcon,
  ExternalLink as ExternalLinkIcon,
  RotateCw as RotateCwIcon,
} from 'lucide-react';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import { fetchAddressTransactions } from '../../lib/transactions';
import { explorerTxUrl } from '../../lib/explorerUrl';
import { formatCrypto, formatFiatWithSymbol } from '../../lib/currency';
import {
  formatRelativeTime,
  formatFullTimestamp,
} from '../../lib/relativeTime';
import { truncateAddress } from '../../lib/addressDisplay';
import {
  discoverActivityChains,
  loadCachedChainTransactions,
  mergeChainTransactions,
  filterFeedByChain,
  type ActivityFeedItem,
  type SyncedChainWallet,
} from '../../lib/activityFeed';
import Identicon from '../../components/Identicon/Identicon';
import WalletName from '../../components/WalletName/WalletName';
import ActivityRow from '../../components/ActivityRow/ActivityRow';
import EmptyState from '../../components/EmptyState/EmptyState';
import type { cryptos } from '../../types';
import './Activity.css';

const { Text } = Typography;

/**
 * Activity tab — a merged, time-sorted feed across ALL synced chains of the
 * active wallet (each chain contributes its own active wallet's cached
 * transaction history). Cached-first like the Portfolio tab: mount reads
 * only localForage; the refresh button fetches live per chain. Home's
 * per-chain Activity sub-tab (the classic Transactions component) is
 * unchanged.
 */
function Activity() {
  const { t, i18n } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const [sources, setSources] = useState<SyncedChainWallet[]>([]);
  const [feed, setFeed] = useState<ActivityFeedItem[]>([]);
  const [chainFilter, setChainFilter] = useState<'all' | keyof cryptos>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const loadCached = async (): Promise<SyncedChainWallet[]> => {
    const discovered = await discoverActivityChains();
    const perChain = await Promise.all(
      discovered.map(async (source) => ({
        chain: source.chain,
        transactions: await loadCachedChainTransactions(
          source.chain,
          source.walletInUse,
        ),
      })),
    );
    setSources(discovered);
    setFeed(mergeChainTransactions(perChain));
    setLoading(false);
    return discovered;
  };

  useEffect(() => {
    setLoading(true);
    void loadCached();
    // Re-discover when the active wallet/chain changes (a fresh sync or a
    // wallet switch changes which caches are relevant).
  }, [activeChain, walletInUse]);

  // Manual live refresh — fetches each synced chain's recent transactions
  // and rewrites the same caches the Home flow maintains. Never runs on
  // mount (cached-first; no API hammering).
  const refreshLive = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const discovered =
        sources.length > 0 ? sources : await discoverActivityChains();
      await Promise.all(
        discovered.map(async (source) => {
          if (!source.address) return;
          try {
            const txs = await fetchAddressTransactions(
              source.address,
              source.chain,
              0,
              10,
              1,
            );
            await localForage.setItem(
              `transactions-${source.chain}-${source.walletInUse}`,
              txs,
            );
          } catch (error) {
            // Keep the cached list for chains whose API is unreachable.
            console.log(`[activity] refresh failed ${source.chain}`, error);
          }
        }),
      );
      await loadCached();
    } finally {
      setRefreshing(false);
    }
  };

  const fiatRateFor = (item: ActivityFeedItem): number => {
    const fiat = fiatRates[sspConfig().fiatCurrency] ?? 0;
    if (item.tokenSymbol) {
      return (
        (cryptoRates[item.tokenSymbol.toLowerCase() as keyof cryptos] ?? 0) *
        fiat
      );
    }
    return (cryptoRates[item.chain] ?? 0) * fiat;
  };

  const visible = filterFeedByChain(feed, chainFilter);
  const isSynced = !!wallets?.[walletInUse]?.address;

  const chainChip = (
    key: 'all' | keyof cryptos,
    label: React.ReactNode,
    logo?: string,
  ) => (
    <button
      key={key}
      type="button"
      className={`activity-chip${chainFilter === key ? ' activity-chip-active' : ''}`}
      onClick={() => setChainFilter(key)}
      aria-pressed={chainFilter === key}
    >
      {logo && <img className="activity-chip-logo" src={logo} alt="" />}
      {label}
    </button>
  );

  const renderRow = (item: ActivityFeedItem) => {
    const cfg = blockchains[item.chain];
    const rowKey = `${item.chain}-${item.txid}`;
    const decimals = item.decimals ?? cfg.decimals;
    const amount = new BigNumber(item.amount).dividedBy(10 ** decimals);
    const received = amount.isGreaterThan(0);
    const expanded = expandedKey === rowKey;
    return (
      <ActivityRow
        key={rowKey}
        direction={received ? 'in' : 'out'}
        label={
          received
            ? t('home:activityFeed.received')
            : t('home:activityFeed.sent')
        }
        sub={
          <>
            <img className="arow-sub-logo" src={cfg.logo} alt="" />
            {cfg.name}
            {' · '}
            <span title={formatFullTimestamp(item.timestamp, i18n.language)}>
              {formatRelativeTime(item.timestamp, i18n.language)}
            </span>
          </>
        }
        amount={`${received ? '+' : ''}${formatCrypto(amount)} ${
          item.tokenSymbol || cfg.symbol
        }`}
        fiat={`${received ? '' : '-'}${formatFiatWithSymbol(
          amount.abs().multipliedBy(fiatRateFor(item)),
        )}`}
        status={
          item.blockheight && item.blockheight > 0 ? 'confirmed' : 'unconfirmed'
        }
        expanded={expanded}
        onActivate={() => setExpandedKey(expanded ? null : rowKey)}
        details={
          <>
            <div className="feed-detail-line">
              <span className="feed-detail-label">
                {t('home:transactionsTable.txid')}
              </span>
              <Text copyable={{ text: item.txid }} className="feed-detail-mono">
                {truncateAddress(item.txid, 10)}
              </Text>
            </div>
            <div>
              {t('home:transactionsTable.fee_with_symbol', {
                fee: formatCrypto(
                  new BigNumber(item.fee || '0').dividedBy(10 ** cfg.decimals),
                ),
                symbol: cfg.symbol,
              })}
            </div>
            {item.message && (
              <div>
                {t('home:transactionsTable.note_with_note', {
                  note: item.message,
                })}
              </div>
            )}
            <div className="feed-detail-actions">
              <Button
                size="small"
                icon={<ExternalLinkIcon size={13} />}
                href={explorerTxUrl(item.chain, item.txid)}
                target="_blank"
                rel="noreferrer"
              >
                {t('home:txSent.show_in_explorer')}
              </Button>
            </div>
          </>
        }
      />
    );
  };

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
            {t('home:activityFeed.chains_scope', {
              count: sources.length,
            })}
          </span>
        </div>
        <Tooltip title={t('home:navbar.refresh')}>
          <Button
            className="activity-refresh"
            size="small"
            type="text"
            icon={<RotateCwIcon className={refreshing ? 'lucide-spin' : ''} />}
            onClick={() => void refreshLive()}
            disabled={refreshing}
            aria-label={t('home:navbar.refresh')}
          />
        </Tooltip>
      </div>
      {sources.length > 1 && (
        <div className="activity-chips" role="group">
          {chainChip('all', t('home:activityFeed.all'))}
          {sources.map((source) =>
            chainChip(
              source.chain,
              blockchains[source.chain].symbol,
              blockchains[source.chain].logo,
            ),
          )}
        </div>
      )}
      {loading || !isSynced ? (
        <Skeleton active paragraph={{ rows: 6 }} title={false} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          description={t('home:transactionsTable.no_tx_history')}
        />
      ) : (
        <div className="feed-list">{visible.map(renderRow)}</div>
      )}
    </div>
  );
}

export default Activity;
