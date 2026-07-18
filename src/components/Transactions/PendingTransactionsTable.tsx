import { Tooltip } from 'antd';
import { useEffect, useState } from 'react';
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
  const [fiatRate, setFiatRate] = useState(0);
  const [pendingTxs, setPendingTxs] = useState<pendingTransaction[]>([]);
  const [txHex, setTxHex] = useState('');
  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { walletInUse } = useAppSelector((state) => state[activeChain]);
  const blockchainConfig = blockchains[activeChain];
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  useEffect(() => {
    setPendingTxs(props.transactions);
    setFiatRate(props.fiatRate);
  });

  const confirmTxAction = (status: boolean) => {
    setOpenConfirmTx(status);
  };

  const onFinishCountDown = () => {
    setPendingTxs([]);
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
      : fiatRate;
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
              <span className="arow-countdown">
                <CountdownTimer
                  onFinish={() => onFinishCountDown()}
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
