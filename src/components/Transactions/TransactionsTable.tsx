import { Table, Empty, Tooltip, Popconfirm, Button, Space } from 'antd';
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
import { formatCrypto, formatFiatWithSymbol } from '../../lib/currency';
import { mkConfig, generateCsv, download } from "export-to-csv";
import { fetchAddressTransactions } from "../../lib/transactions";
import {
  cryptos,
} from '../../types';

function TransactionsTable(props: {
  transactions: transaction[];
  blockheight: number;
  fiatRate: number;
  address: string,
  chain: keyof cryptos;
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

  const csvConfig = mkConfig({ 
    useKeysAsHeaders: true,
    filename: `${blockchainConfig.symbol}.${props.address}`,
  });

  async function collectData () {
    let page = 1;
    let data: any = [];
    let items: any = [];
    let inc = 0;

    do {
      items = await fetchAddressTransactions(props.address, chain, page, 0 + inc, 50 + inc);
      items.forEach((t: any) => {
        data.push({
          ticker: blockchainConfig.symbol,
          transaction_id: t.txid,
          amount: `${formatCrypto(new BigNumber(t.amount).dividedBy(10 ** blockchainConfig.decimals))} ${blockchainConfig.symbol}`,
          fiat: `${formatFiatWithSymbol(new BigNumber(Math.abs(+t.amount)).dividedBy(10 ** blockchainConfig.decimals).multipliedBy(new BigNumber(fiatRate)))}`,
          fee: `${formatCrypto(new BigNumber(t.fee).dividedBy(10 ** blockchainConfig.decimals))} ${blockchainConfig.symbol}`,
          note: t.message.length > 0 ? t.message : '-',
          timestamp: t.timestamp,
          direction: t.receiver.length > 0 ? 'Received' : 'Send',
          blockheight: t.blockheight,
          contract: t.type
        });
      });
      inc += 50;
    } while (items.length >= 50);

    return data;
  }

  const handleExport = () => {
    collectData().then((data) => {
      const csv = generateCsv(csvConfig)(data);
      download(csvConfig)(csv)
    });
  }

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
              {record.type !== 'evm' && (
                <p style={{ margin: 0 }}>
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
                </p>
              )}
              {record.type === 'evm' && (
                <p style={{ margin: 0 }}>
                  {t('home:transactionsTable.fee_with_symbol', {
                    fee: formatCrypto(
                      new BigNumber(record.fee).dividedBy(
                        10 ** blockchainConfig.decimals,
                      ),
                    ),
                    symbol: blockchainConfig.symbol,
                  })}
                </p>
              )}

              <p style={{ margin: 0 }}>
                {t('home:transactionsTable.note_with_note', {
                  note: record.message || '-',
                })}
              </p>
              <a
                href={`https://${backendConfig.explorer ?? backendConfig.node}/tx/${record.txid}`}
                target="_blank"
                rel="noreferrer"
              >
                {t('home:txSent.show_in_explorer')}
              </a>
              {(record.blockheight <= 0 || !record.blockheight) &&
                record.utxos?.length &&
                +record.amount <= 0 &&
                blockchainConfig.rbf && (
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
              {formatCrypto(
                new BigNumber(amnt).dividedBy(10 ** blockchainConfig.decimals),
              )}{' '}
              {blockchainConfig.symbol}
              <br />
              <div style={{ color: 'grey', fontSize: 12 }}>
                {+amnt < 0 ? '-' : ''}
                {formatFiatWithSymbol(
                  new BigNumber(Math.abs(+amnt))
                    .dividedBy(10 ** blockchainConfig.decimals)
                    .multipliedBy(new BigNumber(fiatRate)),
                )}
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
      <Space size={'large'} style={{ marginTop: 16, marginBottom: 8 }}>
        <Button type="primary" size="middle" onClick={handleExport} disabled={props.transactions.length == 0}>
          {t('home:transactionsTable.export_tx')}
        </Button>
      </Space>
    </>
  );
}

export default TransactionsTable;
