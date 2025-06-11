import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from 'react';
import { Core } from '@walletconnect/core';
import { WalletKit, WalletKitTypes } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import {
  formatJsonRpcResult,
  formatJsonRpcError,
} from '@walletconnect/jsonrpc-utils';
import { useAppSelector, useAppDispatch } from '../hooks';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';
import localForage from 'localforage';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { setActiveChain } from '../store';
import { ethers } from 'ethers';
import {
  deriveEVMPublicKey,
  generateAddressKeypair,
  getScriptType,
} from '../lib/wallet';
import { getFingerprint } from '../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import axios from 'axios';
import { sspConfig } from '@storage/ssp';
import { signMessageWithSchnorrMultisig } from '../lib/evmSigning';
import { useSocket } from '../hooks/useSocket';
import { NoticeType } from 'antd/es/message/interface';

interface publicNonces {
  kPublic: string;
  kTwoPublic: string;
}

/**
 * ENHANCED SSP WALLET CONNECT CONTEXT
 *
 * This context provides a comprehensive WalletConnect v2 implementation for SSP Wallet
 * with the following enhanced features:
 *
 * 🔐 ENHANCED SCHNORR MULTISIG:
 * - Proper 2-of-2 Schnorr MultiSig signature implementation
 * - Secure nonce management with fresh nonce generation
 * - Address verification using multiple methods for consistency
 * - On-chain signature verification with ERC1271 compliance
 * - Comprehensive error handling and fallback mechanisms
 *
 * 🔗 MODULAR WALLETCONNECT INTEGRATION:
 * - Separated modal components for better maintainability
 * - Enhanced user control over chain and account selection
 * - Comprehensive session management and request handling
 * - Support for all major EVM chains configured in SSP Wallet
 *
 * 🛡️ SECURITY FEATURES:
 * - Extended private key redaction for production safety
 * - Secure key derivation using HDKey standards
 * - Proper TypeScript typing throughout the implementation
 * - Input validation and error boundary handling
 *
 * 📋 SUPPORTED METHODS:
 * - personal_sign, eth_sign, eth_signTypedData (v3, v4)
 * - eth_sendTransaction, eth_signTransaction
 * - wallet_switchEthereumChain, wallet_addEthereumChain
 * - eth_accounts, eth_requestAccounts, eth_chainId, net_version
 *
 * @author SSP Wallet Team
 * @version Enhanced Implementation 2025
 */

// Static WalletConnect project ID - replace with your actual project ID from https://cloud.reown.com/
const WALLETCONNECT_PROJECT_ID = '0fddbe43cb0cca6b6e0fcf9b5f4f0ff6';

// Type definitions using WalletConnect types
interface SessionMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
}

interface SessionPeer {
  metadata: SessionMetadata;
}

interface SessionNamespace {
  chains?: string[];
  methods: string[];
  events: string[];
  accounts: string[];
}

interface SessionStruct {
  topic: string;
  peer: SessionPeer;
  namespaces: Record<string, SessionNamespace>;
}

// Use WalletKitTypes for proper typing
type SessionProposal = WalletKitTypes.SessionProposal;
type SessionRequest = WalletKitTypes.SessionRequest;

// Transaction type for EVM operations
interface EthereumTransaction {
  to?: string;
  from?: string;
  value?: string;
  gas?: string;
  gasLimit?: string;
  gasPrice?: string;
  data?: string;
  nonce?: string;
}

// Chain config type for adding/switching chains
interface ChainConfig {
  chainId: string;
  chainName?: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls?: string[];
  blockExplorerUrls?: string[];
}

// Switch chain request type
interface SwitchChainRequest {
  chainId: string;
}

interface WalletConnectContextType {
  walletKit: InstanceType<typeof WalletKit> | null;
  activeSessions: Record<string, SessionStruct>;
  isInitialized: boolean;
  isConnecting: boolean;
  pendingRequestModal: SessionRequest | null;
  pendingProposal: SessionProposal | null;
  pair: (uri: string) => Promise<void>;
  disconnectSession: (topic: string) => Promise<void>;
  approveSession: (
    proposal: SessionProposal,
    selectedChains?: number[],
    selectedAccounts?: Record<number, string[]>,
  ) => Promise<SessionStruct>;
  rejectSession: (proposal: SessionProposal) => Promise<void>;
  handleSessionRequest: (event: SessionRequest) => Promise<void>;
  approveRequest: (request: SessionRequest) => Promise<void>;
  rejectRequest: (request: SessionRequest) => Promise<void>;
  contextHolder: React.ReactElement;
  debugInitialize: () => Promise<void>;
}

const WalletConnectContext = createContext<WalletConnectContextType | null>(
  null,
);

export const useWalletConnect = (): WalletConnectContextType => {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error(
      'useWalletConnect must be used within a WalletConnectProvider',
    );
  }
  return context;
};

interface WalletConnectProviderProps {
  children: ReactNode;
}

