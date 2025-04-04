import {
  Table,
  Empty,
  Tooltip,
  Popconfirm,
  Button,
  Space,
  message,
} from 'antd';
import { sspConfig } from '@storage/ssp';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import { NoticeType } from 'antd/es/message/interface';
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
import { mkConfig, generateCsv, download } from 'export-to-csv';
import { fetchDataForCSV } from '../../lib/transactions';
import { cryptos } from '../../types';
import { useAppSelector } from '../../hooks';

function TransactionsTable(props: {
  transactions: transaction[];
  blockheight: number;
  fiatRate: number;
  address: string;
  chain: keyof cryptos;
  refresh: () => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const navigate = useNavigate();
  const { chain } = props;
  const [fiatRate, setFiatRate] = useState(0);
  const blockchainConfig = blockchains[chain];
  const backendConfig = backends()[chain];
  const [messageApi, contextHolder] = message.useMessage();
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
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

  return (
    <>
      {contextHolder}
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
        style={{ width: '100%' }}
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
          render={(amnt: string, record: transaction) => (
            <>
              {formatCrypto(
                new BigNumber(amnt).dividedBy(
                  10 ** (record.decimals ?? blockchainConfig.decimals),
                ),
              )}{' '}
              {record.tokenSymbol || blockchainConfig.symbol}
              <br />
              <div style={{ color: 'grey', fontSize: 12 }}>
                {+amnt < 0 ? '-' : ''}
                {formatFiatWithSymbol(
                  new BigNumber(Math.abs(+amnt))
                    .dividedBy(
                      10 ** (record.decimals ?? blockchainConfig.decimals),
                    )
                    .multipliedBy(
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
        <Button
          type="primary"
          size="middle"
          onClick={handleExport}
          disabled={props.transactions.length == 0}
        >
          {t('home:transactionsTable.export_tx')}
        </Button>
      </Space>
    </>
  );
}

export default TransactionsTable;
