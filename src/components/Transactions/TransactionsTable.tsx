import { Popconfirm, Button, Typography } from 'antd';
import { sspConfig } from '@storage/ssp';
import { toast } from '../../lib/toast';
import {
  CircleHelp as CircleHelpIcon,
  ExternalLink as ExternalLinkIcon,
  History as HistoryIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import BigNumber from 'bignumber.js';
import { NoticeType } from 'antd/es/message/interface';
import { transaction } from '../../types';
import './Transactions.css';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';
import { explorerTxUrl } from '../../lib/explorerUrl';
import { formatCrypto, formatFiatWithSymbol } from '../../lib/currency';
import {
  formatRelativeTime,
  formatFullTimestamp,
} from '../../lib/relativeTime';
import { truncateAddress } from '../../lib/addressDisplay';
import { mkConfig, generateCsv, download } from 'export-to-csv';
import { fetchDataForCSV } from '../../lib/transactions';
import { cryptos } from '../../types';
import { useAppSelector } from '../../hooks';
import ActivityRow from '../ActivityRow/ActivityRow';
import EmptyState from '../EmptyState/EmptyState';

const { Text } = Typography;

function TransactionsTable(props: {
  transactions: transaction[];
  blockheight: number;
  fiatRate: number;
  address: string;
  chain: keyof cryptos;
  refresh: () => void;
}) {
  const { t, i18n } = useTranslation(['home', 'common']);
  const navigate = useNavigate();
  const { chain } = props;
  const [fiatRate, setFiatRate] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const blockchainConfig = blockchains[chain];
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({
      type,
      content,
    });
  };

  useEffect(() => {
    setFiatRate(props.fiatRate);
  });

  const proceedToRBF = (record: transaction) => {
    const navigationObject = {
      receiver: record.receiver,
      amount: new BigNumber(record.amount)
        .dividedBy(10 ** blockchainConfig.decimals)
        .multipliedBy(-1)
        .toFixed(),
      message: record.message,
      utxos: record.utxos,
    };
    navigate('/send', { state: navigationObject });
  };

  const csvConfig = mkConfig({
    useKeysAsHeaders: true,
    filename: `${blockchainConfig.symbol}-${props.address}`,
  });

  const handleExport = async () => {
    try {
      displayMessage(
        'info',
        t('home:transactionsTable.transactions_being_exported'),
      );
      const csvData = await fetchDataForCSV(props.address, chain);
      // @ts-expect-error csvData is of type csvTransaction[]
      const csv = generateCsv(csvConfig)(csvData);
      download(csvConfig)(csv);
      displayMessage(
        'success',
        t('home:transactionsTable.transactions_exported'),
      );
    } catch (error) {
      console.error(error);
      displayMessage('error', t('home:transactionsTable.err_export'));
    }
  };

  const getCryptoRate = (
    crypto: keyof typeof cryptoRates,
    fiat: keyof typeof fiatRates,
  ) => {
    const cr = cryptoRates[crypto] ?? 0;
    const fi = fiatRates[fiat] ?? 0;
    return cr * fi;
  };

  const renderTx = (record: transaction) => {
    const decimals = record.decimals ?? blockchainConfig.decimals;
    const amount = new BigNumber(record.amount).dividedBy(10 ** decimals);
    const received = amount.isGreaterThan(0);
    const confirmed = !!record.blockheight && record.blockheight > 0;
    const expanded = expandedKey === record.txid;
    const timestamp = new Date(record.timestamp).getTime();
    const rbfPossible =
      !confirmed &&
      !!record.utxos?.length &&
      +record.amount <= 0 &&
      blockchainConfig.rbf;
    const rate = record.tokenSymbol
      ? getCryptoRate(
          record.tokenSymbol.toLowerCase() as keyof typeof cryptoRates,
          sspConfig().fiatCurrency,
        )
      : fiatRate;
    return (
      <ActivityRow
        key={record.txid}
        direction={received ? 'in' : 'out'}
        label={
          received
            ? t('home:activityFeed.received')
            : t('home:activityFeed.sent')
        }
        sub={
          <span title={formatFullTimestamp(timestamp, i18n.language)}>
            {formatRelativeTime(timestamp, i18n.language)}
          </span>
        }
        amount={`${received ? '+' : ''}${formatCrypto(amount)} ${
          record.tokenSymbol || blockchainConfig.symbol
        }`}
        fiat={`${received ? '' : '-'}${formatFiatWithSymbol(
          amount.abs().multipliedBy(new BigNumber(rate)),
        )}`}
        status={confirmed ? 'confirmed' : 'unconfirmed'}
        expanded={expanded}
        onActivate={() => setExpandedKey(expanded ? null : record.txid)}
        details={
          <>
            <div className="feed-detail-line">
              <span className="feed-detail-label">
                {t('home:transactionsTable.txid')}
              </span>
              <Text
                copyable={{ text: record.txid }}
                className="feed-detail-mono"
              >
                {truncateAddress(record.txid, 10)}
              </Text>
            </div>
            {record.type !== 'evm' && record.type !== 'sol' && (
              <div>
                {t('home:transactionsTable.fee_with_symbol', {
                  fee: formatCrypto(
                    new BigNumber(record.fee).dividedBy(
                      10 ** blockchainConfig.decimals,
                    ),
                  ),
                  symbol: blockchainConfig.symbol,
                })}{' '}
                ({(+record.fee / (record.vsize! ?? record.size!)).toFixed(2)}{' '}
                {record.vsize ? 'sat/vB' : 'sat/B'})
              </div>
            )}
            {(record.type === 'evm' || record.type === 'sol') && (
              <div>
                {t('home:transactionsTable.fee_with_symbol', {
                  fee: formatCrypto(
                    new BigNumber(record.fee).dividedBy(
                      10 ** blockchainConfig.decimals,
                    ),
                  ),
                  symbol: blockchainConfig.symbol,
                })}
              </div>
            )}
            {record.message && (
              <div>
                {t('home:transactionsTable.note_with_note', {
                  note: record.message,
                })}
              </div>
            )}
            <div className="feed-detail-actions">
              <Button
                size="small"
                icon={<ExternalLinkIcon size={13} />}
                href={explorerTxUrl(chain, record.txid)}
                target="_blank"
                rel="noreferrer"
              >
                {t('home:txSent.show_in_explorer')}
              </Button>
              {rbfPossible && (
                <Popconfirm
                  title={t('home:transactionsTable.replace_by_fee', {
                    chainName: blockchainConfig.name,
                  })}
                  description={
                    <>
                      {t('home:transactionsTable.replace_by_fee_desc')}
                      <br /> <br />
                      {t('home:transactionsTable.replace_by_fee_desc_b')}
                    </>
                  }
                  overlayStyle={{ maxWidth: 360, margin: 10 }}
                  okText={t('home:transactionsTable.replace_by_fee')}
                  cancelText={t('common:cancel')}
                  onConfirm={() => {
                    proceedToRBF(record);
                  }}
                  icon={<CircleHelpIcon style={{ color: '#22c55e' }} />}
                >
                  <Button size="small">
                    {t('home:transactionsTable.replace_by_fee')}
                  </Button>
                </Popconfirm>
              )}
            </div>
          </>
        }
      />
    );
  };

  return (
    <>
      {props.transactions.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          description={t('home:transactionsTable.no_tx_history')}
        />
      ) : (
        <>
          <div className="feed-list">{props.transactions.map(renderTx)}</div>
          <div className="transactions-actions">
            <Button type="primary" size="middle" onClick={handleExport}>
              {t('home:transactionsTable.export_tx')}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

export default TransactionsTable;
