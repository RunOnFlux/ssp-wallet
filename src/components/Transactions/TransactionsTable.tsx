import { Table, Empty, Tooltip, Popconfirm, Button } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useTranslation } from 'react-i18next';
import { backends } from '@storage/backends';

function TransactionsTable(props: {
  transactions: transaction[];
  blockheight: number;
  fiatRate: number;
  chain: string;
  refresh: () => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const navigate = useNavigate();
  const { chain } = props;
  const [fiatRate, setFiatRate] = useState(0);
  const blockchainConfig = blockchains[chain];
  const backendConfig = backends()[chain];

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
                  fee: new BigNumber(record.fee)
                    .dividedBy(10 ** blockchainConfig.decimals)
                    .toFixed(),
                  symbol: blockchainConfig.symbol,
                })}{' '}
                ({(+record.fee / (record.vsize ?? record.size)).toFixed(2)}{' '}
                {record.vsize ? '˝sat/vB' : 'sat/B'})
              </p>
              <p style={{ margin: 0 }}>
                {t('home:transactionsTable.note_with_note', {
                  note: record.message || '-',
                })}
              </p>
              <a
                href={`https://${backendConfig.node}/tx/${record.txid}`}
                target="_blank"
                rel="noreferrer"
              >
                {t('home:txSent.show_in_explorer')}
              </a>
              {(record.blockheight <= 0 ||
                !record.blockheight) &&
                record.utxos?.length &&
                +record.amount <= 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      float: 'right',
                    }}
                  >
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
                      icon={
                        <QuestionCircleOutlined style={{ color: 'green' }} />
                      }
                    >
                      <Button size="small">
                        {t('home:transactionsTable.replace_by_fee')}
                      </Button>
                    </Popconfirm>
                  </div>
                )}
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
              {new BigNumber(amnt)
                .dividedBy(10 ** blockchainConfig.decimals)
                .toFixed()}{' '}
              {blockchainConfig.symbol}
              <br />
              <div style={{ color: 'grey', fontSize: 12 }}>
                {+amnt < 0 ? '-' : ''}$
                {new BigNumber(Math.abs(+amnt))
                  .dividedBy(10 ** blockchainConfig.decimals)
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
              {height <= 0 || !height ? (
                <Tooltip title={t('home:transactionsTable.tx_unconfirmed')}>
                  <ClockCircleOutlined style={{ fontSize: '18px' }} />
                </Tooltip>
              ) : (
                <Tooltip title={t('home:transactionsTable.tx_confirmed')}>
                  <CheckCircleOutlined style={{ fontSize: '18px' }} />
                </Tooltip>
              )}
            </>
          )}
        />
      </Table>
    </>
  );
}

export default TransactionsTable;
