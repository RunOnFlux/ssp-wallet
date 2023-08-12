import { Table } from 'antd';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import { transaction } from '../../types';

function TransactionsTable(props: { transactions: transaction[] }) {
  return (
    <>
      <Table
        pagination={false}
        showHeader={false}
        rowKey="txid"
        bordered={false}
        loading={false}
        dataSource={props.transactions}
        expandable={{
          expandedRowRender: (record) => (
            <div>
              <p style={{ margin: 0, wordBreak: 'break-all' }}>
                TXID: {record.txid}
              </p>
              <p style={{ margin: 0 }}>Fee: {record.fee} FLUX</p>
              <p style={{ margin: 0 }}>Note: {record.message || '-'}</p>
              <a
                href={`https://explorer.runonflux.io/tx/${record.txid}`}
                target="_blank"
                rel="noreferrer"
              >
                Show in Explorer
              </a>
            </div>
          ),
          expandRowByClick: true,
        }}
      >
        <Column
          title="Date"
          dataIndex="timestamp"
          key="timestamp"
          render={(time: string) => <>{new Date(time).toLocaleString()}</>}
        />
        <Column
          title="Amount"
          dataIndex="amount"
          key="amount"
          render={(amnt: string) => (
            <>{new BigNumber(amnt).dividedBy(1e8).toFixed()} FLUX</>
          )}
        />
      </Table>
    </>
  );
}

export default TransactionsTable;
