import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Input,
  Typography,
  message,
  List,
  Card,
  Tag,
  Space,
  Tabs,
} from 'antd';
import { LinkOutlined, DeleteOutlined } from '@ant-design/icons';
import { useWalletConnect } from '../../contexts/WalletConnectContext';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';
import './WalletConnect.css';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Props {
  open: boolean;
  openAction: (status: boolean) => void;
}

const WalletConnect: React.FC<Props> = ({ open, openAction }) => {
  const { t } = useTranslation(['home', 'common']);
  const [messageApi, contextHolder] = message.useMessage();
  const [activeTab, setActiveTab] = useState('connect');
  const [uri, setUri] = useState('');
  const [connecting, setConnecting] = useState(false);
  const { activeSessions, isInitialized, pair, disconnectSession } =
    useWalletConnect();

  const displayMessage = (
    type: 'success' | 'error' | 'info' | 'warning',
    content: string,
    duration?: number,
  ) => {
    void messageApi.open({
      type,
      content,
      duration: duration ? duration : type === 'error' ? 5 : 4,
    });
  };

  useEffect(() => {
    if (open) {
      setUri('');
      setActiveTab('connect');
    }
  }, [open]);

  const handleConnect = async () => {
    if (!uri.trim()) {
      displayMessage('error', t('home:walletconnect.enter_uri'));
      return;
    }

    setConnecting(true);
    try {
      try {
        await pair(uri.trim());
      } catch {
        return;
      }
      setUri('');
      setActiveTab('sessions');
    } catch (error: unknown) {
      console.error('WalletConnect connection error:', error);
      displayMessage(
        'error',
        (error as Error)?.message || t('home:walletconnect.connection_failed'),
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (topic: string) => {
    try {
      await disconnectSession(topic);
      displayMessage('success', t('home:walletconnect.session_disconnected'));
    } catch (error: unknown) {
      console.error('Disconnect error:', error);
      displayMessage(
        'error',
        (error as Error)?.message || t('home:walletconnect.disconnect_failed'),
      );
    }
  };

  const renderConnectTab = () => (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ textAlign: 'center' }}>
        <Title level={4} style={{ marginTop: 8 }}>
          {t('home:walletconnect.connect_dapp')}
        </Title>
        <Text type="secondary">
          {t('home:walletconnect.connect_description')}
        </Text>
      </div>

      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <TextArea
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder={t('home:walletconnect.paste_uri')}
          rows={4}
        />
        <Button
          type="primary"
          block
          size="large"
          loading={connecting}
          disabled={!uri.trim() || !isInitialized}
          onClick={handleConnect}
        >
          {connecting
            ? t('home:walletconnect.connecting')
            : t('home:walletconnect.connect')}
        </Button>
      </Space>

      <div style={{ textAlign: 'center' }}>
        <Text strong>{t('home:walletconnect.supported_chains')}</Text>
        <div className="chain-list">
          {Object.values(blockchains)
            .filter((chain) => chain.chainType === 'evm')
            .map((chain) => (
              <Tag key={chain.chainId} icon={<LinkOutlined />}>
                {chain.name}
              </Tag>
            ))}
        </div>
      </div>
    </Space>
  );

  const renderSessionsTab = () => (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {Object.keys(activeSessions).length === 0 ? (
        <div className="empty-sessions">
          <LinkOutlined
            style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }}
          />
          <Title level={4} type="secondary">
            {t('home:walletconnect.no_sessions')}
          </Title>
          <Text type="secondary">
            {t('home:walletconnect.manage_sessions')}
          </Text>
        </div>
      ) : (
        <List
          dataSource={Object.values(activeSessions)}
          renderItem={(session) => (
            <List.Item>
              <Card
                size="small"
                style={{ width: '100%' }}
                actions={[
                  <Button
                    key="disconnect"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDisconnect(session.topic)}
                  >
                    {t('home:walletconnect.disconnect')}
                  </Button>,
                ]}
              >
                <Card.Meta
                  title={session.peer.metadata.name}
                  description={
                    <Space direction="vertical" size="small">
                      <Text type="secondary">
                        {session.peer.metadata.description}
                      </Text>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {session.peer.metadata.url}
                      </Text>
                    </Space>
                  }
                />
              </Card>
            </List.Item>
          )}
        />
      )}
    </Space>
  );

  const tabItems = [
    {
      key: 'connect',
      label: t('home:walletconnect.connect'),
      children: renderConnectTab(),
    },
    {
      key: 'sessions',
      label: `${t('home:walletconnect.sessions')} (${Object.keys(activeSessions).length})`,
      children: renderSessionsTab(),
    },
  ];

  if (!isInitialized) {
    return null;
  }

  return (
    <Modal
      title={t('home:walletconnect.title')}
      open={open}
      onCancel={() => openAction(false)}
      footer={null}
      style={{ textAlign: 'center', top: 60 }}
    >
      {contextHolder}
      <div style={{ textAlign: 'left' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
          centered
        />
      </div>
    </Modal>
  );
};

export default WalletConnect;
