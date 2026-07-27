import { Tooltip } from 'antd';
import { useState } from 'react';
import BigNumber from 'bignumber.js';
import './Transactions.css';
import { useTranslation } from 'react-i18next';
import { sspConfig } from '@storage/ssp';
import CountdownTimer from './CountDownTimer.tsx';
import ConfirmTxKey from '../ConfirmTxKey/ConfirmTxKey.tsx';
import { pendingTransaction } from '../../types';
import { blockchains } from '@storage/blockchains';
import { useAppSelector } from '../../hooks';
import { formatFiatWithSymbol, formatCrypto } from '../../lib/currency';
import {
  formatRelativeTime,
  formatFullTimestamp,
} from '../../lib/relativeTime';
import ActivityRow from '../ActivityRow/ActivityRow';

function PendingTransactionsTable(props: {
  transactions: pendingTransaction[];
  fiatRate: number;
  refresh: () => void;
}) {
  const { t, i18n } = useTranslation(['home', 'common']);
  // Approvals whose countdown ran out. The parent owns the pending list, so
  // expiry is tracked as a flag here (keyed by the immutable expireAt) instead
  // of mirroring props into local state — a local `setPendingTxs([])` reset was
  // undone on the very next commit and left a clickable row with a dead 00:00
  // timer that re-opened ConfirmTxKey with a freshly restarted countdown.
  const [expiredKeys, setExpiredKeys] = useState<string[]>([]);
  const [txHex, setTxHex] = useState('');
  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { walletInUse } = useAppSelector((state) => state[activeChain]);
  const blockchainConfig = blockchains[activeChain];
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const confirmTxAction = (status: boolean) => {
    setOpenConfirmTx(status);
  };

  const onFinishCountDown = (key: string) => {
    setExpiredKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
    setTimeout(() => {
      props.refresh(); // refresh on parent
    }, 500);
  };

  const getCryptoRate = (
    crypto: keyof typeof cryptoRates,
    fiat: keyof typeof fiatRates,
  ) => {
    const cr = cryptoRates[crypto] ?? 0;
    const fi = fiatRates[fiat] ?? 0;
    return cr * fi;
  };

  const renderPending = (record: pendingTransaction) => {
    const createdAt = new Date(record.createdAt).getTime();
    const rate = record.tokenSymbol
      ? getCryptoRate(
          record.tokenSymbol.toLowerCase() as keyof typeof cryptoRates,
          sspConfig().fiatCurrency,
        )
      : props.fiatRate;
    return (
      <ActivityRow
        key={record.expireAt}
        direction="out"
        pending
        label={t('home:activityFeed.sent')}
        sub={
          <>
            <span title={formatFullTimestamp(createdAt, i18n.language)}>
              {formatRelativeTime(createdAt, i18n.language)}
            </span>
            {' · '}
            {t('home:activityFeed.pending')}
          </>
        }
        amount={`-${formatCrypto(new BigNumber(record.amount))} ${
          record.tokenSymbol || blockchainConfig.symbol
        }`}
        fiat={`-${formatFiatWithSymbol(
          new BigNumber(Math.abs(+record.amount)).multipliedBy(
            new BigNumber(rate),
          ),
        )}`}
        status={record.expireAt ? undefined : 'unconfirmed'}
        statusNode={
          record.expireAt ? (
            <Tooltip title={t('home:transactionsTable.tx_pending')}>
              {/* The countdown is the only carrier of "awaiting SSP Key
                  approval" on this row, and it sits inside the row button so
                  it can never take focus — the tooltip alone would keep it out
                  of the accessible tree entirely. */}
              <span
                className="arow-countdown"
                role="timer"
                aria-label={t('home:transactionsTable.tx_pending')}
              >
                <CountdownTimer
                  onFinish={() => onFinishCountDown(record.expireAt)}
                  expireAtDateTime={record.expireAt}
                  createdAtDateTime={record.createdAt}
                />
              </span>
            </Tooltip>
          ) : undefined
        }
        onActivate={() => {
          setTxHex(record.payload);
          setOpenConfirmTx(true);
        }}
      />
    );
  };

  // An expired approval is gone the moment its timer hits zero — it must not
  // be re-openable while the parent's refresh (500 ms later) catches up.
  const pendingTxs = props.transactions.filter(
    (record) => !expiredKeys.includes(record.expireAt),
  );

  return (
    <>
      {pendingTxs.length ? (
        <div className="feed-list transactions-pending-list">
          {pendingTxs.map(renderPending)}
        </div>
      ) : null}

      <ConfirmTxKey
        open={openConfirmTx}
        openAction={confirmTxAction}
        txHex={txHex}
        chain={activeChain}
        wallet={walletInUse}
      />
    </>
  );
}

export default PendingTransactionsTable;
