import { Table } from 'antd';
import { useEffect, useRef, useState } from 'react';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import { ClockCircleOutlined } from '@ant-design/icons';
import './Transactions.css';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../../hooks/useSocket.ts';
import { fetchRate } from '../../lib/currency.ts';
import CountdownTimer from './CountDownTimer.tsx';

function PendingTransactionsTable() {
  const alreadyMounted = useRef(false);
  const { t } = useTranslation(['home', 'common']);
  const [fiatRate, setFiatRate] = useState(0);
  const { pendingTxs, refreshPendingTx } = useSocket();

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    obtainRate();
  });

  const obtainRate = () => {
    fetchRate('flux')
      .then((rate) => {
        console.log(rate);
        setFiatRate(rate.USD);
      })
      .catch((error) => {
        console.log(error);
      });
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
          expandable={{
            showExpandColumn: false,
            expandedRowRender: (record) => (
              <div>
                <p style={{ margin: 0, wordBreak: 'break-all' }}>
                  {t('home:transactionsTable.txid_link', {
                    txid: 'waiting for approval',
                  })}
                </p>
                <p style={{ margin: 0 }}>
                  {t('home:transactionsTable.fee_with_symbol', {
                    fee: record.fee,
                    symbol: 'FLUX',
                  })}
                </p>
                <p style={{ margin: 0 }}>
                  {t('home:transactionsTable.note_with_note', {
                    note: record.message || '-',
                  })}
                </p>
              </div>
            ),
            expandRowByClick: true,
          }}
        >
          <Column
            title={t('home:transactionsTable.direction')}
            dataIndex="expireAt"
            className="table-icon make-center"
            render={(expireAt: string) => (
              <>
                <CountdownTimer
                  onFinish={()=>refreshPendingTx?.(expireAt)}
                  targetDateTime={expireAt}
                />
              </>
            )}
          />
          <Column
            title={t('home:transactionsTable.date')}
            className="table-time"
            dataIndex="expireAt"
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
            render={(amnt: string) => (
              <>
                {amnt} FLUX
                <br />
                <div style={{ color: 'grey', fontSize: 12 }}>
                  {+amnt < 0 ? '-' : ''}$
                  {new BigNumber(Math.abs(+amnt))
                    .dividedBy(1e8)
                    .multipliedBy(new BigNumber(fiatRate))
                    .toFixed(2)}{' '}
                  USD
                </div>
              </>
            )}
          />
          <Column
            title={t('home:transactionsTable.confirmations')}
            className="table-icon"
            dataIndex="blockheight"
            render={() => (
              <>
                <ClockCircleOutlined style={{ fontSize: '18px' }} />
              </>
            )}
          />
        </Table>
      ) : null}
    </>
  );
}

export default PendingTransactionsTable;
