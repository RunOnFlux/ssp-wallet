import React, { useState, useEffect } from 'react';
import {
  Modal,
  Checkbox,
  List,
  Card,
  Typography,
  Divider,
  Alert,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { SessionProposal } from '../types/modalTypes';
import localForage from 'localforage';
import { isEVMContractDeployed } from '../../../lib/constructTx';
import { cryptos } from '../../../types';
import { useAppSelector } from '../../../hooks';

const { Text, Title } = Typography;

interface ChainInfo {
  chainId: number;
  chainName: string;
  isSupported: boolean;
  isRequired: boolean;
  isSynced: boolean;
  accounts: string[];
  sspChainKey?: string;
  isDefault?: boolean;
  isOriginalUnsupported?: boolean;
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

interface AddressDeploymentStatusProps {
  address: string;
  chain: keyof cryptos;
}

const AddressDeploymentStatus: React.FC<AddressDeploymentStatusProps> = ({
  address,
  chain,
}) => {
  const { t } = useTranslation(['home']);
  const [status, setStatus] = useState<'loading' | 'deployed' | 'not-deployed'>(
    'loading',
  );

  useEffect(() => {
    const checkDeployment = async () => {
      try {
        const isDeployed = await isEVMContractDeployed(address, chain);
        setStatus(isDeployed ? 'deployed' : 'not-deployed');
      } catch (error) {
        console.error('Error checking deployment:', error);
        setStatus('not-deployed');
      }
    };

    checkDeployment();
  }, [address, chain]);

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return (
          <Tooltip
            title={t('home:walletconnect.addressChecking')}
            mouseEnterDelay={0}
            mouseLeaveDelay={0}
          >
            <Spin
              size="small"
              className="loading-spinner"
              style={{ fontSize: '12px' }}
            />
          </Tooltip>
        );
      case 'deployed':
        return (
          <Tooltip
            title={t('home:walletconnect.addressDeployed')}
            mouseEnterDelay={0}
            mouseLeaveDelay={0}
          >
            <CheckCircleOutlined
              className="deployed-icon"
              style={{ color: '#52c41a', fontSize: '14px' }}
            />
          </Tooltip>
        );
      case 'not-deployed':
        return (
          <Tooltip
            title={t('home:walletconnect.addressNotDeployed')}
            mouseEnterDelay={0}
            mouseLeaveDelay={0}
          >
            <ExclamationCircleOutlined
              className="not-deployed-icon"
              style={{ color: '#faad14', fontSize: '14px' }}
            />
          </Tooltip>
        );
    }
  };

  return <span className="address-deployment-status">{getStatusIcon()}</span>;
};

