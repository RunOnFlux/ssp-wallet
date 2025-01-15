import { Table, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import { ClockCircleOutlined } from '@ant-design/icons';
import './Transactions.css';
import { useTranslation } from 'react-i18next';
import { sspConfig } from '@storage/ssp';
import CountdownTimer from './CountDownTimer.tsx';
import { VerticalAlignTopOutlined } from '@ant-design/icons';
import ConfirmTxKey from '../ConfirmTxKey/ConfirmTxKey.tsx';
import { actionSSPRelay } from '../../types';
import { pendingTransaction } from '../../types';
import { blockchains } from '@storage/blockchains';
import { useAppSelector } from '../../hooks';
import { formatFiatWithSymbol, formatCrypto } from '../../lib/currency';

function PendingTransactionsTable(props: {
  transactions: pendingTransaction[];
  fiatRate: number;
  refresh: () => void;
}) {
  const { t } = useTranslation(['home', 'common']);
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

  return (
    <>
      {pendingTxs.length ? (
        <Table
          className="adjustedWidth"
          pagination={false}
          showHeader={false}
          rowKey="expireAt"
          bordered={false}
          loading={false}
          dataSource={pendingTxs}
          onRow={(record) => {
            return {
              onClick: () => {
                setTxHex(record.payload);
                setOpenConfirmTx(true);
              }, // click row
            };
          }}
        >
          <Column
            title={t('home:transactionsTable.direction')}
            dataIndex="amount"
            className="table-icon"
            render={() => (
              <>
                <VerticalAlignTopOutlined style={{ fontSize: '16px' }} />
              </>
            )}
          />
          <Column
            title={t('home:transactionsTable.date')}
            className="table-time"
            dataIndex="createdAt"
            render={(time: string) => (
              <>
                {new Date(time).toLocaleTimeString()}
                <br />
                {new Date(time).toLocaleDateString()}
              </>
            )}
          />
          <Column
            title={t('home:transactionsTable.amount')}
            className="table-amount"
            dataIndex="amount"
            render={(amnt: string, record: pendingTransaction) => (
              <>
                -{formatCrypto(new BigNumber(amnt))}{' '}
                {record.tokenSymbol || blockchainConfig.symbol}
                <br />
                <div style={{ color: 'grey', fontSize: 12 }}>
                  -
                  {formatFiatWithSymbol(
                    new BigNumber(Math.abs(+amnt)).multipliedBy(
                      new BigNumber(
                        record.tokenSymbol
                          ? getCryptoRate(
                              record.tokenSymbol.toLowerCase() as keyof typeof cryptoRates,
                              sspConfig().fiatCurrency,
                            )
                          : fiatRate,
                      ),
                    ),
                  )}
                </div>
              </>
            )}
          />
          <Column
            title={t('home:transactionsTable.confirmations')}
            className={'table-icon'}
            dataIndex="expireAt"
            render={(expireAt: string, row: actionSSPRelay) => (
              <>
                {expireAt ? (
                  <Tooltip title={t('home:transactionsTable.tx_pending')}>
                    <CountdownTimer
                      onFinish={() => onFinishCountDown()}
                      expireAtDateTime={expireAt}
                      createdAtDateTime={row.createdAt}
                    />
                  </Tooltip>
                ) : (
                  <Tooltip title={t('home:transactionsTable.tx_unconfirmed')}>
                    <ClockCircleOutlined style={{ fontSize: '18px' }} />
                  </Tooltip>
                )}
              </>
            )}
          />
        </Table>
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
