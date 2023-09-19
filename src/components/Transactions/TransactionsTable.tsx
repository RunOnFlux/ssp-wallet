import { Table, Empty } from 'antd';
import { useEffect, useRef, useState } from 'react';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
} from '@ant-design/icons';
import { transaction } from '../../types';
import './Transactions.css';
import { blockchains } from '@storage/blockchains';
import { fetchRate } from '../../lib/currency.ts';
import { useTranslation } from 'react-i18next';

function TransactionsTable(props: {
  transactions: transaction[];
  blockheight: number;
  chain?: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { chain = 'flux' } = props;
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [fiatRate, setFiatRate] = useState(0);
  const blockchainConfig = blockchains[chain];

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
      <Table
        className="adjustedWidth"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('home:transactionsTable.no_tx_history')}
            />
          ),
        }}
        pagination={false}
        showHeader={false}
        rowKey="txid"
        bordered={false}
        loading={false}
        dataSource={props.transactions}
        expandable={{
          showExpandColumn: false,
          expandedRowRender: (record) => (
            <div>
              <p style={{ margin: 0, wordBreak: 'break-all' }}>
                {t('home:transactionsTable.txid_link', { txid: record.txid })}
              </p>
              <p style={{ margin: 0 }}>
                {t('home:transactionsTable.fee_with_symbol', {
                  fee: new BigNumber(record.fee).dividedBy(1e8).toFixed(),
                  symbol: 'FLUX',
                })}
              </p>
              <p style={{ margin: 0 }}>
                {t('home:transactionsTable.note_with_note', {
                  note: record.message || '-',
                })}
              </p>
              <a
                href={`https://${blockchainConfig.node}/tx/${record.txid}`}
                target="_blank"
                rel="noreferrer"
              >
                {t('home:txSent.show_in_explorer')}
              </a>
            </div>
          ),
          expandRowByClick: true,
        }}
      >
        <Column
          title={t('home:transactionsTable.direction')}
          dataIndex="amount"
          className="table-icon"
          render={(amnt: string) => (
            <>
              {+amnt > 0 ? (
                <VerticalAlignBottomOutlined style={{ fontSize: '16px' }} />
              ) : (
                <VerticalAlignTopOutlined style={{ fontSize: '16px' }} />
              )}
            </>
          )}
        />
        <Column
          title={t('home:transactionsTable.date')}
          className="table-time"
          dataIndex="timestamp"
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
              {new BigNumber(amnt).dividedBy(1e8).toFixed()} FLUX
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
          render={(height: number) => (
            <>
              {props.blockheight - height == 0 ? (
                <ClockCircleOutlined style={{ fontSize: '18px' }} />
              ) : (
                <CheckCircleOutlined style={{ fontSize: '18px' }} />
              )}
            </>
          )}
        />
      </Table>
    </>
  );
}

TransactionsTable.defaultProps = {
  chain: 'flux',
};

export default TransactionsTable;
