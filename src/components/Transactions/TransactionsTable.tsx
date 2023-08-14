import { Table, Empty } from 'antd';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
} from '@ant-design/icons';
import { transaction } from '../../types';
import './Transactions.css';

function TransactionsTable(props: {
  transactions: transaction[];
  blockheight: number;
}) {
  return (
    <>
      <Table
        className="adjustedWidth"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No Transaction History Found"
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
          title="Direction"
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
          title="Date"
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
          title="Amount"
          className="table-amount"
          dataIndex="amount"
          render={(amnt: string) => (
            <>{new BigNumber(amnt).dividedBy(1e8).toFixed()} FLUX</>
          )}
        />
        <Column
          title="Confirmations"
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

export default TransactionsTable;
