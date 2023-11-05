import { Table, Empty, Button, Flex } from 'antd';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import { node } from '../../types';
import './Nodes.css';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';

// name, ip, tier, status
function NodesTable(props: {
  nodes: node[];
  chain: string;
  refresh: () => void;
  identityPK: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { chain } = props;
  const blockchainConfig = blockchains[chain];

  return (
    <>
      <Table
        className="adjustedWidth"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('home:nodesTable.no_nodes')}
            />
          ),
        }}
        pagination={false}
        showHeader={false}
        rowKey="txid"
        bordered={false}
        loading={false}
        dataSource={props.nodes}
        expandable={{
          showExpandColumn: false,
          expandedRowRender: (record) => (
            <div>
              <p style={{ margin: 0 }}>
                {t('home:nodesTable.amount')}:{' '}
                {new BigNumber(record.amount)
                  .dividedBy(10 ** blockchainConfig.decimals)
                  .toFixed(0)}{' '}
                {blockchainConfig.symbol}
              </p>
              <p style={{ margin: 0, wordBreak: 'break-all' }}>
                {t('home:transactionsTable.txid_link', {
                  txid: record.txid + ':' + record.vout,
                })}
              </p>
              <p style={{ marginTop: 10 }}>
                {t('home:nodesTable.identitypk')}: {props.identityPK}
              </p>
              <div style={{ marginTop: 10 }}>
                {record.name && <Button size="middle">Setup Flux Node</Button>}
                {!record.name && (
                  <Flex gap="small">
                    <Button size="middle">Start</Button>
                    <Button size="middle">FluxOS</Button>
                    <Button size="middle">Edit</Button>
                    <Button size="middle">Delete</Button>
                  </Flex>
                )}
              </div>
            </div>
          ),
          expandRowByClick: true,
        }}
      >
        <Column
          title={t('home:nodesTable.name')}
          dataIndex="name"
          className="node-name"
          render={(name: string) => <>{name || '---'}</>}
        />
        <Column
          title={t('home:nodesTable.ip')}
          className="node-ip"
          dataIndex="ip"
          render={(ip: string) => <>{ip || 'No IP'}</>}
        />
        <Column
          title={t('home:nodesTable.tier')}
          className="node-tier"
          dataIndex="amount"
          render={(amount: string) => (
            <>
              {amount === '4000000000000'
                ? 'Stratus'
                : amount === '1250000000000'
                ? 'Nimbus'
                : 'Cumulus'}
            </>
          )}
        />
        <Column
          title={t('home:nodesTable.status')}
          className="node-status"
          dataIndex="status"
          render={(status: string, row: node) => (
            <>
              {status.startsWith('1')
                ? 'Starting'
                : status || row.name
                ? 'Offline'
                : 'Unassigned'}
            </>
          )}
        />
      </Table>
    </>
  );
}

export default NodesTable;