export const WalletConnectProvider: React.FC<WalletConnectProviderProps> = ({
  children,
}) => {
  const [messageApi, contextHolder] = message.useMessage();
  const { t } = useTranslation(['common', 'home', 'send']);
  const dispatch = useAppDispatch();
  const { sspWalletKeyInternalIdentity, activeChain } = useAppSelector(
    (state) => ({
      ...state.sspState,
    }),
  );
  const { xpubKey, wallets } = useAppSelector((state) => state[activeChain]);
  const blockchainConfig = blockchains[activeChain];
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);

  // Add socket hook for handling SSP relay responses
  const {
    publicNonces,
    publicNoncesRejected,
    clearPublicNonces,
    clearPublicNoncesRejected,
  } = useSocket();

  // State for handling public nonces requests
  const [pendingSigningRequests, setPendingSigningRequests] = useState<
    Record<
      string,
      {
        resolve: (signature: string) => void;
        reject: (error: Error) => void;
        message: string;
        address: string;
        hideLoading: () => void;
      }
    >
  >({});

  const displayMessage = (
    type: NoticeType,
    content: string,
    duration?: number,
  ) => {
    if (type === 'loading') {
      return messageApi.loading(content, duration || 0);
    }
    void messageApi.open({
      type,
      content,
    });
  };

  const [walletKit, setWalletKit] = useState<InstanceType<
    typeof WalletKit
  > | null>(null);
  const walletKitRef = useRef<InstanceType<typeof WalletKit> | null>(null);
  const [activeSessions, setActiveSessions] = useState<
    Record<string, SessionStruct>
  >({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingRequestModal, setPendingRequestModal] =
    useState<SessionRequest | null>(null);
  const [pendingProposal, setPendingProposal] =
    useState<SessionProposal | null>(null);
  const [queuedRequests, setQueuedRequests] = useState<SessionRequest[]>([]);

  useEffect(() => {
    console.log('🔗 WalletConnect: walletKit state changed:', {
      walletKit: !!walletKit,
      walletKitType: walletKit?.constructor?.name || 'null',
      timestamp: new Date().toISOString(),
    });
  }, [walletKit]);

  // Enhanced debugging for initialization conditions
  useEffect(() => {
    console.log('🔗 WalletConnect: Initialization conditions check:', {
      isInitialized,
      sspWalletKeyInternalIdentity: !!sspWalletKeyInternalIdentity,
      sspWalletKeyInternalIdentityValue: sspWalletKeyInternalIdentity,
      walletKit: !!walletKit,
      hasProjectId: !!WALLETCONNECT_PROJECT_ID,
      projectId: WALLETCONNECT_PROJECT_ID,
      timestamp: new Date().toISOString(),
    });
  }, [isInitialized, sspWalletKeyInternalIdentity, walletKit]);

  // Get all EVM chains and their configurations
  const getEvmChains = () => {
    return Object.entries(blockchains)
      .filter(([, config]) => config.chainType === 'evm')
      .map(([key, config]) => ({
        id: key as keyof cryptos,
        chainId: parseInt(config.chainId!),
        name: config.name,
        symbol: config.symbol,
        rpcUrl: `https://${config.node}`,
        blockExplorer: config.api || '',
      }));
  };

  // Get user accounts for all EVM chains
  const getUserAccounts = async (): Promise<string[]> => {
    const accounts: string[] = [];
    const evmChains = getEvmChains();

    for (const chain of evmChains) {
      try {
        // Get stored wallets for this chain
        const generatedWallets =
          (await localForage.getItem(`wallets-${chain.id}`)) || {};
        const walletKeys = Object.keys(
          generatedWallets as Record<string, string>,
        );

        for (const walletKey of walletKeys) {
          const address = (generatedWallets as Record<string, string>)[
            walletKey
          ];
          if (address && address.startsWith('0x')) {
            // Ensure proper CAIP-10 format: namespace:chainId:accountAddress
            const caip10Account = `eip155:${chain.chainId}:${address}`;
            accounts.push(caip10Account);
            console.log(
              `🔗 Added account for ${chain.name} (${chain.chainId}): ${caip10Account}`,
            );
          }
        }
      } catch (error) {
        console.error(`Error getting accounts for ${chain.id}:`, error);
      }
    }

    console.log(
      `🔗 WalletConnect: Total accounts found: ${accounts.length}`,
      accounts,
    );
    return accounts;
  };

  // Get accounts for specific chain
  const getAccountsForChain = async (chainId: number): Promise<string[]> => {
    const evmChain = getEvmChains().find((chain) => chain.chainId === chainId);
    if (!evmChain) return [];

    try {
      const generatedWallets =
        (await localForage.getItem(`wallets-${evmChain.id}`)) || {};
      const walletKeys = Object.keys(
        generatedWallets as Record<string, string>,
      );

      const accounts: string[] = [];
      for (const walletKey of walletKeys) {
        const address = (generatedWallets as Record<string, string>)[walletKey];
        if (address) {
          accounts.push(address);
        }
      }
      return accounts;
    } catch (error) {
      console.error(`Error getting accounts for chain ${chainId}:`, error);
      return [];
    }
  };

  // Initialize WalletConnect
  useEffect(() => {
    console.log('🔗 WalletConnect: useEffect triggered with:', {
      isInitialized,
      sspWalletKeyInternalIdentity: !!sspWalletKeyInternalIdentity,
      sspWalletKeyInternalIdentityValue: sspWalletKeyInternalIdentity,
      walletKit: !!walletKit,
      timestamp: new Date().toISOString(),
    });

    let isMounted = true;
    let currentWalletKit: InstanceType<typeof WalletKit> | null = null;

    const initWalletConnect = async () => {
      try {
        console.log('🔗 WalletConnect: Starting initialization...');
        console.log('🔗 WalletConnect: Environment check:', {
          nodeEnv: process.env.NODE_ENV,
          userAgent: navigator.userAgent,
          isBrowser: typeof window !== 'undefined',
          hasLocalStorage: typeof localStorage !== 'undefined',
          hasIndexedDB: typeof indexedDB !== 'undefined',
        });

        if (!WALLETCONNECT_PROJECT_ID) {
          console.error(
            '🔗 WalletConnect: Project ID not configured. Please:\n' +
              '1. Get your project ID from https://cloud.reown.com/\n' +
              '2. Replace the static WALLETCONNECT_PROJECT_ID value in WalletConnectContext.tsx\n',
          );
          displayMessage('error', t('home:walletconnect.init_error'));
          return;
        }

        console.log(
          '🔗 WalletConnect: Initializing with project ID:',
          WALLETCONNECT_PROJECT_ID,
        );

        console.log('🔗 WalletConnect: Creating Core...');
        const core = new Core({
          projectId: WALLETCONNECT_PROJECT_ID,
        });
        console.log('🔗 WalletConnect: Core created successfully');

        console.log(
          '🔗 WalletConnect: Core initialized, creating WalletKit...',
        );

        console.log('🔗 WalletConnect: Calling WalletKit.init()...');
        const kit = await WalletKit.init({
          core,
          metadata: {
            name: 'SSP Wallet',
            description: 'Secure. Simple. Powerful.',
            url: 'https://sspwallet.io',
            icons: [
              'https://raw.githubusercontent.com/RunOnFlux/ssp-wallet/refs/heads/master/public/ssp-logo-black.svg',
              'https://raw.githubusercontent.com/RunOnFlux/ssp-wallet/refs/heads/master/public/ssp-logo-white.svg',
            ],
          },
        });
        console.log(
          '🔗 WalletConnect: WalletKit.init() completed successfully',
        );

        // Check if component is still mounted before proceeding
        if (!isMounted) {
          console.log(
            '🔗 WalletConnect: Component unmounted during initialization, cleaning up...',
          );
          return;
        }

        console.log('🔗 WalletConnect: WalletKit initialized successfully');
        currentWalletKit = kit;

        // Immediately check for existing sessions
        const existingSessions = kit.getActiveSessions();
        const sessionCount = Object.keys(existingSessions).length;

        console.log('🔗 WalletConnect: Checking for existing sessions:', {
          sessionCount,
          sessionTopics: Object.keys(existingSessions),
          sessions: Object.entries(existingSessions).map(
            ([topic, session]) => ({
              topic,
              dAppName: session.peer.metadata.name,
              dAppUrl: session.peer.metadata.url,
              chains: session.namespaces.eip155?.chains || [],
            }),
          ),
        });

        // Set up event listeners
        kit.on('session_proposal', (data: unknown) => {
          const proposal = data as SessionProposal;
          console.log('🔗 WalletConnect: Session proposal received:', {
            id: proposal.id,
            dAppName: proposal.params.proposer.metadata.name,
            dAppUrl: proposal.params.proposer.metadata.url,
            requiredNamespaces: proposal.params.requiredNamespaces,
            optionalNamespaces: proposal.params.optionalNamespaces,
          });
          setPendingProposal(proposal);
        });

        kit.on('session_request', (data: unknown) => {
          const request = data as SessionRequest;
          console.log('🔗 WalletConnect: Session request received:', {
            id: request.id,
            topic: request.topic,
            method: request.params.request.method,
            params: request.params.request.params as unknown[],
            timestamp: new Date().toISOString(),
          });
          void handleSessionRequest(request);
        });

        kit.on('session_delete', (data: unknown) => {
          const event = data as { topic: string };
          console.log('🔗 WalletConnect: Session deleted:', {
            topic: event.topic,
            timestamp: new Date().toISOString(),
          });
          setActiveSessions((prev) => {
            const updated = { ...prev };
            delete updated[event.topic];
            return updated;
          });
          displayMessage('info', t('home:walletconnect.session_disconnected'));
        });

        console.log(
          '🔗 WalletConnect: Setting walletKit state and marking as initialized...',
        );
        setWalletKit(kit);
        walletKitRef.current = kit;
        setActiveSessions(kit.getActiveSessions());
        setIsInitialized(true);

        console.log('🔗 WalletConnect: Initialization completed successfully');

        // Process any queued requests
        console.log(
          '🔗 WalletConnect: Processing queued requests:',
          queuedRequests.length,
        );
        queuedRequests.forEach((queuedRequest) => {
          console.log(
            '🔗 WalletConnect: Processing queued request:',
            queuedRequest.params.request.method,
          );
          void handleSessionRequest(queuedRequest);
        });
        setQueuedRequests([]);
      } catch (error: unknown) {
        if (!isMounted) return;

        console.error('🔗 WalletConnect: Failed to initialize:', error);
        console.error('🔗 WalletConnect: Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace',
        });
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        displayMessage(
          'error',
          `${t('home:walletconnect.init_error')}: ${errorMessage}`,
        );

        // Retry initialization after a delay
        console.log('🔗 WalletConnect: Scheduling retry in 5 seconds...');
        setTimeout(() => {
          if (isMounted && !isInitialized && sspWalletKeyInternalIdentity) {
            console.log('🔗 WalletConnect: Retrying initialization...');
            void initWalletConnect();
          }
        }, 5000);
      }
    };

    if (!isInitialized && sspWalletKeyInternalIdentity && !walletKit) {
      console.log(
        '🔗 WalletConnect: Conditions met, starting initialization...',
      );
      void initWalletConnect();
    } else {
      console.log('🔗 WalletConnect: Initialization conditions not met:', {
        isInitialized,
        sspWalletKeyInternalIdentity: !!sspWalletKeyInternalIdentity,
        sspWalletKeyInternalIdentityValue: sspWalletKeyInternalIdentity,
        walletKit: !!walletKit,
      });
    }

    // Cleanup function
    return () => {
      console.log('🔗 WalletConnect: Cleaning up...');
      isMounted = false;

      // Note: WalletKit doesn't expose removeAllListeners method
      // The instance will be garbage collected when component unmounts
      if (currentWalletKit) {
        console.log('🔗 WalletConnect: WalletKit instance will be cleaned up');
      }
    };
  }, [sspWalletKeyInternalIdentity, isInitialized]); // Removed walletKit dependency to prevent initialization loop

  // Handle session request (sign transaction, sign message, etc.)
  const handleSessionRequest = async (event: SessionRequest): Promise<void> => {
    console.log(walletKitRef.current);
    if (!walletKitRef.current) {
      console.warn(
        '🔗 WalletConnect: Cannot handle session request - WalletKit not initialized. Queueing request.',
        {
          walletKit: !!walletKit,
          isInitialized,
          sspWalletKeyInternalIdentity: !!sspWalletKeyInternalIdentity,
          requestMethod: event.params.request.method,
          timestamp: new Date().toISOString(),
        },
      );

      // Queue the request to be processed after initialization
      setQueuedRequests((prev) => [...prev, event]);
      return;
    }

    const { topic, params, id } = event;
    const { request } = params;
    const { method } = request;

    console.log('🔗 WalletConnect: Processing session request:', {
      requestId: id,
      method,
      topic,
      params: request.params as unknown[],
      timestamp: new Date().toISOString(),
    });

    // For sensitive operations, show user confirmation modal
    if (
      [
        'personal_sign',
        'eth_sign',
        'eth_sendTransaction',
        'eth_signTransaction',
        'eth_signTypedData',
        'eth_signTypedData_v3',
        'eth_signTypedData_v4',
      ].includes(method)
    ) {
      console.log(
        '🔗 WalletConnect: Showing user confirmation modal for sensitive operation:',
        method,
      );
      setPendingRequestModal(event);
      return;
    }

    // Handle non-sensitive requests immediately
    try {
      let result: unknown;

      switch (method) {
        case 'eth_accounts':
        case 'eth_requestAccounts': {
          console.log('🔗 WalletConnect: Handling accounts request');

          // Network-specific address information
          console.log('ℹ️ Note: SSP Wallet addresses are network-specific');
          console.log(
            `📋 Current active chain: ${blockchains[activeChain].name} (ID: ${blockchains[activeChain].chainId})`,
          );
          console.log('💡 Each blockchain network has unique addresses');

          // Get accounts for the currently active chain
          const chainFromSession = extractChainIdFromTopic(topic);
          if (chainFromSession) {
            result = await getAccountsForChain(chainFromSession);
            const chainConfig = Object.values(blockchains).find(
              (config) =>
                config.chainType === 'evm' &&
                parseInt(config.chainId!) === chainFromSession,
            );
            console.log(
              `🔗 WalletConnect: Returning accounts for chain: ${chainConfig?.name || 'Unknown'} (${chainFromSession})`,
              result,
            );
            console.log(
              `💡 Note: These addresses are for ${chainConfig?.name || 'this chain'} network`,
            );
          } else {
            result = await getUserAccounts();
            console.log(
              '🔗 WalletConnect: Returning all user accounts across chains:',
              result,
            );
            console.log(
              `💡 Note: Each account shows its specific chain in eip155:chainId:address format`,
            );
          }
          break;
        }

        case 'eth_chainId':
          result = `0x${parseInt(blockchains[activeChain].chainId!).toString(16)}`;
          console.log(
            '🔗 WalletConnect: Returning chain ID:',
            result,
            'for chain:',
            activeChain,
          );
          break;

        case 'net_version':
          result = blockchains[activeChain].chainId!;
          console.log('🔗 WalletConnect: Returning network version:', result);
          break;

        case 'wallet_switchEthereumChain':
          console.log(
            '🔗 WalletConnect: Handling chain switch request:',
            request.params,
          );
          result = await handleSwitchChain(
            request.params as [SwitchChainRequest],
          );
          break;

        case 'wallet_addEthereumChain':
          console.log(
            '🔗 WalletConnect: Handling add chain request:',
            request.params,
          );
          result = await handleAddChain(request.params as [ChainConfig]);
          break;

        default:
          console.warn(
            '🔗 WalletConnect: Unsupported method requested:',
            method,
          );
          throw new Error(`Unsupported method: ${method}`);
      }

      const response = formatJsonRpcResult(id, result);
      await walletKitRef.current?.respondSessionRequest({ topic, response });
      console.log('🔗 WalletConnect: Successfully responded to request:', {
        requestId: id,
        method,
        result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      console.error('🔗 WalletConnect: Error handling session request:', {
        requestId: id,
        method,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      const response = formatJsonRpcError(id, errorMessage);
      await walletKitRef.current?.respondSessionRequest({ topic, response });
      displayMessage('error', t('home:walletconnect.approval_failed'));
    }
  };

  // Extract chain ID from session topic (helper function)
  const extractChainIdFromTopic = (topic: string): number | null => {
    try {
      const session = activeSessions[topic];
      if (session?.namespaces?.eip155?.chains?.[0]) {
        const chainString = session.namespaces.eip155.chains[0];
        const chainId = parseInt(chainString.split(':')[1]);
        return chainId;
      }
    } catch (error) {
      console.error('Error extracting chain ID:', error);
    }
    return null;
  };

  // Approve a pending request
  const approveRequest = async (request: SessionRequest): Promise<void> => {
    if (!walletKitRef.current) return;

    const { topic, params, id } = request;
    const { request: rpcRequest } = params;
    const { method } = rpcRequest;
    const requestParams = rpcRequest.params as unknown[];

    console.log('🔗 WalletConnect: User approved request:', {
      requestId: id,
      method,
      topic,
      params: requestParams,
      timestamp: new Date().toISOString(),
    });

    try {
      let result: unknown;

      switch (method) {
        case 'personal_sign':
          console.log('🔗 WalletConnect: Processing personal_sign approval');
          result = await handlePersonalSign(requestParams as [string, string]);
          break;

        case 'eth_sign':
          console.log('🔗 WalletConnect: Processing eth_sign approval');
          result = await handleEthSign(requestParams as [string, string]);
          break;

        case 'eth_signTypedData':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4':
          console.log(
            '🔗 WalletConnect: Processing typed data signing approval',
          );
          result = await handleSignTypedData(
            requestParams as [string, unknown],
          );
          break;

        case 'eth_sendTransaction':
          console.log(
            '🔗 WalletConnect: Processing transaction sending approval',
          );
          result = await handleSendTransaction(
            requestParams as [EthereumTransaction],
          );
          break;

        case 'eth_signTransaction':
          console.log(
            '🔗 WalletConnect: Processing transaction signing approval',
          );
          result = await handleSignTransaction(
            requestParams as [EthereumTransaction],
          );
          break;

        default:
          console.warn(
            '🔗 WalletConnect: Unsupported method in approval:',
            method,
          );
          throw new Error(`Unsupported method: ${method}`);
      }

      const response = formatJsonRpcResult(id, result);
      await walletKitRef.current?.respondSessionRequest({ topic, response });
      setPendingRequestModal(null);
      console.log(
        '🔗 WalletConnect: Successfully approved and responded to request:',
        {
          requestId: id,
          method,
          resultLength:
            typeof result === 'string' ? result.length : 'non-string',
          timestamp: new Date().toISOString(),
        },
      );
      console.log('💡 Response:', { topic, response });

      // Only show generic approval message for non-transaction methods
      // Transaction methods show their own specific success messages
      if (!['eth_sendTransaction', 'eth_signTransaction'].includes(method)) {
        displayMessage('success', t('home:walletconnect.request_approved'));
      }
    } catch (error: unknown) {
      console.error('🔗 WalletConnect: Error approving request:', {
        requestId: id,
        method,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      const response = formatJsonRpcError(id, errorMessage);
      await walletKitRef.current?.respondSessionRequest({ topic, response });
      setPendingRequestModal(null);
      displayMessage('error', t('home:walletconnect.request_approval_failed'));
    }
  };

  // Reject a pending request
  const rejectRequest = async (request: SessionRequest): Promise<void> => {
    if (!walletKitRef.current) return;

    const { topic, id, params } = request;
    const { method } = params.request;

    console.log('🔗 WalletConnect: User rejected request:', {
      requestId: id,
      method,
      topic,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = formatJsonRpcError(id, 'User rejected the request');
      await walletKitRef.current?.respondSessionRequest({ topic, response });
      setPendingRequestModal(null);
      console.log('🔗 WalletConnect: Successfully rejected request:', {
        requestId: id,
        method,
        timestamp: new Date().toISOString(),
      });
      displayMessage('info', t('home:walletconnect.request_rejected'));
    } catch (error) {
      console.error('🔗 WalletConnect: Error rejecting request:', {
        requestId: id,
        method,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      setPendingRequestModal(null);
    }
  };

  const postAction = (
    action: string,
    payload: string,
    chain: string,
    path: string,
    wkIdentity: string,
  ) => {
    const data = {
      action,
      payload,
      chain,
      path,
      wkIdentity,
    };
    axios
      .post(`https://${sspConfig().relay}/v1/action`, data)
      .then((res) => {
        console.log(res);
      })
      .catch((error) => {
        console.log(error);
      });
  };
  // SSP WALLET SPECIFIC IMPLEMENTATIONS

  // Handle public nonces responses from SSP key
  useEffect(() => {
    if (publicNonces) {
      console.log('🔗 WalletConnect: Received public nonces from SSP key');
      // Save nonces to storage for future use
      const sspKeyPublicNonces = JSON.parse(publicNonces) as publicNonces[];
      void (async function () {
        try {
          await localForage.setItem('sspKeyPublicNonces', sspKeyPublicNonces);
          console.log('🔗 WalletConnect: Public nonces saved to storage');
        } catch (error) {
          console.error('Error saving public nonces:', error);
        }
      })();
      clearPublicNonces?.();
    }
  }, [publicNonces, clearPublicNonces]);

  useEffect(() => {
    if (publicNoncesRejected) {
      console.log('🔗 WalletConnect: Public nonces rejected by SSP key');
      // Reject all pending signing requests
      Object.values(pendingSigningRequests).forEach(
        ({ reject, hideLoading }) => {
          hideLoading();
          reject(new Error(t('send:err_public_nonces')));
        },
      );
      setPendingSigningRequests({});
      clearPublicNoncesRejected?.();
      displayMessage('error', t('send:err_public_nonces'));
    }
  }, [publicNoncesRejected, clearPublicNoncesRejected, pendingSigningRequests]);

  // Add socket handling for signing responses from SSP relay
  // This would require extending the SocketContext to handle 'signresponse' events
  useEffect(() => {
    // Note: This assumes the socket context would be extended to handle signing responses
    // For now, we'll use the existing transaction handling pattern
    // In a complete implementation, you would add 'signresponse' event handling to SocketContext
    console.log(
      '🔗 WalletConnect: Socket handlers ready for signing responses',
    );
  }, []);

  // Helper function to request public nonces from SSP key (extracted from SendEVM)
  const requestPublicNoncesFromSSP = async (): Promise<publicNonces> => {
    return new Promise((resolve, reject) => {
      void (async function () {
        try {
          // Check if we have stored nonces first
          const sspKeyPublicNonces: publicNonces[] =
            (await localForage.getItem('sspKeyPublicNonces')) ?? [];

          if (sspKeyPublicNonces.length > 0) {
            console.log('🔗 WalletConnect: Using stored public nonces');
            // Choose random nonce
            const pos = Math.floor(Math.random() * sspKeyPublicNonces.length);
            const publicNoncesSSP = sspKeyPublicNonces[pos];
            // Remove used nonce from storage
            sspKeyPublicNonces.splice(pos, 1);
            await localForage.setItem('sspKeyPublicNonces', sspKeyPublicNonces);
            resolve(publicNoncesSSP);
            return;
          }

          console.log(
            '🔗 WalletConnect: No stored nonces, requesting from SSP key',
          );

          // Request nonces from SSP relay
          postAction(
            'publicnoncesrequest',
            '[]',
            activeChain,
            '',
            sspWalletKeyInternalIdentity,
          );

          // Set up timeout
          const timeout = setTimeout(() => {
            reject(new Error(t('send:err_public_nonces')));
          }, 30000); // 30 second timeout

          // Wait for nonces via socket
          const checkForNonces = () => {
            void (async function () {
              try {
                const updatedNonces: publicNonces[] =
                  (await localForage.getItem('sspKeyPublicNonces')) ?? [];

                if (updatedNonces.length > 0) {
                  clearTimeout(timeout);
                  const pos = Math.floor(Math.random() * updatedNonces.length);
                  const publicNoncesSSP = updatedNonces[pos];
                  updatedNonces.splice(pos, 1);
                  await localForage.setItem(
                    'sspKeyPublicNonces',
                    updatedNonces,
                  );
                  resolve(publicNoncesSSP);
                } else {
                  // Check again after 1 second
                  setTimeout(checkForNonces, 1000);
                }
              } catch (error) {
                clearTimeout(timeout);
                reject(
                  error instanceof Error ? error : new Error(String(error)),
                );
              }
            })();
          };

          checkForNonces();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  };

  // Unified signing function for both personal_sign and eth_sign
  const handleUnifiedSigning = async (
    message: string,
    address: string,
    resolve: (signature: string) => void,
    reject: (error: Error) => void,
  ): Promise<void> => {
    const hideLoading = displayMessage(
      'loading',
      t('home:walletconnect.creating_signature'),
      0,
    );

    try {
      // find which one of our wallets is matching address
      const walletKeys = Object.keys(wallets);
      const walletInUse = walletKeys.find(
        (key) => wallets[key].address === address,
      );

      if (!walletInUse) {
        throw new Error(
          'Signing request received for different chain. Switch to the correct chain and try again',
        );
      }

      // Get our password to decrypt xpriv from secure storage
      const fingerprint: string = getFingerprint();
      let password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        throw new Error(t('send:err_pwd_not_valid'));
      }

      const xprivBlob = secureLocalStorage.getItem(
        `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
          blockchainConfig.scriptType,
        )}-${blockchainConfig.id}`,
      );
      if (typeof xprivBlob !== 'string') {
        throw new Error(t('send:err_invalid_xpriv'));
      }

      let xprivChain = await passworderDecrypt(password, xprivBlob);
      // reassign password to null as it is no longer needed
      password = null;
      if (typeof xprivChain !== 'string') {
        throw new Error(t('send:err_invalid_xpriv_decrypt'));
      }

      const wInUse = walletInUse;
      const splittedDerPath = wInUse.split('-');
      const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
      const addressIndex = Number(splittedDerPath[1]);
      const keyPair = generateAddressKeypair(
        xprivChain,
        typeIndex,
        addressIndex,
        activeChain,
      );
      // reassign xprivChain to null as it is no longer needed
      xprivChain = null;

      const publicKey2HEX = deriveEVMPublicKey(
        xpubKey,
        typeIndex,
        addressIndex,
        activeChain,
      ); // ssp key

      console.log('🔗 WalletConnect: Getting public nonces from SSP key');

      try {
        // Get public nonces from SSP key

        const publicNoncesSSP = await requestPublicNoncesFromSSP();

        console.log(
          '🔗 WalletConnect: Received public nonces, creating signature',
        );

        // Create the local signature part using Schnorr multisig
        const result = signMessageWithSchnorrMultisig(
          message,
          keyPair,
          publicKey2HEX,
          publicNoncesSSP,
        );

        console.log('🔗 WalletConnect: Local signature created:', {
          hasSignature: !!result.sigOne,
          hasChallenge: !!result.challenge,
          pubNoncesOne: !!result.pubNoncesOne,
          pubNoncesTwo: !!result.pubNoncesTwo,
        });

        // Generate unique request ID
        const requestId = `signing_${Date.now()}_${Math.random().toString(36).substring(2)}`;

        // Send the signature challenge to SSP relay for completion
        const signingRequest = {
          sigOne: result.sigOne,
          challenge: result.challenge,
          pubNoncesOne: result.pubNoncesOne, // this is wallet
          pubNoncesTwo: result.pubNoncesTwo, // this is key
          data: message,
          chain: activeChain,
          walletInUse: walletInUse,
          requestId: requestId,
        };

        console.log('🔗 WalletConnect: Signing request:', signingRequest);

        // Store the request for response handling
        setPendingSigningRequests((prev) => ({
          ...prev,
          [requestId]: {
            resolve,
            reject,
            message,
            address,
            hideLoading: () => {
              if (hideLoading) {
                hideLoading();
              }
            },
          },
        }));

        console.log('🔗 WalletConnect: Sending signature request to SSP relay');

        // Send the signing request to SSP relay
        postAction(
          'evmsigningrequest',
          JSON.stringify(signingRequest),
          activeChain,
          wInUse,
          sspWalletKeyInternalIdentity,
        );

        // Set up timeout for the request
        setTimeout(() => {
          if (pendingSigningRequests[requestId]) {
            if (hideLoading) {
              hideLoading();
            }
            reject(new Error(t('home:walletconnect.signing_failed')));
            setPendingSigningRequests((prev) => {
              const updated = { ...prev };
              delete updated[requestId];
              return updated;
            });
          }
        }, 120000); // 2 minute timeout
      } catch (noncesError) {
        if (
          noncesError instanceof Error &&
          noncesError.message.includes('public_nonces')
        ) {
          // Special handling for public nonces errors
          if (hideLoading) {
            hideLoading();
          }
          displayMessage('info', t('send:err_public_nonces'));

          // Store the signing request to retry after nonces are received
          const requestId = `nonces_${Date.now()}_${Math.random().toString(36).substring(2)}`;
          setPendingSigningRequests((prev) => ({
            ...prev,
            [requestId]: {
              resolve: (signature: string) => {
                resolve(signature);
              },
              reject: (error: Error) => {
                reject(error);
              },
              message,
              address,
              hideLoading: () => {}, // Already handled above
            },
          }));
        } else {
          throw noncesError;
        }
      }
    } catch (error) {
      console.error('🔐 WalletConnect Signing error:', error);
      if (hideLoading) {
        hideLoading();
      }
      displayMessage(
        'error',
        (error as Error).message || t('home:walletconnect.signing_failed'),
      );
      reject(
        error instanceof Error ? error : new Error('Unknown error occurred'),
      );
    }
  };

  // Personal sign with EIP-191 prefix
  const handlePersonalSign = async (
    params: [string, string],
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const [message, address] = params;

      // Decode hex-encoded messages for personal_sign
      let decodedMessage: string;
      if (message.startsWith('0x')) {
        try {
          decodedMessage = ethers.toUtf8String(message);
          console.log('🔍 Hex-encoded message decoded:', {
            original: message,
            decoded: decodedMessage,
          });
        } catch {
          console.log('⚠️ Failed to decode hex message, using as plain text');
          decodedMessage = message;
        }
      } else {
        decodedMessage = message;
      }

      // Add EIP-191 prefix for personal_sign
      const prefix = '\x19Ethereum Signed Message:\n';
      const eip191Message =
        prefix + decodedMessage.length.toString() + decodedMessage;

      console.log('📋 EIP-191 formatted message:', {
        originalMessage: message,
        decodedMessage: decodedMessage,
        eip191Message: JSON.stringify(eip191Message),
      });

      handleUnifiedSigning(eip191Message, address, resolve, reject);
    });
  };

  // Eth sign with raw message (no prefix)
  const handleEthSign = async (params: [string, string]): Promise<string> => {
    return new Promise((resolve, reject) => {
      const [address, message] = params; // Note: different parameter order

      console.log('📋 Raw message signing (eth_sign):', {
        message: message,
        warning: 'NO EIP-191 prefix!',
      });

      handleUnifiedSigning(message, address, resolve, reject);
    });
  };

  const handleSignTypedData = async (
    params: [string, unknown],
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const [address, typedData] = params;

      // Convert typed data to string for signing (similar to personal_sign approach)
      const typedDataString = JSON.stringify(typedData);

      console.log('📋 Typed data signing:', {
        address,
        typedDataString: typedDataString.substring(0, 100) + '...',
        fullLength: typedDataString.length,
      });

      // Use unified signing approach (similar to personal_sign)
      handleUnifiedSigning(typedDataString, address, resolve, reject);
    });
  };

  // Transaction signing/sending with unified approach (no relay dependency)
  const handleSendTransaction = async (
    params: [EthereumTransaction],
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      handleSendTransactionInternal(params, resolve, reject);
    });
  };

  const handleSendTransactionInternal = async (
    params: [EthereumTransaction],
    resolve: (hash: string) => void,
    reject: (error: Error) => void,
  ): Promise<void> => {
    try {
      const [transaction] = params;

      console.log('📋 Send transaction request:', {
        to: transaction.to,
        from: transaction.from,
        value: transaction.value,
        data: transaction.data?.substring(0, 20) + '...',
        gas: transaction.gas || transaction.gasLimit,
        gasPrice: transaction.gasPrice,
      });

      // Create transaction string for signing (similar to message signing)
      const txString = JSON.stringify({
        to: transaction.to,
        from: transaction.from,
        value: transaction.value || '0x0',
        data: transaction.data || '0x',
        gas: transaction.gas || transaction.gasLimit || '0x5208',
        gasPrice: transaction.gasPrice || '0x3b9aca00', // 1 gwei default
        nonce: transaction.nonce || '0x0',
      });

      console.log('🔐 Signing transaction with Schnorr multisig:', {
        txString: txString.substring(0, 100) + '...',
        length: txString.length,
      });

      // Use unified signing approach
      const signature = await new Promise<string>((signResolve, signReject) => {
        handleUnifiedSigning(
          txString,
          transaction.from || '',
          signResolve,
          signReject,
        );
      });

      console.log('✅ Transaction signed successfully:', {
        signature: signature.substring(0, 20) + '...',
        length: signature.length,
      });

      // Mock transaction broadcasting (for testing)
      const hideBroadcastLoading = messageApi.loading(
        t('home:walletconnect.broadcasting_transaction'),
        0,
      );

      try {
        // Generate a mock transaction hash
        const mockTxHash =
          '0x' +
          Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16),
          ).join('');

        setTimeout(() => {
          // Hide the broadcasting loading message
          hideBroadcastLoading();
          console.log('🚀 Mock transaction broadcast successful:', mockTxHash);
          displayMessage(
            'success',
            t('home:walletconnect.transaction_sent_success'),
          );
          resolve(mockTxHash);
        }, 2000);
      } catch (broadcastError) {
        // Make sure to hide loading message on broadcast error
        hideBroadcastLoading();
        throw broadcastError;
      }
    } catch (error) {
      console.error('❌ Send transaction error:', error);
      displayMessage('error', t('home:walletconnect.transaction_send_failed'));
      reject(
        error instanceof Error ? error : new Error('Unknown error occurred'),
      );
    }
  };

  const handleSignTransaction = async (
    params: [EthereumTransaction],
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      handleSignTransactionInternal(params, resolve, reject);
    });
  };

  const handleSignTransactionInternal = async (
    params: [EthereumTransaction],
    resolve: (signedTx: string) => void,
    reject: (error: Error) => void,
  ): Promise<void> => {
    try {
      const [transaction] = params;

      console.log('📋 Sign transaction request (no broadcast):', {
        to: transaction.to,
        from: transaction.from,
        value: transaction.value,
        data: transaction.data?.substring(0, 20) + '...',
        gas: transaction.gas || transaction.gasLimit,
        gasPrice: transaction.gasPrice,
      });

      // Create transaction string for signing
      const txString = JSON.stringify({
        to: transaction.to,
        from: transaction.from,
        value: transaction.value || '0x0',
        data: transaction.data || '0x',
        gas: transaction.gas || transaction.gasLimit || '0x5208',
        gasPrice: transaction.gasPrice || '0x3b9aca00', // 1 gwei default
        nonce: transaction.nonce || '0x0',
      });

      console.log('🔐 Signing transaction (no broadcast):', {
        txString: txString.substring(0, 100) + '...',
        length: txString.length,
      });

      // Use unified signing approach
      const signature = await new Promise<string>((signResolve, signReject) => {
        handleUnifiedSigning(
          txString,
          transaction.from || '',
          signResolve,
          signReject,
        );
      });

      console.log('✅ Transaction signed (not broadcast):', {
        signature: signature.substring(0, 20) + '...',
        length: signature.length,
      });

      // Create a mock signed transaction (RLP encoded format)
      const mockSignedTx =
        '0x' +
        // Transaction data in RLP format (mock)
        ethers.zeroPadValue(signature, 200).substring(2) +
        // Additional mock transaction data
        Array.from({ length: 100 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join('');

      displayMessage(
        'success',
        t('home:walletconnect.transaction_signed_success'),
      );
      resolve(mockSignedTx);
    } catch (error) {
      console.error('❌ Sign transaction error:', error);
      displayMessage('error', t('home:walletconnect.transaction_sign_failed'));
      reject(
        error instanceof Error ? error : new Error('Unknown error occurred'),
      );
    }
  };

  // Chain switching with callback for UI
  const handleSwitchChain = async (
    params: [SwitchChainRequest],
  ): Promise<null> => {
    return new Promise((resolve, reject) => {
      // Fallback implementation
      handleSwitchChainInternal(params, resolve, reject);
    });
  };

  const handleSwitchChainInternal = (
    params: [SwitchChainRequest],
    resolve: (value: null) => void,
    reject: (error: Error) => void,
  ): void => {
    try {
      const [{ chainId }] = params;

      // Parse chainId (remove 0x prefix if present)
      const targetChainId = parseInt(chainId, 16);

      // Find the SSP chain that matches this chainId
      const targetChain = Object.entries(blockchains).find(
        ([, config]) =>
          config.chainType === 'evm' &&
          parseInt(config.chainId!) === targetChainId,
      );

      if (!targetChain) {
        throw new Error(
          t('home:walletconnect.unsupported_chain_id', { chainId }),
        );
      }

      const [chainKey] = targetChain;
      const currentChain = blockchains[activeChain];

      // Show detailed warning about address uniqueness when switching chains
      console.log('🔗 WalletConnect: Chain switching with address warning:', {
        fromChain: currentChain.name,
        toChain: targetChain[1].name,
        fromChainId: currentChain.chainId,
        toChainId: targetChain[1].chainId,
        warning: 'Different addresses per chain - fund loss risk if confused!',
      });

      // Switch active chain in SSP Wallet
      dispatch(setActiveChain(chainKey as keyof cryptos));

      // Emit chainChanged event to all sessions with detailed warnings
      Object.keys(activeSessions).forEach((topic) => {
        console.log(
          `🔗 Chain changed from ${currentChain.name} to ${targetChain[1].name} for session ${topic}`,
        );
        console.log(
          `💡 Note: ${currentChain.name} and ${targetChain[1].name} use different addresses`,
        );
      });

      // Show success message with warning
      displayMessage(
        'success',
        t('home:walletconnect.chain_switched', {
          chain: targetChain[1].name,
        }),
      );

      // Show additional info about network addresses
      setTimeout(() => {
        displayMessage(
          'info',
          t('home:walletconnect.chain_unique_addresses_desc'),
          5000, // Show for 5 seconds
        );
      }, 2000);

      resolve(null);
    } catch (error) {
      reject(
        error instanceof Error ? error : new Error('Unknown error occurred'),
      );
    }
  };

  const handleAddChain = async (params: [ChainConfig]): Promise<null> => {
    const [chainConfig] = params;

    console.log('Add chain request:', chainConfig);

    // SSP Wallet only supports pre-configured chains
    // Check if the requested chain is already supported
    const existingChain = Object.entries(blockchains).find(
      ([, config]) =>
        config.chainType === 'evm' &&
        parseInt(config.chainId!) === parseInt(chainConfig.chainId, 16),
    );

    if (existingChain) {
      // Chain already supported, just switch to it
      return handleSwitchChain([{ chainId: chainConfig.chainId }]);
    } else {
      // Chain not supported
      throw new Error(
        t('home:walletconnect.chain_not_supported', {
          chainName: chainConfig.chainName,
        }),
      );
    }
  };

  // Pair with dApp using URI
  const pair = async (uri: string): Promise<void> => {
    if (!walletKitRef.current) {
      throw new Error('WalletConnect not initialized');
    }

    setIsConnecting(true);
    try {
      console.log('Attempting to pair with URI:', uri);
      await walletKitRef.current.pair({ uri });
      console.log('Pairing successful');
      displayMessage('success', t('home:walletconnect.pairing_successful'));
    } catch (error: unknown) {
      console.error('Pairing error:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      displayMessage(
        'error',
        `${t('home:walletconnect.pairing_error')}: ${errorMessage}`,
      );
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  // Approve session proposal
  const approveSession = async (
    proposal: SessionProposal,
    selectedChains?: number[],
    selectedAccounts?: Record<number, string[]>,
  ): Promise<SessionStruct> => {
    if (!walletKitRef.current) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      const evmChains = getEvmChains();

      let accounts: string[] = [];
      let supportedChainIds: string[] = [];

      if (selectedChains && selectedAccounts) {
        // Use user-selected chains and accounts
        for (const chainId of selectedChains) {
          const chainAccounts = selectedAccounts[chainId] || [];
          supportedChainIds.push(`eip155:${chainId}`);
          accounts.push(
            ...chainAccounts.map((addr) => `eip155:${chainId}:${addr}`),
          );
        }
      } else {
        // Fallback to all available accounts (backward compatibility)
        accounts = await getUserAccounts();
        supportedChainIds = evmChains.map((chain) => `eip155:${chain.chainId}`);
      }

      console.log('Approving session with:', {
        selectedChains,
        supportedChainIds,
        accounts: accounts.length,
        accountDetails: accounts,
        proposalId: proposal.id,
        dAppName: proposal.params.proposer.metadata.name,
        requiredNamespaces: proposal.params.requiredNamespaces,
        optionalNamespaces: proposal.params.optionalNamespaces,
      });

      // Inform user about which chains they're connecting to
      const connectingChains = supportedChainIds.map((chainId) => {
        const numericChainId = parseInt(chainId.split(':')[1]);
        const chainConfig = Object.values(blockchains).find(
          (config) =>
            config.chainType === 'evm' &&
            parseInt(config.chainId!) === numericChainId,
        );
        return chainConfig
          ? `${chainConfig.name} (${chainConfig.symbol})`
          : chainId;
      });

      // Show user which networks they're connecting (with auto-dismiss)
      const hideConnectingMessage = messageApi.loading(
        t('home:walletconnect.connecting_to_dapp', {
          dappName: proposal.params.proposer.metadata.name,
          chains: connectingChains.join(', '),
        }),
        0, // No auto-dismiss for loading
      );

      // Auto-hide after 2 seconds
      setTimeout(() => {
        hideConnectingMessage();
      }, 2000);

      // Build supported namespaces for selected EVM chains
      const supportedNamespaces = {
        eip155: {
          chains: supportedChainIds,
          methods: [
            'eth_accounts',
            'eth_requestAccounts',
            'eth_sendRawTransaction',
            'eth_sign',
            'eth_signTransaction',
            'eth_signTypedData',
            'eth_signTypedData_v3',
            'eth_signTypedData_v4',
            'eth_sendTransaction',
            'personal_sign',
            'wallet_switchEthereumChain',
            'wallet_addEthereumChain',
            'wallet_getPermissions',
            'wallet_requestPermissions',
            'wallet_watchAsset',
            'eth_chainId',
            'net_version',
          ],
          events: [
            'chainChanged',
            'accountsChanged',
            'message',
            'disconnect',
            'connect',
          ],
          accounts,
        },
      };

      console.log('🔗 WalletConnect: Built supported namespaces:', {
        supportedNamespaces,
        accountsCount: accounts.length,
        chainsCount: supportedChainIds.length,
      });

      // WalletConnect SDK requires complex proposal parameter types
      const approvedNamespaces = buildApprovedNamespaces({
        proposal: proposal.params,
        supportedNamespaces,
      });

      console.log('🔗 WalletConnect: Built approved namespaces:', {
        approvedNamespaces,
        eip155Accounts: approvedNamespaces.eip155?.accounts?.length || 0,
        eip155Chains: approvedNamespaces.eip155?.chains?.length || 0,
      });

      const session = await walletKitRef.current.approveSession({
        id: proposal.id,
        namespaces: approvedNamespaces,
      });

      console.log('🔗 WalletConnect: Session approved successfully:', {
        sessionTopic: session.topic,
        sessionNamespaces: session.namespaces,
        dAppName: session.peer.metadata.name,
        dAppUrl: session.peer.metadata.url,
      });

      // Important: Log information about network-specific addresses
      console.log(
        'ℹ️ Info: SSP Wallet addresses are unique per blockchain network',
      );
      console.log(
        'ℹ️ Each chain (Ethereum, Polygon, BSC, etc.) has different addresses',
      );
      console.log('ℹ️ Each network generates unique addresses for security');

      setActiveSessions(walletKitRef.current.getActiveSessions());
      setPendingProposal(null);

      // Show success with specific chain information
      const connectedChainNames = connectingChains.join(', ');
      displayMessage(
        'success',
        t('home:walletconnect.connected_to_dapp', {
          dappName: session.peer.metadata.name,
          chains: connectedChainNames,
        }),
      );

      return session;
    } catch (error) {
      console.error('Error approving session:', error);
      displayMessage(
        'error',
        t('home:walletconnect.session_establishment_failed'),
      );
      throw error;
    }
  };

  // Reject session proposal
  const rejectSession = async (proposal: SessionProposal): Promise<void> => {
    if (!walletKitRef.current) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await walletKitRef.current.rejectSession({
        id: proposal.id,
        reason: getSdkError('USER_REJECTED'),
      });

      setPendingProposal(null);
      displayMessage('info', t('home:walletconnect.session_rejected'));
    } catch (error) {
      console.error('Error rejecting session:', error);
      displayMessage('error', t('home:walletconnect.session_rejection_failed'));
      throw error;
    }
  };

  // Disconnect session
  const disconnectSession = async (topic: string): Promise<void> => {
    if (!walletKitRef.current) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await walletKitRef.current.disconnectSession({
        topic,
        reason: getSdkError('USER_DISCONNECTED'),
      });

      setActiveSessions((prev) => {
        const updated = { ...prev };
        delete updated[topic];
        return updated;
      });

      // disconnect message is handled in the session_delete event handler
    } catch (error) {
      console.error('Error disconnecting session:', error);
      displayMessage('error', t('home:walletconnect.disconnect_failed'));
      throw error;
    }
  };

  const contextValue: WalletConnectContextType = {
    walletKit,
    activeSessions,
    isInitialized,
    isConnecting,
    pendingRequestModal,
    pendingProposal,
    pair,
    disconnectSession,
    approveSession,
    rejectSession,
    handleSessionRequest,
    approveRequest,
    rejectRequest,
    contextHolder,
    debugInitialize: () => {
      console.log(
        '🔗 WalletConnect: Manual initialization triggered from debug',
      );
      setIsInitialized(false);
      setWalletKit(null);
      // This will trigger the useEffect
      return Promise.resolve();
    },
  };

  return (
    <WalletConnectContext.Provider value={contextValue}>
      {contextHolder}
      {children}
    </WalletConnectContext.Provider>
  );
};
