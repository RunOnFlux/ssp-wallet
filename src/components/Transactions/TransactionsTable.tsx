import { Table } from 'antd';
import { transaction } from '../../types';

function TransactionsTable(props: { transactions: transaction[] }) {
  const tableColumns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
    },
  ];
  return (
    <>
      <Table
        pagination={false}
        showHeader={false}
        rowKey="txid"
        bordered={false}
        loading={false}
        columns={tableColumns}
        dataSource={props.transactions}
      />
    </>
  );
}

export default TransactionsTable;
