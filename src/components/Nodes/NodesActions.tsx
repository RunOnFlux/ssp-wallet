import { useState } from 'react';
import { Button, Dropdown, Modal, message, Spin } from 'antd';
import { MoreOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';
import { fluxnode } from '@runonflux/flux-sdk';
import { node, cryptos } from '../../types';
import { blockchains } from '@storage/blockchains';
import { setNodes } from '../../store';
import { broadcastTx } from '../../lib/constructTx';
import { NoticeType } from 'antd/es/message/interface';
import ConfigureDelegates, { getDelegates } from './ConfigureDelegates';

function NodesActions(props: {
  nodes: node[];
  chain: keyof cryptos;
  walletInUse: string;
  collateralPK: string;
  identityPK: string;
  redeemScript: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const [startingAllNodes, setStartingAllNodes] = useState(false);
  const [startAllModalOpen, setStartAllModalOpen] = useState(false);
  const [delegatesModalOpen, setDelegatesModalOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const blockchainConfig = blockchains[props.chain];

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const getStartableNodes = () => {
    return props.nodes.filter((n) => n.name && n.status === 'offline');
  };

  const startAllNodes = async () => {
    const startableNodes = getStartableNodes();
    if (startableNodes.length === 0) {
      displayMessage('warning', t('home:nodesTable.no_startable_nodes'));
      return;
    }

    setStartingAllNodes(true);
    displayMessage('info', t('home:nodesTable.starting_all_nodes'));

    // Get configured delegates for this wallet
    const delegates = await getDelegates(props.chain, props.walletInUse);
    // type 1 = DELEGATE_TYPE_UPDATE (owner grants delegate permissions)
    const delegateData =
      delegates.length > 0
        ? { version: 1, type: 1, delegatePublicKeys: delegates }
        : undefined;

    let successCount = 0;
    let failCount = 0;
    const adjNodes: node[] = JSON.parse(JSON.stringify(props.nodes)) as node[];

    for (const nodeToStart of startableNodes) {
      try {
        const timestamp = Math.round(new Date().getTime() / 1000).toString();
        const tx = fluxnode.startFluxNodev6(
          nodeToStart.txid,
          nodeToStart.vout,
          props.collateralPK,
          props.identityPK,
          timestamp,
          true,
          true,
          props.redeemScript,
          delegateData,
        );
        await broadcastTx(tx, props.chain);

        const nodeIndex = adjNodes.findIndex(
          (n) => n.txid === nodeToStart.txid && n.vout === nodeToStart.vout,
        );
        if (nodeIndex !== -1) {
          adjNodes[nodeIndex].status = timestamp;
        }
        successCount++;
      } catch (error) {
        console.log(`Error starting node ${nodeToStart.name}:`, error);
        failCount++;
      }
    }

    setNodes(props.chain, props.walletInUse, adjNodes);
    await localForage.setItem(
      `nodes-${props.chain}-${props.walletInUse}`,
      adjNodes,
    );

    setStartingAllNodes(false);

    if (failCount === 0) {
      displayMessage(
        'success',
        t('home:nodesTable.all_nodes_started', { count: successCount }),
      );
    } else {
      displayMessage(
        'warning',
        t('home:nodesTable.some_nodes_failed', {
          success: successCount,
          total: startableNodes.length,
          failed: failCount,
        }),
      );
    }
  };

  const startableNodesCount = getStartableNodes().length;

  if (startingAllNodes) {
    return (
      <>
        {contextHolder}
        <Spin size="small" style={{ marginLeft: 8 }} />
      </>
    );
  }

  return (
    <>
      {contextHolder}
      <Dropdown
        menu={{
          items: [
            {
              key: 'start-all',
              label: `${t('home:nodesTable.start_all_nodes')} (${startableNodesCount})`,
              disabled: startableNodesCount === 0,
              onClick: () => setStartAllModalOpen(true),
            },
            {
              type: 'divider',
            },
            {
              key: 'configure-delegates',
              label: t('home:nodesTable.configure_delegates'),
              icon: <SettingOutlined />,
              onClick: () => setDelegatesModalOpen(true),
            },
          ],
        }}
        trigger={['click']}
        placement="bottomRight"
      >
        <Button type="text" icon={<MoreOutlined />} />
      </Dropdown>
      <Modal
        title={t('home:nodesTable.start_all_nodes_title', {
          chainName: blockchainConfig.name,
        })}
        open={startAllModalOpen}
        onOk={() => {
          setStartAllModalOpen(false);
          void startAllNodes();
        }}
        onCancel={() => setStartAllModalOpen(false)}
        okText={t('home:nodesTable.start_all_nodes')}
        cancelText={t('common:cancel')}
      >
        <p>{t('home:nodesTable.start_all_nodes_info')}</p>
        <p>
          {t('home:nodesTable.start_all_nodes_info_2', {
            chainName: blockchainConfig.name,
          })}
        </p>
        <p>
          <strong>
            {t('home:nodesTable.start_all_nodes_count', {
              count: startableNodesCount,
            })}
          </strong>
        </p>
      </Modal>
      <ConfigureDelegates
        open={delegatesModalOpen}
        onClose={() => setDelegatesModalOpen(false)}
        chain={props.chain}
        walletInUse={props.walletInUse}
      />
    </>
  );
}

export default NodesActions;
