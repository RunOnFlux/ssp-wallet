import { Table, Empty, Button, Flex, Popconfirm, message } from 'antd';
import axios from 'axios';
import { NoticeType } from 'antd/es/message/interface';
import { useEffect, useState } from 'react';
import localForage from 'localforage';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import { node, cryptos, flux_storage_call } from '../../types';
import './Nodes.css';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';
import { fluxnode } from '@runonflux/flux-sdk';
import secureLocalStorage from 'react-secure-storage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { randomBytes } from 'crypto';
import { broadcastTx } from '../../lib/constructTx';
import { getFingerprint } from '../../lib/fingerprint';
import {
  getScriptType,
  generateExternalIdentityKeypair,
  wifToPrivateKey,
} from '../../lib/wallet.ts';
import { setNodes } from '../../store';
import SetupNode from './SetupNode.tsx';
import WordsDialog from './WordsDialog.tsx';

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
  identityChain: keyof cryptos;
  passwordBlob: string;
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
  const identityChainConfig = blockchains[props.identityChain];
  const [messageApi, contextHolder] = message.useMessage();
  const [editedTxid, setEditedTxid] = useState('');
  const [editedVout, setEditedVout] = useState(0);
  const [wordsPhrase, setWordsPhrase] = useState('');
  const [phraseDialogOpen, setPhraseDialogOpen] = useState(false);
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

  useEffect(() => {
    if (wordsPhrase) {
      setPhraseDialogOpen(true);
    } else {
      setPhraseDialogOpen(false);
    }
  }, [wordsPhrase]);

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

  /**
   * Signs the message with the private key.
   *
   * @param {string} message
   * @param {string} pk - private key
   *
   * @returns {string} signature
   */
  function signMessageSSPWID(message: string, pk: string) {
    let signature;
    try {
      const isCompressed = true; // ssp always has compressed keys

      const privateKey = wifToPrivateKey(pk, chain);

      const messagePrefix = identityChainConfig.messagePrefix;

      // this is base64 encoded
      signature = fluxnode.signMessage(
        message,
        privateKey,
        isCompressed,
        messagePrefix,
        { extraEntropy: randomBytes(32) },
      );

      // => different (but valid) signature each time
    } catch (e) {
      console.log(e);
      signature = null;
    }
    return signature;
  }

  const uploadToFluxStorage = async (node: node) => {
    try {
      const dataToUpload = {
        adminId: props.sspwid,
        nodeKey: props.identityPK,
        transactionOutput: node.txid,
        transactionIndex: node.vout.toString(),
        nodeName: node.name,
      };

      const dataToSign = JSON.stringify(dataToUpload);
      let signature: string | null = null;

      // sign request
      const xprivEncrypted = secureLocalStorage.getItem(
        `xpriv-48-${identityChainConfig.slip}-0-${getScriptType(
          identityChainConfig.scriptType,
        )}-${identityChainConfig.id}`,
      );
      const fingerprint: string = getFingerprint();
      const password = await passworderDecrypt(fingerprint, props.passwordBlob);
      if (typeof password !== 'string') {
        throw new Error('Unable to decrypt password');
      }
      if (xprivEncrypted && typeof xprivEncrypted === 'string') {
        const xpriv = await passworderDecrypt(password, xprivEncrypted);
        // generate keypair
        if (xpriv && typeof xpriv === 'string') {
          const externalIdentity = generateExternalIdentityKeypair(xpriv);
          // sign message
          signature = signMessageSSPWID(dataToSign, externalIdentity.privKey);
          if (!signature) {
            throw new Error('Unable to sign message');
          }
        } else {
          throw new Error('Unknown error: address mismatch');
        }
      }

      const url = 'https://storage.runonflux.io/v1/node';
      const options = {
        headers: {
          'flux-signature': signature,
        },
      };
      const response = await axios.post<flux_storage_call>(
        url,
        dataToUpload,
        options,
      );

      displayMessage(
        'success',
        t('home:nodesTable.node_uploaded_storage', {
          chainName: blockchainConfig.name,
        }),
      );

      // display dialog with words identifier
      const identityPhrase = response.data.data;
      setWordsPhrase(identityPhrase);
    } catch (error) {
      console.log(error);
      displayMessage(
        'error',
        t('home:nodesTable.err_upload_storage', {
          chainName: blockchainConfig.name,
        }),
      );
    }
  };

  const wordsDialogAction = (status: boolean) => {
    setWordsPhrase('');
    setPhraseDialogOpen(status);
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
                  <Flex wrap gap="small">
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
                    <Popconfirm
                      title={t('home:nodesTable.add_to_flux_storage')}
                      description={
                        <>{t('home:nodesTable.add_to_flux_storage_info')}</>
                      }
                      overlayStyle={{ maxWidth: 360, margin: 10 }}
                      okText={t('home:nodesTable.add_to_flux_storage')}
                      cancelText={t('common:cancel')}
                      onConfirm={() => {
                        void uploadToFluxStorage(record);
                      }}
                      icon={
                        <QuestionCircleOutlined style={{ color: 'blue' }} />
                      }
                    >
                      <Button size="middle">
                        {t('home:nodesTable.add_to_flux_storage')}
                      </Button>
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
      {phraseDialogOpen && (
        <WordsDialog
          wordsPhrase={wordsPhrase}
          open={phraseDialogOpen}
          openAction={wordsDialogAction}
        />
      )}
    </>
  );
}

export default NodesTable;
