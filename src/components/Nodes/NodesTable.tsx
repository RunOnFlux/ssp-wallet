import { Table, Empty, Button, Flex, Popconfirm, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import { useState } from 'react';
import localForage from 'localforage';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import { node, cryptos } from '../../types';
import './Nodes.css';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';
import { fluxnode } from '@runonflux/flux-sdk';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { broadcastTx } from '../../lib/constructTx';
import { setNodes } from '../../store';
import SetupNode from './SetupNode.tsx';

// name, ip, tier, status
function NodesTable(props: {
  nodes: node[];
  chain: keyof cryptos;
  refresh: () => void;
  identityPK: string;
  redeemScript: string;
  collateralPK: string;
  walletInUse: string;
  sspwid: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { chain } = props;
  const parsedNodes = JSON.parse(JSON.stringify(props.nodes)) as node[];
  const sortedNodesByName = parsedNodes.sort((a, b) => {
    if (a.name > b.name) return 1;
    else if (a.name < b.name) return -1;
    else return 0;
  });
  const blockchainConfig = blockchains[chain];
  const [messageApi, contextHolder] = message.useMessage();
  const [editedTxid, setEditedTxid] = useState('');
  const [editedVout, setEditedVout] = useState(0);
  const [editNodeOpen, setEditNodeOpen] = useState(false);
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const startNode = async (txhash: string, vout: number) => {
    try {
      console.log(fluxnode);
      const timestamp = Math.round(new Date().getTime() / 1000).toString();
      // collateralPK, redeemScript
      const tx = fluxnode.startFluxNodev6(
        txhash,
        vout,
        props.collateralPK,
        props.identityPK,
        timestamp,
        true,
        true,
        props.redeemScript,
      );
      console.log(tx);
      const txid = await broadcastTx(tx, chain);
      console.log(txid);
      const adjNodes: node[] = [];
      props.nodes.forEach((node) => {
        const n = { ...node };
        if (node.txid === txhash && node.vout === vout) {
          n.status = timestamp;
        }
        adjNodes.push(n);
      });
      // setNodes
      setNodes(chain, props.walletInUse, adjNodes);
      await localForage.setItem(
        `nodes-${chain}-${props.walletInUse}`,
        adjNodes,
      );
      displayMessage(
        'success',
        t('home:nodesTable.node_started', {
          chainName: blockchainConfig.name,
        }),
      );
    } catch (error) {
      console.log(error);
      displayMessage(
        'error',
        t('home:nodesTable.err_start', {
          chainName: blockchainConfig.name,
        }),
      );
    }
  };

  const deleteNode = async (txhash: string, vout: number) => {
    try {
      console.log(txhash, vout);
      const adjNodes: node[] = [];
      props.nodes.forEach((node) => {
        const n = { ...node };
        if (node.txid === txhash && node.vout === vout) {
          n.name = '';
        }
        adjNodes.push(n);
      });
      // setNodes
      setNodes(chain, props.walletInUse, adjNodes);
      await localForage.setItem(
        `nodes-${chain}-${props.walletInUse}`,
        adjNodes,
      );
      displayMessage(
        'success',
        t('home:nodesTable.node_deleted', {
          chainName: blockchainConfig.name,
        }),
      );
    } catch (error) {
      console.log(error);
      displayMessage(
        'error',
        t('home:nodesTable.err_delete', {
          chainName: blockchainConfig.name,
        }),
      );
    }
  };

  const openFluxOS = (ip: string) => {
    const tIP = ip.split(':')[0];
    const port = +(ip.split(':')[1] || 16127);
    const tPort = port - 1;
    const url = `http://${tIP}:${tPort}`;
    window.open(url, '_blank');
  };

  const editNode = (txid: string, vout: number) => {
    setEditedTxid(txid);
    setEditedVout(vout);
    setEditNodeOpen(true);
  };

  const setupNodeAction = (open: boolean) => {
    setEditNodeOpen(open);
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
              description={
                <span>
                  {t('home:nodesTable.no_nodes')}
                  <br />
                  <a
                    href="https://runonflux.com/nodes"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('home:nodesTable.what_is_node', {
                      chainName: blockchainConfig.name,
                    })}
                  </a>
                </span>
              }
            />
          ),
        }}
        pagination={false}
        showHeader={false}
        rowKey={(record) => record.txid + record.vout}
        bordered={false}
        loading={false}
        dataSource={sortedNodesByName}
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
                  txid: record.txid,
                })}
              </p>
              <p style={{ margin: 0, wordBreak: 'break-all' }}>
                {t('home:transactionsTable.out_id', {
                  vout: record.vout,
                })}
              </p>
              <p style={{ marginTop: 10, wordBreak: 'break-all' }}>
                {t('home:nodesTable.identitypk')}: {props.identityPK}
              </p>
              <p style={{ marginTop: 10, wordBreak: 'break-all' }}>
                {t('home:nodesTable.sspid')}: {props.sspwid}
              </p>
              <div style={{ marginTop: 10 }}>
                {!record.name && (
                  <Button
                    size="middle"
                    onClick={() => editNode(record.txid, record.vout)}
                  >
                    {t('home:nodesTable.setup_node', {
                      chainName: blockchainConfig.name,
                    })}
                  </Button>
                )}
                {record.name && (
                  <Flex gap="small">
                    <Popconfirm
                      title={t('home:nodesTable.start_node', {
                        chainName: blockchainConfig.name,
                      })}
                      description={
                        <>
                          {t('home:nodesTable.start_node_info', {
                            chainName: blockchainConfig.name,
                          })}
                          <br />
                          {t('home:nodesTable.start_node_info_2', {
                            chainName: blockchainConfig.name,
                          })}
                        </>
                      }
                      overlayStyle={{ maxWidth: 360, margin: 10 }}
                      okText={t('common:start')}
                      cancelText={t('common:cancel')}
                      onConfirm={() => {
                        void startNode(record.txid, record.vout);
                      }}
                      icon={
                        <QuestionCircleOutlined style={{ color: 'green' }} />
                      }
                    >
                      <Button
                        size="middle"
                        disabled={
                          record.status !== t('home:nodesTable.offline')
                        }
                      >
                        {t('common:start')}
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title={t('home:nodesTable.open_fluxos')}
                      description={<>{t('home:nodesTable.open_fluxos_info')}</>}
                      overlayStyle={{ maxWidth: 360, margin: 10 }}
                      okText={t('home:nodesTable.open_fluxos')}
                      cancelText={t('common:cancel')}
                      onConfirm={() => {
                        openFluxOS(record.ip);
                      }}
                      icon={
                        <QuestionCircleOutlined style={{ color: 'blue' }} />
                      }
                    >
                      <Button size="middle" disabled={!record.ip}>
                        {t('common:fluxos')}
                      </Button>
                    </Popconfirm>
                    <Button
                      size="middle"
                      onClick={() => editNode(record.txid, record.vout)}
                    >
                      {t('common:edit')}
                    </Button>
                    <Popconfirm
                      title={t('home:nodesTable.delete_node', {
                        chainName: blockchainConfig.name,
                      })}
                      description={
                        <>
                          {t('home:nodesTable.delete_node_info', {
                            chainName: blockchainConfig.name,
                          })}
                          <br />
                          {t('home:nodesTable.delete_node_info_2', {
                            chainName: blockchainConfig.name,
                          })}
                        </>
                      }
                      overlayStyle={{ maxWidth: 360, margin: 10 }}
                      okText={t('common:delete')}
                      cancelText={t('common:cancel')}
                      onConfirm={() => {
                        void deleteNode(record.txid, record.vout);
                      }}
                      icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
                    >
                      <Button size="middle">{t('common:delete')}</Button>
                    </Popconfirm>
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
              {row.name
                ? status.startsWith('1')
                  ? t('home:nodesTable.starting')
                  : status
                : t('home:nodesTable.unassigned')}
            </>
          )}
        />
      </Table>
      {editNodeOpen && (
        <SetupNode
          chain={props.chain}
          walletInUse={props.walletInUse}
          txid={editedTxid}
          vout={editedVout}
          nodes={props.nodes}
          open={editNodeOpen}
          openAction={setupNodeAction}
        />
      )}
    </>
  );
}

export default NodesTable;
