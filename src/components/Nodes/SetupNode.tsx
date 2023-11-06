import { useState } from 'react';
import { Button, Modal, Input, Space, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { cryptos, node } from '../../types';
import { setNodes } from '../../store';

function SetupNode(props: {
  chain: keyof cryptos;
  walletInUse: string;
  txid: string;
  vout: number;
  nodes: node[];
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;
  const [messageApi, contextHolder] = message.useMessage();
  const blockchainConfig = blockchains[props.chain];
  const editedNode: node = props.nodes.find(
    (node) => node.txid === props.txid && node.vout === props.vout,
  ) ?? {
    name: '',
    ip: '',
    txid: '',
    vout: 0,
    amount: '',
    status: '',
  };
  const [nodeName, setNodeName] = useState<string>(editedNode.name);
  const [nodeIP, setNodeIP] = useState<string>(editedNode.ip);

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleOk = () => {
    try {
      if (!nodeName) {
        displayMessage('error', t('home:setupNode.err_no_name'));
        return;
      }
      const adjustedNode = { ...editedNode };
      adjustedNode.name = nodeName;
      adjustedNode.ip = nodeIP;
      const newNodes: node[] = [];
      props.nodes.forEach((n) => {
        if (n.txid === props.txid && n.vout === props.vout) {
          newNodes.push(adjustedNode);
        } else {
          newNodes.push(n);
        }
      });
      // save
      setNodes(props.chain, props.walletInUse, newNodes);
      void (async function () {
        await localForage.setItem(
          `nodes-${props.chain}-${props.walletInUse}`,
          newNodes,
        );
      })();
      openAction(false);
      displayMessage(
        'success',
        t('home:setupNode.node_saved', { chainName: blockchainConfig.name }),
      );
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:setupNode.err_saving_node'));
    }
  };

  const handleNotOk = () => {
    if (nodeName !== editedNode.name) {
      setNodeName(editedNode.name);
    }
    if (nodeIP !== editedNode.ip) {
      setNodeIP(editedNode.ip);
    }
    openAction(false);
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:setupNode.setup_node', {
          chainName: blockchainConfig.name,
        })}
        open={open}
        onCancel={handleNotOk}
        style={{ textAlign: 'center', top: 60, width: 200 }}
        footer={[]}
      >
        <br />
        <br />
        <h3>{t('home:setupNode.node_name')}</h3>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder={editedNode.name}
            value={nodeName}
            onChange={(e) => setNodeName(e.target.value)}
          />
        </Space.Compact>
        <h3>{t('home:setupNode.node_ip')}</h3>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder={editedNode.ip}
            value={nodeIP}
            onChange={(e) => setNodeIP(e.target.value)}
          />
        </Space.Compact>
        <br />
        <br />
        <br />
        <br />
        <Space direction="vertical" size="large">
          <Button type="primary" size="large" onClick={handleOk}>
            {t('common:save')}
          </Button>
          <Button type="link" block size="small" onClick={handleNotOk}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default SetupNode;
