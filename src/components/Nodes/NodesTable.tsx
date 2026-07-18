import { Button, Flex, Popconfirm, Modal, Typography } from 'antd';
const { Text } = Typography;
import axios from 'axios';
import { toast } from '../../lib/toast';
import { NoticeType } from 'antd/es/message/interface';
import { useEffect, useState } from 'react';
import localForage from 'localforage';
import BigNumber from 'bignumber.js';
import { node, cryptos, flux_storage_call } from '../../types';
import './Nodes.css';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';
import { fluxnode } from '@runonflux/flux-sdk';
import secureLocalStorage from 'react-secure-storage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import {
  CircleHelp as CircleHelpIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  Server as ServerIcon,
} from 'lucide-react';
import EmptyState from '../EmptyState/EmptyState';
import { nodeStatusTone } from '../../lib/nodeStatus';
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
import { getNamedDelegates, NamedDelegate } from './ConfigureDelegates';
import SelectDelegates from './SelectDelegates';

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
  const [editedTxid, setEditedTxid] = useState('');
  const [editedVout, setEditedVout] = useState(0);
  const [wordsPhrase, setWordsPhrase] = useState('');
  const [phraseDialogOpen, setPhraseDialogOpen] = useState(false);
  const [editNodeOpen, setEditNodeOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [redeemScriptVisible, setRedeemScriptVisible] = useState(false);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<{
    txid: string;
    vout: number;
  } | null>(null);
  const [startDelegates, setStartDelegates] = useState<NamedDelegate[]>([]);
  const [selectedDelegateKeys, setSelectedDelegateKeys] = useState<string[]>(
    [],
  );
  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({
      type,
      content,
    });
  };

  const startNode = async (
    txhash: string,
    vout: number,
    delegateKeys: string[],
  ) => {
    try {
      console.log(fluxnode);
      const timestamp = Math.round(new Date().getTime() / 1000).toString();

      // Apply the delegates the user selected in the start dialog (defaults to all).
      // type 1 = DELEGATE_TYPE_UPDATE (owner grants delegate permissions)
      const delegateData =
        delegateKeys.length > 0
          ? { version: 1, type: 1, delegatePublicKeys: delegateKeys }
          : undefined;

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
        delegateData,
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

  const openStartModal = async (txhash: string, vout: number) => {
    const named = await getNamedDelegates(chain, props.walletInUse);
    setStartDelegates(named);
    setSelectedDelegateKeys(named.map((d) => d.key)); // default to all
    setPendingStart({ txid: txhash, vout });
    setStartModalOpen(true);
  };

  const confirmStart = () => {
    if (pendingStart) {
      void startNode(
        pendingStart.txid,
        pendingStart.vout,
        selectedDelegateKeys,
      );
    }
    setStartModalOpen(false);
    setPendingStart(null);
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
      let password = await passworderDecrypt(fingerprint, props.passwordBlob);
      if (typeof password !== 'string') {
        throw new Error('Unable to decrypt password');
      }
      if (xprivEncrypted && typeof xprivEncrypted === 'string') {
        let xpriv = await passworderDecrypt(password, xprivEncrypted);
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
        // reassign xpriv to null as it is no longer needed
        xpriv = null;
      }
      password = null;

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

  const transformStatus = (status: string) => {
    if (status.startsWith('1')) {
      return t('home:nodesTable.starting');
    }
    if (status === 'started') {
      return t('home:nodesTable.started');
    }
    if (status === 'dos') {
      return t('home:nodesTable.dos');
    }
    if (status === 'offline') {
      return t('home:nodesTable.offline');
    }
    if (status === 'confirmed') {
      return t('home:nodesTable.confirmed');
    }
    return status;
  };

  const wordsDialogAction = (status: boolean) => {
    setWordsPhrase('');
    setPhraseDialogOpen(status);
  };

  const nodeTier = (amount: string) =>
    amount === '4000000000000'
      ? 'Stratus'
      : amount === '1250000000000'
        ? 'Nimbus'
        : 'Cumulus';

  const renderNodeDetails = (record: node) => (
    <div className="feed-details node-expanded-row">
      <div>
        <Text type="secondary" className="node-detail-label">
          {t('home:nodesTable.amount')}
        </Text>
        <Text className="node-detail-value">
          {new BigNumber(record.amount)
            .dividedBy(10 ** blockchainConfig.decimals)
            .toFixed(0)}{' '}
          {blockchainConfig.symbol}
        </Text>
      </div>
      <div>
        <Text type="secondary" className="node-detail-label">
          {t('home:transactionsTable.txid')}
        </Text>
        <Text
          copyable={{ text: record.txid }}
          className="node-detail-value-mono"
        >
          {record.txid}
        </Text>
      </div>
      <div>
        <Text type="secondary" className="node-detail-label">
          {t('home:transactionsTable.output_id')}
        </Text>
        <Text className="node-detail-value">{record.vout}</Text>
      </div>
      <div>
        <Text type="secondary" className="node-detail-label">
          {t('home:nodesTable.identitypk')}
        </Text>
        <Text
          copyable={{ text: props.identityPK }}
          className="node-detail-value-mono"
        >
          {props.identityPK}
        </Text>
      </div>
      <div>
        <Text type="secondary" className="node-detail-label">
          {t('home:nodesTable.sspid')}
        </Text>
        <Text
          copyable={{ text: props.sspwid }}
          className="node-detail-value-mono"
        >
          {props.sspwid}
        </Text>
      </div>
      {props.redeemScript && (
        <div>
          <Text type="secondary" className="node-detail-label-with-icon">
            {redeemScriptVisible ? (
              <EyeIcon
                onClick={() => setRedeemScriptVisible(false)}
                className="node-clickable-icon"
              />
            ) : (
              <EyeOffIcon
                onClick={() => setRedeemScriptVisible(true)}
                className="node-clickable-icon"
              />
            )}
            {t('home:nodesTable.redeem_script')}
          </Text>
          <Text
            copyable={
              redeemScriptVisible ? { text: props.redeemScript } : false
            }
            className="node-detail-value-mono"
          >
            {redeemScriptVisible
              ? props.redeemScript
              : '*** *** *** *** *** ***'}
          </Text>
        </div>
      )}
      <div className="node-detail-actions">
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
            <Button
              size="middle"
              disabled={
                record.status !== 'offline' &&
                record.status !== t('home:nodesTable.offline')
              }
              onClick={() => {
                void openStartModal(record.txid, record.vout);
              }}
            >
              {t('common:start')}
            </Button>
            <Popconfirm
              title={t('home:nodesTable.open_fluxos')}
              description={<>{t('home:nodesTable.open_fluxos_info')}</>}
              overlayStyle={{ maxWidth: 360, margin: 10 }}
              okText={t('home:nodesTable.open_fluxos')}
              cancelText={t('common:cancel')}
              onConfirm={() => {
                openFluxOS(record.ip);
              }}
              icon={<CircleHelpIcon style={{ color: '#3b82f6' }} />}
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
              icon={<CircleHelpIcon style={{ color: '#ef4444' }} />}
            >
              <Button size="middle">{t('common:delete')}</Button>
            </Popconfirm>
            <Popconfirm
              title={t('home:nodesTable.add_to_flux_storage')}
              description={<>{t('home:nodesTable.add_to_flux_storage_info')}</>}
              overlayStyle={{ maxWidth: 360, margin: 10 }}
              okText={t('home:nodesTable.add_to_flux_storage')}
              cancelText={t('common:cancel')}
              onConfirm={() => {
                void uploadToFluxStorage(record);
              }}
              icon={<CircleHelpIcon style={{ color: '#3b82f6' }} />}
            >
              <Button size="middle">
                {t('home:nodesTable.add_to_flux_storage')}
              </Button>
            </Popconfirm>
          </Flex>
        )}
      </div>
    </div>
  );

  return (
    <>
      {sortedNodesByName.length === 0 ? (
        <EmptyState
          icon={<ServerIcon />}
          description={
            <>
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
            </>
          }
        />
      ) : (
        <div className="feed-list">
          {sortedNodesByName.map((record) => {
            const rowKey = record.txid + record.vout;
            const expanded = expandedKey === rowKey;
            return (
              <div key={rowKey}>
                <button
                  type="button"
                  className="node-row"
                  onClick={() => setExpandedKey(expanded ? null : rowKey)}
                  aria-expanded={expanded}
                >
                  <span className="node-row-main">
                    <span className="node-row-name">
                      {record.name || '---'}
                    </span>
                    <span className="node-row-sub">
                      {record.ip || 'No IP'}
                      {' · '}
                      {nodeTier(record.amount)}
                    </span>
                  </span>
                  <span
                    className={`node-chip node-chip-${nodeStatusTone(
                      record.status,
                      !!record.name,
                    )}`}
                  >
                    {record.name
                      ? transformStatus(record.status)
                      : t('home:nodesTable.unassigned')}
                  </span>
                </button>
                {expanded && renderNodeDetails(record)}
              </div>
            );
          })}
        </div>
      )}
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
      <Modal
        title={t('home:nodesTable.start_node', {
          chainName: blockchainConfig.name,
        })}
        open={startModalOpen}
        onOk={confirmStart}
        onCancel={() => {
          setStartModalOpen(false);
          setPendingStart(null);
        }}
        okText={t('common:start')}
        cancelText={t('common:cancel')}
      >
        <p>
          {t('home:nodesTable.start_node_info', {
            chainName: blockchainConfig.name,
          })}
        </p>
        <p>
          {t('home:nodesTable.start_node_info_2', {
            chainName: blockchainConfig.name,
          })}
        </p>
        <SelectDelegates
          delegates={startDelegates}
          selectedKeys={selectedDelegateKeys}
          onChange={setSelectedDelegateKeys}
        />
      </Modal>
    </>
  );
}

export default NodesTable;
