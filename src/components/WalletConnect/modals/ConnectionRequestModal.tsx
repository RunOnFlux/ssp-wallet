import React, { useState, useEffect } from 'react';
import { Modal, Checkbox, List, Card, Typography, Divider, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { SessionProposal } from '../types/modalTypes';
import localForage from 'localforage';

const { Text, Title } = Typography;

interface ChainInfo {
  chainId: number;
  chainName: string;
  isSupported: boolean;
  isRequired: boolean;
  isSynced: boolean;
  accounts: string[];
  sspChainKey?: string;
}

interface ConnectionRequestModalProps {
  proposal: SessionProposal | null;
  onApprove: (
    proposal: SessionProposal,
    selectedChains: number[],
    selectedAccounts: Record<number, string[]>,
  ) => Promise<unknown>;
  onReject: (proposal: SessionProposal) => Promise<void>;
}

const ConnectionRequestModal: React.FC<ConnectionRequestModalProps> = ({
  proposal,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation(['home', 'common']);
  const [requestedChains, setRequestedChains] = useState<ChainInfo[]>([]);
  const [selectedChains, setSelectedChains] = useState<number[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<
    Record<number, string[]>
  >({});
  const [loading, setLoading] = useState(false);

  // Get all EVM chains and their configurations
  const getEvmChains = () => {
    return Object.entries(blockchains)
      .filter(([, config]) => config.chainType === 'evm')
      .map(([key, config]) => ({
        id: key,
        chainId: parseInt(config.chainId!),
        name: config.name,
        symbol: config.symbol,
        rpcUrl: `https://${config.node}`,
        blockExplorer: config.api || '',
      }));
  };

  // Get all chains requested by the dApp (from both required and optional namespaces)
  const getAllRequestedChains = () => {
    if (!proposal) return { required: [], optional: [] };

    const requiredChains: string[] = [];
    const optionalChains: string[] = [];

    // Get required chains
    Object.values(proposal.params.requiredNamespaces || {}).forEach((ns) => {
      const namespace = ns as { chains?: string[] };
      if (namespace.chains) {
        requiredChains.push(...namespace.chains);
      }
    });

    // Get optional chains
    Object.values(proposal.params.optionalNamespaces || {}).forEach((ns) => {
      const namespace = ns as { chains?: string[] };
      if (namespace.chains) {
        optionalChains.push(...namespace.chains);
      }
    });

    return { required: requiredChains, optional: optionalChains };
  };

  // Parse chain information and determine support status
  const parseRequestedChains = async (): Promise<ChainInfo[]> => {
    const { required, optional } = getAllRequestedChains();
    const allRequestedChains = [...new Set([...required, ...optional])];
    const evmChains = getEvmChains();
    const chainInfos: ChainInfo[] = [];

    for (const chainString of allRequestedChains) {
      const match = chainString.match(/eip155:(\d+)/);
      if (!match) continue;

      const chainId = parseInt(match[1]);
      const isRequired = required.some((req) => req === chainString);

      // Find corresponding SSP chain
      const sspChain = evmChains.find((chain) => chain.chainId === chainId);

      let accounts: string[] = [];
      let isSynced = false;

      if (sspChain) {
        try {
          const generatedWallets =
            (await localForage.getItem(`wallets-${sspChain.id}`)) || {};
          accounts = Object.values(
            generatedWallets as Record<string, string>,
          ).filter((address): address is string => Boolean(address));
          isSynced = accounts.length > 0;
        } catch (error) {
          console.error(`Error getting accounts for ${sspChain.id}:`, error);
        }
      }

      chainInfos.push({
        chainId,
        chainName: sspChain?.name || `Chain ${chainId}`,
        isSupported: !!sspChain,
        isRequired,
        isSynced,
        accounts,
        sspChainKey: sspChain?.id,
      });
    }

    return chainInfos;
  };

  // Load requested chains and their sync status
  useEffect(() => {
    const loadRequestedChains = async () => {
      if (!proposal) return;

      const chains = await parseRequestedChains();
      setRequestedChains(chains);

      // Auto-select required chains that are synced
      const autoSelectedChains: number[] = [];
      const autoSelectedAccounts: Record<number, string[]> = {};

      chains.forEach((chain) => {
        if (chain.isRequired && chain.isSynced) {
          autoSelectedChains.push(chain.chainId);
          // Only select the first address instead of all addresses
          autoSelectedAccounts[chain.chainId] =
            chain.accounts.length > 0 ? [chain.accounts[0]] : [];
        }
      });

      setSelectedChains(autoSelectedChains);
      setSelectedAccounts(autoSelectedAccounts);
    };

    void loadRequestedChains();
  }, [proposal]);

  // Early return after all hooks are called
  if (!proposal) return null;

  const { proposer } = proposal.params;

  const handleChainToggle = (chainId: number, checked: boolean) => {
    if (checked) {
      setSelectedChains((prev) => [...prev, chainId]);
      // Auto-select only the first account for the chain
      const chainData = requestedChains.find((c) => c.chainId === chainId);
      if (chainData && chainData.accounts.length > 0) {
        setSelectedAccounts((prev) => ({
          ...prev,
          [chainId]: [chainData.accounts[0]], // Only select first address
        }));
      }
    } else {
      setSelectedChains((prev) => prev.filter((id) => id !== chainId));
      setSelectedAccounts((prev) => {
        const updated = { ...prev };
        delete updated[chainId];
        return updated;
      });
    }
  };

  const handleAccountToggle = (
    chainId: number,
    account: string,
    checked: boolean,
  ) => {
    setSelectedAccounts((prev) => {
      const chainAccounts = prev[chainId] || [];
      if (checked) {
        return {
          ...prev,
          [chainId]: [...chainAccounts, account],
        };
      } else {
        return {
          ...prev,
          [chainId]: chainAccounts.filter((addr) => addr !== account),
        };
      }
    });
  };

  const handleApprove = async () => {
    if (selectedChains.length === 0) {
      return;
    }

    setLoading(true);
    try {
      await onApprove(proposal, selectedChains, selectedAccounts);
    } catch (error) {
      console.error('Error approving session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      await onReject(proposal);
    } catch (error) {
      console.error('Error rejecting session:', error);
    }
  };

  const requiredChainIds = requestedChains
    .filter((c) => c.isRequired)
    .map((c) => c.chainId);
  const hasRequiredChains = requiredChainIds.every(
    (chainId) =>
      selectedChains.includes(chainId) &&
      (selectedAccounts[chainId]?.length || 0) > 0,
  );

  const unsupportedChains = requestedChains.filter((c) => !c.isSupported);
  const unsyncedChains = requestedChains.filter(
    (c) => c.isSupported && !c.isSynced,
  );
  const syncedChains = requestedChains.filter((c) => c.isSynced);

  return (
    <Modal
      title={t('home:walletconnect.connection_request')}
      open={true}
      width={700}
      onOk={handleApprove}
      onCancel={handleReject}
      okText={t('home:walletconnect.approve')}
      cancelText={t('home:walletconnect.reject')}
      confirmLoading={loading}
      okButtonProps={{
        disabled: selectedChains.length === 0 || !hasRequiredChains,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <strong>{t('home:walletconnect.dapp_wants_to_connect')}</strong>
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong>{t('home:walletconnect.dapp_name')}:</strong>{' '}
        {proposer.metadata.name}
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong>{t('home:walletconnect.description')}:</strong>{' '}
        {proposer.metadata.description}
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong>{t('home:walletconnect.url')}:</strong> {proposer.metadata.url}
      </div>

      <Divider />

      {/* Show warnings for unsupported or unsynced chains */}
      {unsupportedChains.length > 0 && (
        <Alert
          message={t('home:walletconnect.unsupported_chains_warning')}
          description={
            <div>
              {t('home:walletconnect.unsupported_chains_list')}:{' '}
              {unsupportedChains.map((c) => c.chainName).join(', ')}
            </div>
          }
          type="warning"
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {unsyncedChains.length > 0 && (
        <Alert
          message={t('home:walletconnect.unsynced_chains_warning')}
          description={
            <div>
              <div>
                {t('home:walletconnect.unsynced_chains_list')}:{' '}
                {unsyncedChains.map((c) => c.chainName).join(', ')}
              </div>
            </div>
          }
          type="info"
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {syncedChains.length === 0 && (
        <Alert
          message={t('home:walletconnect.no_compatible_chains')}
          description={t('home:walletconnect.no_compatible_chains_desc')}
          type="error"
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <Title level={5}>{t('home:walletconnect.requested_chains')}:</Title>
        <div style={{ marginTop: 4, fontSize: '12px', color: '#666' }}>
          {requestedChains.map((chain) => (
            <span key={chain.chainId} style={{ marginRight: 8 }}>
              {chain.chainName}
              {chain.isRequired && <span style={{ color: '#ff4d4f' }}> *</span>}
              {!chain.isSupported && (
                <span style={{ color: '#faad14' }}>
                  {' '}
                  ({t('home:walletconnect.unsupported')})
                </span>
              )}
              {chain.isSupported && !chain.isSynced && (
                <span style={{ color: '#1890ff' }}>
                  {' '}
                  ({t('home:walletconnect.unsynced')})
                </span>
              )}
            </span>
          ))}
        </div>
        {requestedChains.some((chain) => chain.isRequired) && (
          <div style={{ fontSize: '11px', color: '#ff4d4f', marginTop: 8 }}>
            <span style={{ color: '#ff4d4f' }}>*</span>{' '}
            {t('home:walletconnect.required_explanation')}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <Title level={5}>{t('home:walletconnect.permissions')}:</Title>
        <div style={{ marginTop: 4, fontSize: '12px', color: '#666' }}>
          {[
            ...Object.values(proposal.params.requiredNamespaces || {}),
            ...Object.values(proposal.params.optionalNamespaces || {}),
          ]
            .flatMap((ns) => (ns as { methods?: string[] }).methods || [])
            .filter((method, index, array) => array.indexOf(method) === index) // Remove duplicates
            .join(', ')}
        </div>
      </div>

      <Divider />

      {syncedChains.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Title level={5}>
            {t('home:walletconnect.select_chains_accounts')}:
          </Title>

          {!hasRequiredChains && requiredChainIds.length > 0 && (
            <Alert
              message={t('home:walletconnect.required_chains_warning')}
              type="warning"
              style={{ marginBottom: 16 }}
              showIcon
            />
          )}

          <List
            dataSource={syncedChains}
            renderItem={(chainInfo) => {
              const isSelected = selectedChains.includes(chainInfo.chainId);

              return (
                <List.Item style={{ padding: 0, marginBottom: 16 }}>
                  <Card
                    style={{ width: '100%' }}
                    size="small"
                    title={
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) =>
                          handleChainToggle(chainInfo.chainId, e.target.checked)
                        }
                      >
                        <span style={{ fontWeight: 'bold' }}>
                          {chainInfo.chainName}
                          {chainInfo.isRequired && (
                            <span style={{ color: '#ff4d4f' }}> *</span>
                          )}
                        </span>
                      </Checkbox>
                    }
                  >
                    {isSelected && (
                      <div>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {t('home:walletconnect.select_accounts')}:
                        </Text>
                        <div style={{ marginTop: 8 }}>
                          {chainInfo.accounts.map((account) => (
                            <div key={account} style={{ marginBottom: 4 }}>
                              <Checkbox
                                checked={(
                                  selectedAccounts[chainInfo.chainId] || []
                                ).includes(account)}
                                onChange={(e) =>
                                  handleAccountToggle(
                                    chainInfo.chainId,
                                    account,
                                    e.target.checked,
                                  )
                                }
                              >
                                <Text
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                  }}
                                >
                                  {account.substring(0, 6)}...
                                  {account.substring(account.length - 4)}
                                </Text>
                              </Checkbox>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                </List.Item>
              );
            }}
          />
        </div>
      )}

      <div
        style={{
          backgroundColor: '#f6f8fa',
          padding: '12px',
          borderRadius: '4px',
          marginTop: '16px',
        }}
      >
        <div style={{ fontSize: '12px', color: '#666' }}>
          {t('home:walletconnect.connection_warning')}
        </div>
      </div>
    </Modal>
  );
};

export default ConnectionRequestModal;