const ConnectionRequestModal: React.FC<ConnectionRequestModalProps> = ({
  proposal,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const [requestedChains, setRequestedChains] = useState<ChainInfo[]>([]);
  const [selectedChains, setSelectedChains] = useState<number[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<
    Record<number, string[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [isDefaultingToEthereum, setIsDefaultingToEthereum] = useState(false);

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
    const originalRequestedChains = [...new Set([...required, ...optional])];
    const evmChains = getEvmChains();
    const chainInfos: ChainInfo[] = [];

    // Check if no chains are requested or Chain ID 0 is requested
    const hasNoChains = originalRequestedChains.length === 0;
    const hasChainId0 = originalRequestedChains.some((chain) => {
      const match = chain.match(/eip155:(\d+)/);
      return match && parseInt(match[1]) === 0;
    });

    // Set state to show user we're defaulting to Ethereum
    if (hasNoChains || hasChainId0) {
      setIsDefaultingToEthereum(true);
    } else {
      setIsDefaultingToEthereum(false);
    }

    // Process original chains first (including Chain ID 0 to show as unsupported)
    for (const chainString of originalRequestedChains) {
      const match = chainString.match(/eip155:(\d+)/);
      if (!match) continue;

      const chainId = parseInt(match[1]);
      const isRequired = required.some((req) => req === chainString);

      if (chainId === 0) {
        // Add Chain ID 0 as unsupported
        chainInfos.push({
          chainId: 0,
          chainName: 'Chain ID 0',
          isSupported: false,
          isRequired,
          isSynced: false,
          accounts: [],
          isOriginalUnsupported: true,
        });
        continue;
      }

      // Find corresponding SSP chain for other chains
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
        chainName:
          sspChain?.name || t('home:walletconnect.unknown_chain', { chainId }),
        isSupported: !!sspChain,
        isRequired,
        isSynced,
        accounts,
        sspChainKey: sspChain?.id,
      });
    }

    // If no chains or Chain ID 0 was requested, add Ethereum as default
    if (hasNoChains || hasChainId0) {
      const hasEthereum = chainInfos.some((chain) => chain.chainId === 1);

      if (!hasEthereum) {
        const ethereumChain = evmChains.find((chain) => chain.chainId === 1);
        let accounts: string[] = [];
        let isSynced = false;

        if (ethereumChain) {
          try {
            const generatedWallets =
              (await localForage.getItem(`wallets-${ethereumChain.id}`)) || {};
            accounts = Object.values(
              generatedWallets as Record<string, string>,
            ).filter((address): address is string => Boolean(address));
            isSynced = accounts.length > 0;
          } catch (error) {
            console.error(
              `Error getting accounts for ${ethereumChain.id}:`,
              error,
            );
          }
        }

        chainInfos.push({
          chainId: 1,
          chainName: ethereumChain?.name || 'Ethereum',
          isSupported: !!ethereumChain,
          isRequired: false, // Default chain is not required
          isSynced,
          accounts,
          sspChainKey: ethereumChain?.id,
          isDefault: true,
        });
      }
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
      // Check if we need to provide Chain ID 0 with Ethereum accounts
      let finalSelectedChains = [...selectedChains];
      let finalSelectedAccounts = { ...selectedAccounts };

      if (isDefaultingToEthereum) {
        const hasChainId0 = requestedChains.some(
          (chain) => chain.chainId === 0,
        );
        const hasChainId1 = selectedChains.includes(1);

        if (hasChainId0 && hasChainId1) {
          // Add Chain ID 0 to the response with the same accounts as Ethereum
          if (!finalSelectedChains.includes(0)) {
            finalSelectedChains = [...finalSelectedChains, 0];
          }
          // Chain ID 0 gets the same accounts as Chain ID 1 (Ethereum)
          finalSelectedAccounts = {
            ...finalSelectedAccounts,
            0: selectedAccounts[1] || [], // Use Ethereum accounts for Chain ID 0
          };

          console.log(
            '🔗 WalletConnect: Providing both Chain ID 0 (requested) and Chain ID 1 (Ethereum) with same accounts:',
            {
              originalRequest: 0,
              ethereumChain: 1,
              finalSelectedChains,
              chainId0Accounts: finalSelectedAccounts[0],
              chainId1Accounts: finalSelectedAccounts[1],
            },
          );
        }
      }

      // Include both Chain ID 0 and Chain ID 1 if defaulting, otherwise just selected chains
      await onApprove(proposal, finalSelectedChains, finalSelectedAccounts);
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
      // Don't re-throw - the modal should close anyway since rejectSession
      // handles cleanup internally, even when rejection fails
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

      {/* Important info about chain-specific addresses */}
      <Alert
        message={t('home:walletconnect.chain_unique_addresses')}
        description={t('home:walletconnect.chain_unique_addresses_desc')}
        type="info"
        style={{ marginBottom: 16 }}
        showIcon
      />

      {/* Account Abstraction deployment info */}
      <Alert
        message={t('home:walletconnect.account_abstraction_deployment_info')}
        description={t(
          'home:walletconnect.account_abstraction_deployment_desc',
        )}
        type="warning"
        style={{ marginBottom: 16 }}
        showIcon
      />

      {/* Show alert when defaulting to Ethereum */}
      {isDefaultingToEthereum && (
        <Alert
          message={t('home:walletconnect.defaulting_to_ethereum')}
          description={t('home:walletconnect.defaulting_to_ethereum_desc')}
          type="info"
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

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

      {/* Chain Compatibility Warning - when user is on non-EVM chain but dApp requests EVM methods */}
      {blockchains[activeChain].chainType !== 'evm' &&
        requestedChains.some((chain) => chain.isSupported) && (
          <Alert
            message={t('home:walletconnect.chain_compatibility_notice')}
            description={
              <div>
                <div style={{ marginBottom: 8 }}>
                  {t('home:walletconnect.chain_compatibility_desc_1', {
                    chainName: blockchains[activeChain].name,
                  })}
                </div>
                <div>{t('home:walletconnect.chain_compatibility_desc_2')}</div>
              </div>
            }
            type="info"
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}

      <div style={{ marginBottom: 16 }}>
        <Title level={5}>{t('home:walletconnect.requested_chains')}:</Title>
        <div style={{ marginTop: 4, fontSize: '12px', color: '#666' }}>
          {requestedChains.map((chain, index) => (
            <span key={chain.chainId}>
              {chain.chainName}
              {chain.isRequired && <span style={{ color: '#ff4d4f' }}> *</span>}
              {chain.isOriginalUnsupported && (
                <span style={{ color: '#faad14' }}>
                  {' '}
                  ({t('home:walletconnect.unsupported')})
                </span>
              )}
              {chain.isDefault && (
                <span style={{ color: '#52c41a' }}>
                  {' '}
                  ({t('home:walletconnect.defaulting')})
                </span>
              )}
              {!chain.isSupported && !chain.isOriginalUnsupported && (
                <span style={{ color: '#faad14' }}>
                  {' '}
                  ({t('home:walletconnect.unsupported')})
                </span>
              )}
              {chain.isSupported && !chain.isSynced && !chain.isDefault && (
                <span style={{ color: '#1890ff' }}>
                  {' '}
                  ({t('home:walletconnect.unsynced')})
                </span>
              )}
              {index < requestedChains.length - 1 && ', '}
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
                                <span
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                  }}
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
                                  {chainInfo.sspChainKey && (
                                    <AddressDeploymentStatus
                                      address={account}
                                      chain={
                                        chainInfo.sspChainKey as keyof cryptos
                                      }
                                    />
                                  )}
                                </span>
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

      <Alert
        message={t('home:walletconnect.security_warning')}
        description={t('home:walletconnect.connection_warning')}
        type="warning"
        style={{ marginTop: 16 }}
        showIcon
      />
    </Modal>
  );
};

export default ConnectionRequestModal;
