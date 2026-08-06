import { Card, Badge, Avatar, Button, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { MouseEvent, useState } from 'react';
import { blockchains } from '@storage/blockchains';
import './SwapBox.css';
import { exchangeProvider, swapHistoryOrder } from '../../types';
import {
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  MoveRight as MoveRightIcon,
} from 'lucide-react';
import { useAppSelector } from '../../hooks';

/**
 * Compact swap-history row: header line (date left, status chip right), a
 * tight sell → buy line with the amounts under the asset symbols in 11px
 * tabular-nums, and a right-aligned expand chevron. Expanded details render
 * in the shared `.feed-details` inset card.
 */
function SwapBox(props: {
  swap: swapHistoryOrder;
  reverseAbeMapping: Record<string, string>;
}) {
  const { swap, reverseAbeMapping } = props;
  const { t } = useTranslation(['home', 'common']);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const sellAsset = reverseAbeMapping[swap.sellAsset];
  const buyAsset = reverseAbeMapping[swap.buyAsset];
  const { exchangeProviders } = useAppSelector((state) => state.abe);
  const provider: exchangeProvider = exchangeProviders.find(
    (provider) => provider.exchangeId === swap.exchangeId,
  ) ?? {
    name:
      swap.exchangeId
        .slice(
          2,
          swap.exchangeId.slice(-5) === 'float'
            ? swap.exchangeId.length - 5
            : swap.exchangeId.length - 3,
        )
        .charAt(0)
        .toUpperCase() +
      swap.exchangeId
        .slice(
          2,
          swap.exchangeId.slice(-5) === 'float'
            ? swap.exchangeId.length - 5
            : swap.exchangeId.length - 3,
        )
        .slice(1),
    exchangeId: swap.exchangeId,
    type: swap.exchangeId.slice(-5) === 'float' ? 'float' : 'fixed',
    website: '',
    endpoint: '',
    terms: '',
    privacy: '',
    kyc: '',
    track: '',
    logo: '',
  };

  // "chain_SYMBOL" asset id → chain logo / token logo / display symbol
  const assetToken = (asset?: string) =>
    asset
      ? blockchains[asset.split('_')[0]]?.tokens?.find(
          (token) => token.symbol === asset.split('_')[1],
        )
      : undefined;
  const assetChainLogo = (asset?: string) =>
    asset ? blockchains[asset.split('_')[0]]?.logo : undefined;
  const assetLogo = (asset?: string) =>
    asset ? (assetToken(asset)?.logo ?? assetChainLogo(asset)) : undefined;
  const assetSymbol = (asset?: string) =>
    asset
      ? (assetToken(asset)?.symbol ?? blockchains[asset.split('_')[0]]?.symbol)
      : null;

  const openDetails = (
    event: MouseEvent<HTMLDivElement, globalThis.MouseEvent>,
  ) => {
    const containingElement = document.querySelector('#swap-id' + swap.swapId);
    if (containingElement) {
      if (containingElement.contains(event.target as Node)) {
        // do not register clicks here
        return;
      }
    }
    setInfoExpanded(!infoExpanded);
  };

  const transformStatusToString = (status: string) => {
    if (status === 'pending') return t('home:swap.pending');
    if (status === 'completed') return t('home:swap.completed');
    if (status === 'failed') return t('home:swap.failed');
    if (status === 'refunded') return t('home:swap.refunded');
    if (status === 'hold') return t('home:swap.hold');
    if (status === 'expired') return t('home:swap.expired');
    if (status === 'unknown') return t('home:swap.unknown');
    if (status === 'new') return t('home:swap.new');
    if (status === 'waiting') return t('home:swap.waiting');
    if (status === 'confirming') return t('home:swap.confirming');
    if (status === 'sending') return t('home:swap.sending');
    if (status === 'finished') return t('home:swap.finished');
    return status;
  };

  const transformStatusToColor = (status: string) => {
    if (status === 'pending') return 'blue';
    if (status === 'completed') return 'green';
    if (status === 'failed') return 'red';
    if (status === 'refunded') return 'green';
    if (status === 'hold') return 'red';
    if (status === 'expired') return 'red';
    if (status === 'unknown') return 'blue';
    if (status === 'new') return 'blue';
    if (status === 'waiting') return 'blue';
    if (status === 'confirming') return 'blue';
    if (status === 'sending') return 'blue';
    if (status === 'finished') return 'green';
    return 'blue';
  };

  const assetSide = (
    asset: string | undefined,
    amount: string,
    buy = false,
  ) => (
    <div className={`swap-box-side${buy ? ' swap-box-side-buy' : ''}`}>
      <Badge
        count={<Avatar src={assetChainLogo(asset)} size={14} />}
        size="small"
        offset={[-2, 4]}
      >
        <Avatar src={assetLogo(asset)} size={24} />
      </Badge>
      <div className="swap-box-asset">
        <span className="swap-box-symbol">{assetSymbol(asset)}</span>
        <span className="swap-box-amount">{Number(amount)}</span>
      </div>
    </div>
  );

  return (
    <Card
      hoverable
      className="swap-box-card-container"
      size="small"
      onClick={(e) => openDetails(e)}
    >
      <div className="swap-box-header">
        <span className="swap-box-date">
          {new Date(swap.createdAt).toLocaleDateString()}
        </span>
        <Tag
          color={transformStatusToColor(swap.status)}
          style={{ marginInlineEnd: 0 }}
        >
          {transformStatusToString(swap.status)}
        </Tag>
      </div>
      <div className="swap-box-main">
        {assetSide(sellAsset, swap.sellAmount)}
        <MoveRightIcon className="swap-box-arrow" />
        {assetSide(buyAsset, swap.buyAmount, true)}
        {infoExpanded ? (
          <ChevronUpIcon className="swap-box-chevron" />
        ) : (
          <ChevronDownIcon className="swap-box-chevron" />
        )}
      </div>
      {infoExpanded && (
        <div
          className="feed-details swap-box-details"
          id={'swap-id' + swap.swapId}
        >
          <div className="feed-detail-line">
            <span className="feed-detail-label">
              {t('home:swap.created_at')}:
            </span>
            <span>
              {new Date(swap.createdAt).toLocaleDateString()},{' '}
              {new Date(swap.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="feed-detail-line">
            <span className="feed-detail-label">{t('home:swap.rate')}:</span>
            <span>
              1 {assetSymbol(sellAsset)} = {swap.rate} {assetSymbol(buyAsset)}
            </span>
          </div>
          <div className="feed-detail-line">
            <span className="feed-detail-label">{t('home:swap.swap_id')}:</span>
            <span className="feed-detail-mono">{swap.swapId}</span>
          </div>
          <div className="feed-detail-line">
            <span className="feed-detail-label">
              {t('home:swap.provider')}:
            </span>
            <span>
              {provider.name}{' '}
              {provider.type.charAt(0).toUpperCase() + provider.type.slice(1)}
            </span>
          </div>
          <div className="feed-detail-line">
            <span className="feed-detail-label">
              {t('home:swap.sell_address')}:
            </span>
            <span className="feed-detail-mono">
              {swap.refundAddress || 'N/A'}
            </span>
          </div>
          <div className="feed-detail-line">
            <span className="feed-detail-label">
              {t('home:swap.buy_address')}:
            </span>
            <span className="feed-detail-mono">{swap.buyAddress || 'N/A'}</span>
          </div>
          <div className="feed-detail-line">
            <span className="feed-detail-label">
              {t('home:swap.sell_txid')}:
            </span>
            <span className="feed-detail-mono">{swap.sellTxid || 'N/A'}</span>
          </div>
          <div className="feed-detail-line">
            <span className="feed-detail-label">
              {t('home:swap.buy_txid')}:
            </span>
            <span className="feed-detail-mono">{swap.buyTxid || 'N/A'}</span>
          </div>
          {swap.refundTxid && (
            <div className="feed-detail-line">
              <span className="feed-detail-label">
                {t('home:swap.refund_txid')}:
              </span>
              <span className="feed-detail-mono">{swap.refundTxid}</span>
            </div>
          )}
          {provider.track && (
            <div className="feed-detail-actions">
              <Button
                type="default"
                size="small"
                onClick={() => {
                  window.open(`${provider.track}${swap.swapId}`, '_blank');
                }}
              >
                {t('home:swap.track_swap')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default SwapBox;
