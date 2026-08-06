import type { ReactNode } from 'react';
import { Button, Typography } from 'antd';
import BigNumber from 'bignumber.js';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { explorerTxUrl } from '../../lib/explorerUrl';
import { formatCrypto, formatFiatWithSymbol } from '../../lib/currency';
import { formatFullTimestamp } from '../../lib/relativeTime';
import type { cryptos, transaction } from '../../types';

const { Text } = Typography;

/**
 * Shared expanded-row detail panel for the activity feeds (Home per-chain
 * Activity sub-tab + the all-chains Activity page). Renders every detail the
 * cached transaction record already carries — full date+time, txid, receiver,
 * fee (+fiat), confirmations/block height, token contract, note — without any
 * new network calls. Fields missing from the record are simply omitted.
 */
interface TxDetailsProps {
  tx: transaction;
  chain: keyof cryptos;
  /** Current chain tip height — enables a live confirmations count. */
  tipHeight?: number;
  /** Fiat rate for ONE whole unit of the chain's base coin (fee → fiat). */
  chainFiatRate?: number;
  /** Extra action buttons rendered after the explorer link (e.g. RBF). */
  extraActions?: ReactNode;
}

function TxDetails({
  tx,
  chain,
  tipHeight,
  chainFiatRate,
  extraActions,
}: TxDetailsProps) {
  const { t, i18n } = useTranslation(['home']);
  const chainConfig = blockchains[chain];
  const timestamp = new Date(tx.timestamp).getTime();
  const confirmed = !!tx.blockheight && tx.blockheight > 0;
  const confirmations =
    confirmed && typeof tipHeight === 'number' && tipHeight >= tx.blockheight
      ? tipHeight - tx.blockheight + 1
      : null;

  const isUtxo = tx.type !== 'evm' && tx.type !== 'sol';
  const feeAmount = new BigNumber(tx.fee || '0').dividedBy(
    10 ** chainConfig.decimals,
  );
  const weight = tx.vsize ?? tx.size;
  const feeRateSuffix =
    isUtxo && weight && +tx.fee > 0
      ? ` (${(+tx.fee / weight).toFixed(2)} ${tx.vsize ? 'sat/vB' : 'sat/B'})`
      : '';
  const feeFiatSuffix =
    chainFiatRate && feeAmount.isGreaterThan(0)
      ? ` · ${formatFiatWithSymbol(feeAmount.multipliedBy(chainFiatRate))}`
      : '';

  return (
    <>
      <div className="feed-detail-line">
        <span className="feed-detail-label">
          {t('home:transactionsTable.date')}
        </span>
        <span>{formatFullTimestamp(timestamp, i18n.language)}</span>
      </div>
      <div className="feed-detail-line">
        <span className="feed-detail-label">
          {t('home:transactionsTable.txid')}
        </span>
        <Text copyable={{ text: tx.txid }} className="feed-detail-mono">
          {tx.txid}
        </Text>
      </div>
      {!!tx.receiver && (
        <div className="feed-detail-line">
          <span className="feed-detail-label">
            {t('home:transactionsTable.to_address')}
          </span>
          <Text copyable={{ text: tx.receiver }} className="feed-detail-mono">
            {tx.receiver}
          </Text>
        </div>
      )}
      {!!tx.fee && (
        <div className="feed-detail-line">
          <span className="feed-detail-label">
            {t('home:transactionsTable.fee')}
          </span>
          <span>
            {formatCrypto(feeAmount)} {chainConfig.symbol}
            {feeRateSuffix}
            {feeFiatSuffix}
          </span>
        </div>
      )}
      {confirmations !== null ? (
        <div className="feed-detail-line">
          <span className="feed-detail-label">
            {t('home:transactionsTable.confirmations')}
          </span>
          <span>{confirmations.toLocaleString()}</span>
        </div>
      ) : (
        confirmed && (
          <div className="feed-detail-line">
            <span className="feed-detail-label">
              {t('home:transactionsTable.block_height')}
            </span>
            <span>{tx.blockheight.toLocaleString()}</span>
          </div>
        )
      )}
      {!!tx.contractAddress && (
        <div className="feed-detail-line">
          <span className="feed-detail-label">
            {t('home:transactionsTable.token_contract')}
          </span>
          <Text
            copyable={{ text: tx.contractAddress }}
            className="feed-detail-mono"
          >
            {tx.contractAddress}
          </Text>
        </div>
      )}
      {!!tx.message && (
        <div className="feed-detail-line">
          <span className="feed-detail-label">
            {t('home:transactionsTable.note')}
          </span>
          <span>{tx.message}</span>
        </div>
      )}
      <div className="feed-detail-actions">
        <Button
          size="small"
          icon={<ExternalLinkIcon size={13} />}
          href={explorerTxUrl(chain, tx.txid)}
          target="_blank"
          rel="noreferrer"
        >
          {t('home:txSent.show_in_explorer')}
        </Button>
        {extraActions}
      </div>
    </>
  );
}

export default TxDetails;
