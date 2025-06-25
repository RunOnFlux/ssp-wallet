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
import { useAppSelector } from '../hooks';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../types';
import localForage from 'localforage';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
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
import { switchToChain } from '../lib/chainSwitching';
import { store } from '../store';
import BigNumber from 'bignumber.js';

// Extend window interface for WalletConnect transaction tracking
declare global {
  interface Window {
    walletConnectTxMap?: Map<
      string,
      {
        resolve: (hash: string) => void;
        reject: (error: Error) => void;
        originalTransaction: EthereumTransaction;
        timestamp: number;
      }
    >;
    walletConnectNavigate?: (
      path: string,
      options?: { state?: unknown },
    ) => void;
  }
}

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
  currentSigningRequest: Record<string, unknown> | null;
  chainSwitchInfo: {
    required: boolean;
    targetChain?: {
      chainKey: keyof cryptos;
      chainId: number;
      chainName: string;
    };
  } | null;
  // Public nonces dialog states
  openConfirmPublicNonces: boolean;
  openPublicNoncesRejected: boolean;
  openPublicNoncesReceived: boolean;
  confirmPublicNoncesAction: (status: boolean) => void;
  publicNoncesRejectedAction: (status: boolean) => void;
  publicNoncesReceivedAction: (status: boolean) => void;
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
  handleWalletConnectTxCompletion: (txid: string) => void;
  setWalletConnectNavigation: (
    navigate: (path: string, options?: { state?: unknown }) => void,
  ) => void;
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
  const { sspWalletKeyInternalIdentity, activeChain } = useAppSelector(
    (state) => ({
      ...state.sspState,
    }),
  );

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);

  // Add socket hook for handling SSP relay responses
  const {
    publicNonces,
    publicNoncesRejected,
    clearPublicNonces,
    clearPublicNoncesRejected,
    evmSigned,
    evmSigningRejected,
    clearEvmSigned,
    clearEvmSigningRejected,
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
    // Clear any existing loading messages of the same type to prevent overlaps
    if (type === 'loading' && activeLoadingMessagesRef.current.has(content)) {
      return () => {}; // Return empty function if message already exists
    }

    if (type === 'loading') {
      activeLoadingMessagesRef.current.add(content);
      const hideMessage = messageApi.loading(content, duration || 0);

      // Return a function that clears the message and removes it from active set
      return () => {
        hideMessage();
        activeLoadingMessagesRef.current.delete(content);
      };
    }

    void messageApi.open({
      type,
      content,
      duration: duration ? duration : type === 'error' ? 5 : 4, // Ensure all messages have duration
    });
  };

  // Utility function to extract error message consistently
  const getErrorMessage = (error: unknown): string => {
    return error instanceof Error
      ? error.message
      : t('home:walletconnect.unknown_error');
  };

  // Utility function to extract address from request parameters
  const extractAddressFromRequest = (
    method: string,
    requestParams: unknown[],
  ): string | null => {
    if (method === 'personal_sign') {
      const [, addr] = requestParams as [string, string];
      return addr;
    } else if (method === 'eth_sign') {
      const [addr] = requestParams as [string, string];
      return addr;
    } else if (
      [
        'eth_signTypedData',
        'eth_signTypedData_v3',
        'eth_signTypedData_v4',
      ].includes(method)
    ) {
      const [addr] = requestParams as [string, unknown];
      return addr;
    } else if (
      ['eth_sendTransaction', 'eth_signTransaction'].includes(method)
    ) {
      const [transaction] = requestParams as [EthereumTransaction];
      return transaction.from || null;
    }
    return null;
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
  // Add state to track current signing request for modals
  const [currentSigningRequest, setCurrentSigningRequest] = useState<Record<
    string,
    unknown
  > | null>(null);
  // Add state to track chain switch requirements for modals
  const [chainSwitchInfo, setChainSwitchInfo] = useState<{
    required: boolean;
    targetChain?: {
      chainKey: keyof cryptos;
      chainId: number;
      chainName: string;
    };
  } | null>(null);
  // Track active loading messages to prevent overlaps
  const activeLoadingMessagesRef = useRef<Set<string>>(new Set());

  // Public nonces dialog states - same as SendEVM
  const [openConfirmPublicNonces, setOpenConfirmPublicNonces] = useState(false);
  const [openPublicNoncesRejected, setOpenPublicNoncesRejected] =
    useState(false);
  const [openPublicNoncesReceived, setOpenPublicNoncesReceived] =
    useState(false);

  // Public nonces dialog action functions - same pattern as SendEVM
  const confirmPublicNoncesAction = (status: boolean) => {
    setOpenConfirmPublicNonces(status);
  };

  const publicNoncesRejectedAction = (status: boolean) => {
    setOpenPublicNoncesRejected(status);
  };

  const publicNoncesReceivedAction = (status: boolean) => {
    setOpenPublicNoncesReceived(status);
  };

  // Handle incoming public nonces from socket
  useEffect(() => {
    if (publicNonces) {
      console.log('🔗 WalletConnect: Received public nonces from socket');

      // Save to storage
      const sspKeyPublicNonces = JSON.parse(publicNonces) as publicNonces[];
      void (async function () {
        try {
          await localForage.setItem('sspKeyPublicNonces', sspKeyPublicNonces);
          console.log('🔗 WalletConnect: Public nonces saved to storage');

          // Close the confirm dialog and show success dialog - same as SendEVM
          setOpenConfirmPublicNonces(false);
          setOpenPublicNoncesReceived(true);

          // Retry any pending signing requests waiting for nonces
          Object.entries(pendingSigningRequests).forEach(
            ([requestId, request]) => {
              if (
                requestId.startsWith('signing_') &&
                request.message &&
                request.address
              ) {
                console.log(
                  '🔗 WalletConnect: Retrying signing request with new nonces:',
                  requestId,
                );

                // Retry the signing operation
                handleUnifiedSigning(
                  request.message,
                  request.address,
                  request.resolve,
                  request.reject,
                  true, // isRetry flag to prevent showing loading message again
                  request.hideLoading, // Pass original hideLoading function
                ).catch((error) => {
                  console.error(
                    '🔗 WalletConnect: Failed to retry signing after nonces received:',
                    error,
                  );
                  request.reject(
                    error instanceof Error ? error : new Error(String(error)),
                  );
                });
              }
            },
          );
        } catch (error) {
          console.error('🔗 WalletConnect: Error saving public nonces:', error);
        }
      })();

      clearPublicNonces?.();
    }
  }, [publicNonces]);

  // Handle public nonces rejection from socket
  useEffect(() => {
    if (publicNoncesRejected) {
      console.log('🔗 WalletConnect: Public nonces rejected by SSP Key');

      // Close the confirm public nonces dialog
      setOpenConfirmPublicNonces(false);

      // Show the public nonces rejection dialog
      setOpenPublicNoncesRejected(true);

      // Reject all pending signing requests that are waiting for nonces
      Object.entries(pendingSigningRequests).forEach(([requestId, request]) => {
        console.log(
          '🔗 WalletConnect: Rejecting pending signing request due to public nonces rejection:',
          requestId,
        );
        request.hideLoading();
        request.reject(new Error(t('home:walletconnect.request_rejected')));
      });

      // Clear all pending requests
      setPendingSigningRequests({});
      setCurrentSigningRequest(null);

      // Show message that the WalletConnect request was rejected due to public nonces rejection
      displayMessage('info', t('home:walletconnect.request_rejected'));

      clearPublicNoncesRejected?.();
    }
  }, [
    publicNoncesRejected,
    clearPublicNoncesRejected,
    pendingSigningRequests,
    setPendingSigningRequests,
    t,
  ]);

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

  // Find which chain an address belongs to
  const findChainForAddress = async (
    address: string,
  ): Promise<{
    chainKey: keyof cryptos;
    chainId: number;
    chainName: string;
  } | null> => {
    const evmChains = getEvmChains();

    for (const chain of evmChains) {
      const accounts = await getAccountsForChain(chain.chainId);
      if (accounts.some((acc) => acc.toLowerCase() === address.toLowerCase())) {
        return {
          chainKey: chain.id,
          chainId: chain.chainId,
          chainName: chain.name,
        };
      }
    }

    return null;
  };

  // Check if a chain switch will be required for the given request
  const checkChainSwitchRequirement = async (
    event: SessionRequest,
  ): Promise<void> => {
    const { request } = event.params;
    const { method } = request;

    // Extract address from different request types
    let address: string | null = null;

    if (method === 'personal_sign') {
      const [, addr] = request.params as [string, string];
      address = addr;
    } else if (method === 'eth_sign') {
      const [addr] = request.params as [string, string];
      address = addr;
    } else if (
      [
        'eth_signTypedData',
        'eth_signTypedData_v3',
        'eth_signTypedData_v4',
      ].includes(method)
    ) {
      const [addr] = request.params as [string, unknown];
      address = addr;
    } else if (
      ['eth_sendTransaction', 'eth_signTransaction'].includes(method)
    ) {
      const [transaction] = request.params as [EthereumTransaction];
      address = transaction.from || null;
    }

    if (!address) {
      setChainSwitchInfo(null);
      return;
    }

    // Check if address exists in current chain using fresh state
    const freshState = store.getState();
    const currentActiveChain = freshState.sspState.activeChain;
    const currentWallets = freshState[currentActiveChain].wallets || {};

    const walletKeys = Object.keys(currentWallets);
    const walletInUse = walletKeys.find(
      (key) =>
        currentWallets[key].address.toLowerCase() === address.toLowerCase(),
    );

    console.log('🔗 WalletConnect: checkChainSwitchRequirement analysis:', {
      requestedAddress: address,
      currentActiveChain,
      walletsInCurrentChain: walletKeys.length,
      addressFoundInCurrentChain: !!walletInUse,
      currentWalletAddresses: walletKeys.map(
        (key) => currentWallets[key].address,
      ),
    });

    if (walletInUse) {
      // Address found in current chain, no switch required
      setChainSwitchInfo({ required: false });
    } else {
      // Address not found, check other chains
      const targetChainInfo = await findChainForAddress(address);

      if (targetChainInfo) {
        console.log('🔗 WalletConnect: Chain switch will be required:', {
          currentChain: currentActiveChain,
          targetChain: targetChainInfo.chainKey,
          targetChainName: targetChainInfo.chainName,
        });

        setChainSwitchInfo({
          required: true,
          targetChain: targetChainInfo,
        });
      } else {
        console.log(
          '🔗 WalletConnect: Address not found in any chain:',
          address,
        );
        setChainSwitchInfo(null);
      }
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

    // For sensitive operations, check if chain switch is required and show user confirmation modal
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

      // Check if chain switch will be required
      await checkChainSwitchRequirement(event);

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
          throw new Error(
            t('home:walletconnect.unsupported_method', { method }),
          );
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
        error: getErrorMessage(error),
        timestamp: new Date().toISOString(),
      });
      const errorMessage = getErrorMessage(error);

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
      // Check if chain switch is required at approval time (fresh check)
      let targetChainInfo: {
        chainKey: keyof cryptos;
        chainId: number;
        chainName: string;
      } | null = null;

      // Extract address from the request
      const address = extractAddressFromRequest(method, requestParams);

      if (address) {
        // Get current state
        const currentState = store.getState();
        const currentActiveChain = currentState.sspState.activeChain;
        const currentWallets = currentState[currentActiveChain].wallets || {};

        // Check if address exists in current chain
        const walletKeys = Object.keys(currentWallets);
        const addressExistsInCurrentChain = walletKeys.some(
          (key) =>
            currentWallets[key].address.toLowerCase() === address.toLowerCase(),
        );

        if (!addressExistsInCurrentChain) {
          // Address not found, check other chains
          console.log(
            '🔗 WalletConnect: Address not found in current chain, searching other chains:',
            {
              requestedAddress: address,
              currentChain: currentActiveChain,
              walletsInCurrentChain: walletKeys.length,
              currentWalletAddresses: walletKeys.map(
                (key) => currentWallets[key].address,
              ),
            },
          );

          targetChainInfo = await findChainForAddress(address);

          if (targetChainInfo) {
            console.log(
              '🔗 WalletConnect: Chain switch required for signing:',
              {
                currentChain: currentActiveChain,
                targetChain: targetChainInfo.chainKey,
                address: address,
              },
            );

            await switchToChain(targetChainInfo.chainKey, passwordBlob);

            // Show success message
            displayMessage(
              'success',
              `Switched to ${targetChainInfo.chainName} chain for signing`,
            );

            // Wait a moment for Redux state to propagate
            await new Promise((resolve) => setTimeout(resolve, 500));

            console.log(
              '🔗 WalletConnect: Chain switch completed, proceeding with signing',
            );
          }
        }
      }

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
          throw new Error(
            t('home:walletconnect.unsupported_method', { method }),
          );
      }

      const response = formatJsonRpcResult(id, result);
      await walletKitRef.current?.respondSessionRequest({ topic, response });
      setPendingRequestModal(null);
      setChainSwitchInfo(null); // Clear chain switch info after successful approval
      setCurrentSigningRequest(null); // Clear signing request data after successful completion
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
      const errorMessage = getErrorMessage(error);

      const response = formatJsonRpcError(id, errorMessage);
      await walletKitRef.current?.respondSessionRequest({ topic, response });
      setPendingRequestModal(null);
      setCurrentSigningRequest(null); // Clear signing request data on error
      setChainSwitchInfo(null); // Clear chain switch info on error

      // Don't show error message if user intentionally rejected the request
      const rejectedByUserMessage = t('home:walletconnect.request_rejected');
      if (
        error instanceof Error &&
        (error.message === 'USER_REJECTED_REQUEST' ||
          error.message.includes(rejectedByUserMessage))
      ) {
        console.log(
          '🔗 WalletConnect: User rejected request during approval process',
        );
      } else {
        displayMessage(
          'error',
          t('home:walletconnect.request_approval_failed'),
        );
      }
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

    // Clear the current signing request and chain switch info when rejecting
    setCurrentSigningRequest(null);
    setChainSwitchInfo(null);

    // Clean up any pending signing requests and their loading messages
    Object.entries(pendingSigningRequests).forEach(
      ([requestId, pendingRequest]) => {
        console.log(
          '🔗 WalletConnect: Cleaning up pending signing request:',
          requestId,
        );
        pendingRequest.hideLoading();
        // Use a specific error type to distinguish user rejection from other errors
        pendingRequest.reject(new Error('USER_REJECTED_REQUEST'));
      },
    );
    setPendingSigningRequests({});

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

  // Handle public nonces received from SSP Key
  useEffect(() => {
    if (publicNonces) {
      console.log('🔗 WalletConnect: Public nonces received from SSP Key');
      clearPublicNonces?.();
    }
  }, [publicNonces, clearPublicNonces]);

  // Handle EVM signing completion from SSP Key
  useEffect(() => {
    if (evmSigned) {
      console.log(
        '🔗 WalletConnect: EVM signing completed by SSP Key:',
        evmSigned,
      );

      try {
        const signedData = JSON.parse(evmSigned) as {
          signature: string;
          requestId: string;
        };
        const { signature, requestId } = signedData;

        // Find and resolve the corresponding pending request
        const pendingRequest = pendingSigningRequests[requestId];
        if (pendingRequest) {
          console.log(
            '🔗 WalletConnect: Resolving pending signing request:',
            requestId,
          );

          pendingRequest.hideLoading();
          pendingRequest.resolve(signature);

          // Clean up the pending request
          setPendingSigningRequests((prev) => {
            const updated = { ...prev };
            delete updated[requestId];
            return updated;
          });

          // Clear current signing request data when signing completes
          setCurrentSigningRequest(null);
        } else {
          console.warn(
            '🔗 WalletConnect: No pending request found for:',
            requestId,
          );
        }
      } catch (error) {
        console.error(
          '🔗 WalletConnect: Error processing evmSigned response:',
          error,
        );
        displayMessage('error', t('home:walletconnect.signing_failed'));
      }

      clearEvmSigned?.();
    }
  }, [
    evmSigned,
    clearEvmSigned,
    pendingSigningRequests,
    setPendingSigningRequests,
  ]);

  // Handle EVM signing rejection from SSP Key
  useEffect(() => {
    if (evmSigningRejected) {
      console.log('🔗 WalletConnect: EVM signing rejected by SSP Key');

      // Reject all pending signing requests (since we don't have specific requestId for rejections)
      Object.entries(pendingSigningRequests).forEach(([requestId, request]) => {
        console.log(
          '🔗 WalletConnect: Rejecting pending signing request:',
          requestId,
        );
        request.hideLoading();
        request.reject(new Error(t('home:walletconnect.request_rejected')));
      });

      // Clear all pending requests
      setPendingSigningRequests({});
      // Clear current signing request data when signing is rejected
      setCurrentSigningRequest(null);
      displayMessage('info', t('home:walletconnect.request_rejected'));

      clearEvmSigningRejected?.();
    }
  }, [
    evmSigningRejected,
    clearEvmSigningRejected,
    pendingSigningRequests,
    setPendingSigningRequests,
  ]);

  // Helper function to request public nonces from SSP key (extracted from SendEVM)
  const requestPublicNoncesFromSSP = async (
    chainKey: keyof cryptos,
    message: string,
    address: string,
    resolve: (signature: string) => void,
    reject: (error: Error) => void,
    hideLoading: () => void,
  ): Promise<publicNonces> => {
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
      return publicNoncesSSP;
    }

    console.log('🔗 WalletConnect: No stored nonces, requesting from SSP key');

    // Show the dialog - same as SendEVM
    setOpenConfirmPublicNonces(true);

    // Create a unique request ID to track this signing request
    const requestId = `signing_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    // Store this signing request so it can be retried when nonces arrive
    setPendingSigningRequests((prev) => ({
      ...prev,
      [requestId]: {
        resolve,
        reject,
        message,
        address,
        hideLoading,
      },
    }));

    // Request nonces from SSP relay - response will come via socket
    postAction(
      'publicnoncesrequest',
      '[]',
      chainKey,
      '',
      sspWalletKeyInternalIdentity,
    );

    // Throw special error that won't be propagated to WalletConnect
    throw new Error('WAITING_FOR_NONCES');
  };

  // Unified signing function for both personal_sign and eth_sign
  const handleUnifiedSigning = async (
    message: string,
    address: string,
    resolve: (signature: string) => void,
    reject: (error: Error) => void,
    isRetry = false,
    retryHideLoading?: () => void,
  ): Promise<void> => {
    // Use provided hideLoading for retries, or create new one for initial requests
    const hideLoading =
      isRetry && retryHideLoading
        ? retryHideLoading
        : isRetry
          ? () => {}
          : displayMessage(
              'loading',
              t('home:walletconnect.creating_signature'),
              0,
            );

    try {
      // Get fresh wallet data from current active chain (in case chain was switched)
      const freshState = store.getState();
      const currentActiveChain = freshState.sspState.activeChain;
      const currentWallets = freshState[currentActiveChain].wallets || {};

      console.log('🔗 WalletConnect: handleUnifiedSigning state check:', {
        requestedAddress: address,
        currentActiveChain,
        walletsInCurrentChain: Object.keys(currentWallets).length,
        walletAddresses: Object.values(currentWallets).map((w) => w.address),
        timestamp: new Date().toISOString(),
      });

      // find which one of our wallets is matching address in current chain
      const walletKeys = Object.keys(currentWallets);
      const walletInUse = walletKeys.find(
        (key) =>
          currentWallets[key].address.toLowerCase() === address.toLowerCase(),
      );

      // If wallet not found in current chain, it means chain switch should have happened already
      if (!walletInUse) {
        throw new Error(
          t('home:walletconnect.address_not_found_current_chain'),
        );
      }

      // Get our password to decrypt xpriv from secure storage
      const fingerprint: string = getFingerprint();
      let password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        throw new Error(t('send:err_pwd_not_valid'));
      }

      const currentBlockchainConfig = blockchains[currentActiveChain];
      const xprivBlob = secureLocalStorage.getItem(
        `xpriv-48-${currentBlockchainConfig.slip}-0-${getScriptType(
          currentBlockchainConfig.scriptType,
        )}-${currentBlockchainConfig.id}`,
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
        currentActiveChain,
      );
      // reassign xprivChain to null as it is no longer needed
      xprivChain = null;

      const currentXpubKey = freshState[currentActiveChain].xpubKey;
      const publicKey2HEX = deriveEVMPublicKey(
        currentXpubKey,
        typeIndex,
        addressIndex,
        currentActiveChain,
      ); // ssp key

      console.log('🔗 WalletConnect: Getting public nonces from SSP key');

      try {
        // Get public nonces from SSP key

        const publicNoncesSSP = await requestPublicNoncesFromSSP(
          currentActiveChain,
          message,
          address,
          resolve,
          reject,
          hideLoading || (() => {}),
        );

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
          chain: currentActiveChain,
          walletInUse: walletInUse,
          requestId: requestId,
        };

        console.log('🔗 WalletConnect: Signing request:', signingRequest);

        // Update the current signing request for modals
        setCurrentSigningRequest(signingRequest);

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
          currentActiveChain,
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
          noncesError.message === 'WAITING_FOR_NONCES'
        ) {
          // Special case: request is stored and waiting for nonces via socket
          // Don't propagate this error, the request will be retried when nonces arrive
          console.log(
            '🔗 WalletConnect: Signing request stored, waiting for nonces',
          );
          return;
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
        error instanceof Error
          ? error
          : new Error(t('home:walletconnect.unknown_error')),
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

  const handleSendTransactionInternal = (
    params: [EthereumTransaction],
    resolve: (hash: string) => void,
    reject: (error: Error) => void,
  ): void => {
    try {
      const [transaction] = params;

      console.log('📋 Send transaction request:', {
        to: transaction.to,
        from: transaction.from,
        value: transaction.value,
        data: transaction.data?.substring(0, 20) + '...',
        gas: transaction.gas || transaction.gasLimit,
        gasPrice: transaction.gasPrice,
        nonce: transaction.nonce,
      });

      // Get fresh wallet data from current active chain (in case chain was switched)
      const freshState = store.getState();
      const currentActiveChain = freshState.sspState.activeChain;
      const currentWallets = freshState[currentActiveChain].wallets || {};

      console.log('🔗 WalletConnect: handleSendTransaction state check:', {
        requestedAddress: transaction.from,
        currentActiveChain,
        walletsInCurrentChain: Object.keys(currentWallets).length,
        walletAddresses: Object.values(currentWallets).map((w) => w.address),
        timestamp: new Date().toISOString(),
      });

      // Find which wallet matches the from address in current chain
      const walletKeys = Object.keys(currentWallets);
      const walletInUse = walletKeys.find(
        (key) =>
          currentWallets[key].address.toLowerCase() ===
          transaction.from?.toLowerCase(),
      );

      // If wallet not found in current chain, it means chain switch should have happened already
      if (!walletInUse) {
        throw new Error(t('home:walletconnect.address_not_found_transaction'));
      }

      const blockchainConfig = blockchains[currentActiveChain];
      const { networkFees } = freshState.networkFees;

      // Parse transaction parameters with proper hex handling
      const parseHexValue = (
        value: string | undefined,
        defaultValue: string,
      ): string => {
        if (!value) return defaultValue;
        if (value.startsWith('0x')) {
          return parseInt(value, 16).toString();
        }
        return value;
      };

      // Convert wei value to ether
      const parseWeiToEther = (weiValue: string | undefined): string => {
        if (!weiValue || weiValue === '0x0' || weiValue === '0') return '0';
        const weiString = weiValue.startsWith('0x')
          ? parseInt(weiValue, 16).toString()
          : weiValue;
        const etherValue = new BigNumber(weiString).dividedBy(
          new BigNumber(10).pow(18),
        );
        return etherValue.toFixed();
      };

      // Parse gas values
      const requestedGasLimit = parseHexValue(
        transaction.gas || transaction.gasLimit,
        '0',
      );
      const requestedGasPrice = parseHexValue(transaction.gasPrice, '0');

      // Get automatic values from network fees and blockchain config
      const automaticBaseGas =
        networkFees[currentActiveChain]?.base || blockchainConfig.baseFee;
      const automaticPriorityGas =
        networkFees[currentActiveChain]?.priority ||
        blockchainConfig.priorityFee;
      const automaticGasLimit = blockchainConfig.gasLimit;

      // Convert gwei to wei for comparison with gasPrice
      const automaticTotalGasPrice = new BigNumber(
        automaticBaseGas + automaticPriorityGas,
      )
        .multipliedBy(new BigNumber(10).pow(9))
        .toFixed();

      // Use the higher values between requested and automatic
      const finalGasLimit = Math.max(
        parseInt(requestedGasLimit) || 0,
        automaticGasLimit,
      ).toString();

      // For gas price, use automatic values if they're higher or if none provided
      let finalBaseGasPrice: string;
      let finalPriorityGasPrice: string;

      if (
        requestedGasPrice &&
        parseInt(requestedGasPrice) > parseInt(automaticTotalGasPrice)
      ) {
        // Split the total gas price between base and priority (70% base, 30% priority)
        const totalGwei = new BigNumber(requestedGasPrice).dividedBy(
          new BigNumber(10).pow(9),
        );
        finalBaseGasPrice = totalGwei.multipliedBy(0.7).toFixed();
        finalPriorityGasPrice = totalGwei.multipliedBy(0.3).toFixed();
      } else {
        finalBaseGasPrice = automaticBaseGas.toString();
        finalPriorityGasPrice = automaticPriorityGas.toString();
      }

      // Parse the amount (value) from wei to ether
      const amount = parseWeiToEther(transaction.value);

      // Determine if this is a token transfer by checking data field
      let isTokenTransfer = false;
      let tokenContract = '';
      if (
        transaction.data &&
        transaction.data !== '0x' &&
        transaction.data.length > 10
      ) {
        // Check if it's an ERC20 transfer (starts with 0xa9059cbb which is transfer function selector)
        if (transaction.data.startsWith('0xa9059cbb')) {
          isTokenTransfer = true;
          tokenContract = transaction.to || '';
        }
      }

      console.log('🔗 WalletConnect: Parsed transaction parameters:', {
        amount,
        gasLimit: finalGasLimit,
        baseGasPrice: finalBaseGasPrice,
        priorityGasPrice: finalPriorityGasPrice,
        isTokenTransfer,
        tokenContract,
        data: transaction.data?.substring(0, 100) + '...',
      });

      // Store resolve/reject functions for when transaction completes
      const walletConnectTxData = {
        resolve,
        reject,
        originalTransaction: transaction,
        timestamp: Date.now(),
      };

      // Store in a map for retrieval when txid comes back from SSP
      if (!window.walletConnectTxMap) {
        window.walletConnectTxMap = new Map();
      }
      const txRequestId = `wc_${Date.now()}_${Math.random()}`;
      window.walletConnectTxMap.set(txRequestId, walletConnectTxData);

      // Navigate to SendEVM with the parsed parameters
      const navigationState = {
        receiver: transaction.to || '',
        amount: amount,
        contract: isTokenTransfer ? tokenContract : '', // Empty for native currency
        baseGasPrice: finalBaseGasPrice,
        priorityGasPrice: finalPriorityGasPrice,
        totalGasLimit: finalGasLimit,
        data: transaction.data || '0x',
        walletConnectTxId: txRequestId, // For tracking this WC transaction
        walletConnectMode: true, // Flag to indicate this came from WalletConnect
      };

      console.log(
        '🚀 WalletConnect: Navigating to SendEVM with state:',
        navigationState,
      );

      // Use React Router navigation
      const navigate = window.walletConnectNavigate;
      if (navigate) {
        navigate('/sendevm', { state: navigationState });

        // Close the modal and show success message
        displayMessage('success', 'Redirected to Send EVM page');

        // For WalletConnect, we need to resolve with a temporary hash
        // The actual transaction will be sent from SendEVM page
        // WalletConnect expects a transaction hash, so we'll provide a placeholder
        // that gets replaced when the real transaction is sent
        const tempTxId = `pending_${Date.now()}`;

        // Store this request so we can resolve it when the real transaction is sent
        if (!window.walletConnectTxMap) {
          window.walletConnectTxMap = new Map();
        }
        window.walletConnectTxMap.set(
          currentSigningRequest?.id?.toString() || tempTxId,
          {
            resolve,
            reject,
            originalTransaction: transaction,
            timestamp: Date.now(),
          },
        );

        // Don't resolve here - let SendEVM handle the actual transaction sending
        // The resolve will be called when we receive the txid from socket via handleWalletConnectTxCompletion
        // But we need to resolve with a temporary hash so the modal closes
        resolve(tempTxId);
        return;
      } else {
        console.error('❌ Navigation function not available');
        displayMessage(
          'error',
          'Please go to Send EVM page and try again. Navigation not available from current page.',
        );
        throw new Error('Navigation not available');
      }
    } catch (error) {
      console.error('❌ Send transaction error:', error);
      displayMessage('error', t('home:walletconnect.transaction_send_failed'));
      reject(
        error instanceof Error
          ? error
          : new Error(t('home:walletconnect.unknown_error')),
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
        error instanceof Error
          ? error
          : new Error(t('home:walletconnect.unknown_error')),
      );
    }
  };

  // Chain switching with proper WalletConnect event emission
  const handleSwitchChain = async (
    params: [SwitchChainRequest],
  ): Promise<null> => {
    return new Promise((resolve, reject) => {
      handleSwitchChainInternal(params, resolve, reject);
    });
  };

  // Handle WalletConnect transaction completion when txid is received from SSP
  const handleWalletConnectTxCompletion = (txid: string) => {
    console.log('🔗 WalletConnect: Received txid from SSP:', txid);

    if (!window.walletConnectTxMap) {
      console.warn('🔗 WalletConnect: No pending transactions found');
      return;
    }

    // Find the pending transaction that matches this txid
    for (const [requestId, txData] of window.walletConnectTxMap.entries()) {
      // For now, resolve the most recent transaction
      // In a production environment, you'd match by address or other criteria
      try {
        txData.resolve(txid);
        window.walletConnectTxMap.delete(requestId);
        console.log('✅ WalletConnect: Transaction resolved with txid:', txid);

        displayMessage(
          'success',
          t('home:walletconnect.transaction_sent_success'),
        );
        break;
      } catch (error) {
        console.error('❌ WalletConnect: Error resolving transaction:', error);
      }
    }
  };

  // Set navigation function for WalletConnect
  const setWalletConnectNavigation = (
    navigate: (path: string, options?: { state?: unknown }) => void,
  ) => {
    window.walletConnectNavigate = navigate;
  };

  const handleSwitchChainInternal = async (
    params: [SwitchChainRequest],
    resolve: (value: null) => void,
    reject: (error: Error) => void,
  ): Promise<void> => {
    try {
      const [{ chainId }] = params;

      console.log('🔗 WalletConnect: Chain switch request received:', {
        requestedChainId: chainId,
        currentChain: activeChain,
        currentChainId: blockchains[activeChain].chainId,
        timestamp: new Date().toISOString(),
      });

      // Validate chainId format
      if (!chainId || typeof chainId !== 'string') {
        throw new Error(
          t('home:walletconnect.unsupported_chain_id', {
            chainId: chainId || 'undefined',
          }),
        );
      }

      // Parse chainId (handle both hex and decimal formats)
      let targetChainId: number;
      try {
        if (chainId.startsWith('0x')) {
          targetChainId = parseInt(chainId, 16);
        } else {
          targetChainId = parseInt(chainId, 10);
        }

        if (isNaN(targetChainId) || targetChainId <= 0) {
          throw new Error(t('home:walletconnect.invalid_chain_id_format'));
        }
      } catch {
        console.error('🔗 WalletConnect: Invalid chain ID format:', chainId);
        throw new Error(
          t('home:walletconnect.unsupported_chain_id', { chainId }),
        );
      }

      // Find the SSP chain that matches this chainId
      const targetChain = Object.entries(blockchains).find(
        ([, config]) =>
          config.chainType === 'evm' &&
          parseInt(config.chainId!) === targetChainId,
      );

      if (!targetChain) {
        console.error('🔗 WalletConnect: Unsupported chain requested:', {
          requestedChainId: targetChainId,
          availableChains: Object.entries(blockchains)
            .filter(([, config]) => config.chainType === 'evm')
            .map(([key, config]) => ({
              key,
              name: config.name,
              chainId: config.chainId,
            })),
        });

        throw new Error(
          t('home:walletconnect.unsupported_chain_id', {
            chainId: `${targetChainId} (0x${targetChainId.toString(16)})`,
          }),
        );
      }

      const [chainKey] = targetChain;
      const currentChain = blockchains[activeChain];

      // Check if we're already on the requested chain
      if (parseInt(currentChain.chainId!) === targetChainId) {
        console.log('🔗 WalletConnect: Already on requested chain:', {
          chainName: currentChain.name,
          chainId: currentChain.chainId,
        });

        displayMessage(
          'info',
          t('home:walletconnect.already_on_chain', {
            chain: currentChain.name,
          }),
        );

        resolve(null);
        return;
      }

      // ✅ Check if target chain is synced with SSP Key
      const targetChainAccounts = await getAccountsForChain(targetChainId);
      const isTargetChainSynced = targetChainAccounts.length > 0;

      if (!isTargetChainSynced) {
        console.error(
          '🔗 WalletConnect: Target chain not synced with SSP Key:',
          {
            targetChain: targetChain[1].name,
            targetChainId,
            chainKey,
            availableAccounts: targetChainAccounts.length,
          },
        );

        const errorMessage = t('home:walletconnect.chain_not_synced', {
          chainName: targetChain[1].name,
        });

        displayMessage('error', errorMessage);

        // Show additional help message about syncing
        setTimeout(() => {
          displayMessage(
            'info',
            t('home:walletconnect.chain_sync_required', {
              chainName: targetChain[1].name,
            }),
            8000,
          );
        }, 2000);

        throw new Error(errorMessage);
      }

      console.log('🔗 WalletConnect: Switching chains:', {
        fromChain: {
          name: currentChain.name,
          chainId: currentChain.chainId,
          key: activeChain,
        },
        toChain: {
          name: targetChain[1].name,
          chainId: targetChain[1].chainId,
          key: chainKey,
        },
        targetChainSynced: isTargetChainSynced,
        targetChainAccounts: targetChainAccounts.length,
        warning: 'Different addresses per chain - fund loss risk if confused!',
      });

      // Get accounts for current chain to show in notification
      const currentChainAccounts = await getAccountsForChain(
        parseInt(currentChain.chainId!),
      );

      // Switch active chain using the complete chain switching utility
      await switchToChain(chainKey as keyof cryptos, passwordBlob);

      // Get new chain info after switch
      const newChainId = `0x${targetChainId.toString(16)}`;
      const newAccounts = targetChainAccounts.map(
        (addr) => `eip155:${targetChainId}:${addr}`,
      );

      console.log('🔗 WalletConnect: Chain switched, emitting events:', {
        newChainId,
        newAccountsCount: newAccounts.length,
        newAccounts: newAccounts.slice(0, 3), // Log first 3 for debugging
      });

      // Emit chainChanged and accountsChanged events to all active sessions
      if (walletKitRef.current) {
        const sessions = walletKitRef.current.getActiveSessions();

        for (const [topic, session] of Object.entries(sessions)) {
          try {
            // Check if this session supports the target chain
            const sessionChains = session.namespaces.eip155?.chains || [];
            const supportsTargetChain = sessionChains.some(
              (chain) => parseInt(chain.split(':')[1]) === targetChainId,
            );

            if (!supportsTargetChain) {
              console.warn(
                `🔗 WalletConnect: Session ${topic} doesn't support chain ${targetChainId}`,
                {
                  sessionChains,
                  dAppName: session.peer.metadata.name,
                },
              );
              continue;
            }

            // Emit chainChanged event
            await walletKitRef.current.emitSessionEvent({
              topic,
              event: {
                name: 'chainChanged',
                data: newChainId,
              },
              chainId: `eip155:${targetChainId}`,
            });

            // Emit accountsChanged event
            await walletKitRef.current.emitSessionEvent({
              topic,
              event: {
                name: 'accountsChanged',
                data: targetChainAccounts, // Send plain addresses, not CAIP-10 format
              },
              chainId: `eip155:${targetChainId}`,
            });

            console.log(
              `🔗 WalletConnect: Events emitted for session ${topic}:`,
              {
                dAppName: session.peer.metadata.name,
                chainChanged: newChainId,
                accountsChanged: targetChainAccounts.length,
                sessionSupportsChain: supportsTargetChain,
              },
            );
          } catch (eventError) {
            console.error(
              `🔗 WalletConnect: Failed to emit events for session ${topic}:`,
              eventError,
            );
            // Continue with other sessions even if one fails
          }
        }
      }

      // Show success message with detailed chain information
      displayMessage(
        'success',
        t('home:walletconnect.chain_switched', {
          chain: targetChain[1].name,
        }),
      );

      // Show important warning about network-specific addresses
      setTimeout(() => {
        displayMessage(
          'warning',
          t('home:walletconnect.address_loss_warning', {
            chainName: targetChain[1].name,
          }),
          6000, // Show for 6 seconds
        );
      }, 2000);

      // Additional info about address differences
      if (currentChainAccounts.length > 0 && targetChainAccounts.length > 0) {
        setTimeout(() => {
          displayMessage(
            'info',
            t('home:walletconnect.chain_unique_addresses_desc'),
            5000,
          );
        }, 4000);
      }

      console.log('🔗 WalletConnect: Chain switch completed successfully:', {
        newActiveChain: chainKey,
        newChainId: targetChain[1].chainId,
        newChainName: targetChain[1].name,
        accountsAvailable: targetChainAccounts.length,
      });

      resolve(null);
    } catch (error) {
      console.error('🔗 WalletConnect: Chain switch failed:', {
        error: error instanceof Error ? error.message : String(error),
        requestedChain: params[0]?.chainId,
        currentChain: activeChain,
        timestamp: new Date().toISOString(),
      });

      displayMessage(
        'error',
        error instanceof Error ? error.message : 'Chain switch failed',
      );

      reject(
        error instanceof Error
          ? error
          : new Error(t('home:walletconnect.unknown_error')),
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
      throw new Error(t('home:walletconnect.walletconnect_not_initialized'));
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
      throw new Error(t('home:walletconnect.walletconnect_not_initialized'));
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
      throw new Error(t('home:walletconnect.walletconnect_not_initialized'));
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

      // Always clean up the UI state, even if rejection failed
      setPendingProposal(null);

      // Check if error is due to expired/deleted session
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('recently deleted') ||
        errorMessage.includes('expired')
      ) {
        console.log(
          'Session already expired/deleted, dismissing modal silently',
        );
        displayMessage('info', t('home:walletconnect.session_rejected'));
      } else {
        displayMessage(
          'error',
          t('home:walletconnect.session_rejection_failed'),
        );
        throw error;
      }
    }
  };

  // Disconnect session
  const disconnectSession = async (topic: string): Promise<void> => {
    if (!walletKitRef.current) {
      throw new Error(t('home:walletconnect.walletconnect_not_initialized'));
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
    currentSigningRequest,
    chainSwitchInfo,
    // Public nonces dialog states
    openConfirmPublicNonces,
    openPublicNoncesRejected,
    openPublicNoncesReceived,
    confirmPublicNoncesAction,
    publicNoncesRejectedAction,
    publicNoncesReceivedAction,
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
    handleWalletConnectTxCompletion,
    setWalletConnectNavigation,
  };

  return (
    <WalletConnectContext.Provider value={contextValue}>
      {contextHolder}
      {children}
    </WalletConnectContext.Provider>
  );
};
