import React, { createContext, useState, useEffect, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAppSelector } from '../hooks';
import { useRelayAuth } from '../hooks/useRelayAuth';
import { sspConfig } from '@storage/ssp';

interface WkSignedPayload {
  keySignature: string;
  keyPubKey: string;
  requestId: string;
  message: string;
}

interface EnterpriseVaultXpubSignedPayload {
  xpubKey: string;
  keyXpubSignature: string;
  requestId: string;
  chain: string;
  orgIndex: number;
}

export interface EnterpriseVaultSignedPayload {
  keySignatures?: string[]; // partial signatures from Key (UTXO only — EVM uses signerContribution)
  keyPubKey: string; // Key's vault public key
  requestId: string;
  // EVM M-of-N vault: Key returns raw signer contribution + challenge
  signerContribution?: string;
  challenge?: string;
}

interface SocketContextType {
  socket: Socket | null;
  txid: string;
  txRejected: string;
  chain: string;
  publicNonces: string;
  publicNoncesRejected: string;
  walletConnectResponse: WalletConnectSocketResponse | null;
  evmSigned: string;
  evmSigningRejected: string;
  wkSigned: WkSignedPayload | null;
  wkSigningRejected: string;
  enterpriseVaultXpubSigned: EnterpriseVaultXpubSignedPayload | null;
  enterpriseVaultXpubRejected: string;
  enterpriseVaultSigned: EnterpriseVaultSignedPayload | null;
  enterpriseVaultSignRejected: string;
  clearTxid?: () => void;
  clearTxRejected?: () => void;
  clearPublicNonces?: () => void;
  clearPublicNoncesRejected?: () => void;
  clearWalletConnectResponse?: () => void;
  clearEvmSigned?: () => void;
  clearEvmSigningRejected?: () => void;
  clearWkSigned?: () => void;
  clearWkSigningRejected?: () => void;
  clearEnterpriseVaultXpubSigned?: () => void;
  clearEnterpriseVaultXpubRejected?: () => void;
  clearEnterpriseVaultSigned?: () => void;
  clearEnterpriseVaultSignRejected?: () => void;
  sendWalletConnectRequest?: (request: WalletConnectSocketRequest) => void;
}

interface WalletConnectSocketRequest {
  id: string;
  method: string;
  params: unknown[];
  metadata?: {
    dappName: string;
    dappUrl: string;
  };
  chain: string;
}

interface WalletConnectSocketResponse {
  requestId: string;
  approved: boolean;
  result?: unknown;
  error?: string;
}

interface serverResponse {
  payload: string;
  action: string;
  wkIdentity: string;
  chain: string;
  path: string;
}

const defaultValue: SocketContextType = {
  socket: null,
  txid: '',
  txRejected: '',
  chain: '',
  publicNonces: '',
  publicNoncesRejected: '',
  walletConnectResponse: null,
  evmSigned: '',
  evmSigningRejected: '',
  wkSigned: null,
  wkSigningRejected: '',
  enterpriseVaultXpubSigned: null,
  enterpriseVaultXpubRejected: '',
  enterpriseVaultSigned: null,
  enterpriseVaultSignRejected: '',
};

export const SocketContext = createContext<SocketContextType>(defaultValue);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { sspWalletKeyInternalIdentity: wkIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { createWkIdentityAuth, isAuthAvailable } = useRelayAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [txRejected, setTxRejected] = useState('');
  const [txid, setTxid] = useState('');
  const [chain, setChain] = useState('');
  const [publicNonces, setPublicNonces] = useState('');
  const [publicNoncesRejected, setPublicNoncesRejected] = useState('');
  const [walletConnectResponse, setWalletConnectResponse] =
    useState<WalletConnectSocketResponse | null>(null);
  const [evmSigned, setEvmSigned] = useState('');
  const [evmSigningRejected, setEvmSigningRejected] = useState('');
  const [wkSigned, setWkSigned] = useState<WkSignedPayload | null>(null);
  const [wkSigningRejected, setWkSigningRejected] = useState('');
  const [enterpriseVaultXpubSigned, setEnterpriseVaultXpubSigned] =
    useState<EnterpriseVaultXpubSignedPayload | null>(null);
  const [enterpriseVaultXpubRejected, setEnterpriseVaultXpubRejected] =
    useState('');
  const [enterpriseVaultSigned, setEnterpriseVaultSigned] =
    useState<EnterpriseVaultSignedPayload | null>(null);
  const [enterpriseVaultSignRejected, setEnterpriseVaultSignRejected] =
    useState('');

  /**
   * Emit an authenticated join event.
   */
  const emitAuthenticatedJoin = useCallback(
    async (socketToUse: Socket, identity: string) => {
      try {
        if (isAuthAvailable) {
          // Create join data to hash
          const joinData = { wkIdentity: identity };
          const auth = await createWkIdentityAuth('join', identity, joinData);
          if (auth) {
            console.log('[Socket] Emitting authenticated join');
            socketToUse.emit('join', {
              ...joinData,
              ...auth,
            });
            return;
          }
        }
        // Fallback to unauthenticated join (backward compatibility)
        console.log(
          '[Socket] Emitting unauthenticated join (auth not available)',
        );
        socketToUse.emit('join', { wkIdentity: identity });
      } catch (error) {
        console.error('[Socket] Error creating auth for join:', error);
        // Fallback to unauthenticated join
        socketToUse.emit('join', { wkIdentity: identity });
      }
    },
    [createWkIdentityAuth, isAuthAvailable],
  );

  useEffect(() => {
    console.log('socket init, wkIdentity:', wkIdentity);
    if (!wkIdentity) {
      // Clear socket state when identity is cleared (logout)
      setSocket(null);
      return;
    }

    const newSocket = io(`https://${sspConfig().relay}`, {
      path: '/v1/socket/wallet',
      reconnectionAttempts: 100, // default: Infinity
      timeout: 10000, // default: 20000
    });

    // 'connect' fires on both initial connection AND after reconnection
    // so we only need this one handler (not 'reconnect')
    newSocket.on('connect', () => {
      console.log('socket connected, joining room:', wkIdentity);
      emitAuthenticatedJoin(newSocket, wkIdentity);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('socket disconnected:', reason);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection Error', error);
    });

    newSocket.on('txid', (tx: serverResponse) => {
      console.log('incoming txid');
      console.log(tx);
      setTxid(tx.payload);
      setChain(tx.chain);
    });

    newSocket.on('txrejected', (tx: serverResponse) => {
      console.log('tx rejected');
      console.log(tx);
      setTxRejected(tx.payload);
      setChain(tx.chain);
    });

    newSocket.on('publicnonces', (nonces: serverResponse) => {
      console.log('incoming public nonces');
      console.log(nonces);
      setPublicNonces(nonces.payload);
    });

    newSocket.on('publicnoncesrejected', (nonces: serverResponse) => {
      console.log('public nonces rejected');
      console.log(nonces);
      setPublicNoncesRejected('publicnoncesrejected');
    });

    newSocket.on('evmsigned', (signed: serverResponse) => {
      console.log('EVM signing completed');
      console.log(signed);
      setEvmSigned(signed.payload);
    });

    newSocket.on('evmsigningrejected', (rejected: serverResponse) => {
      console.log('EVM signing rejected');
      console.log(rejected);
      setEvmSigningRejected('evmsigningrejected');
    });

    newSocket.on('wksigned', (signed: serverResponse) => {
      console.log('WK signing completed');
      console.log(signed);
      try {
        const payload = JSON.parse(signed.payload) as WkSignedPayload;
        setWkSigned(payload);
      } catch {
        console.error('Failed to parse wksigned payload');
      }
    });

    newSocket.on('wksigningrejected', (rejected: serverResponse) => {
      console.log('WK signing rejected');
      console.log(rejected);
      setWkSigningRejected('wksigningrejected');
    });

    newSocket.on('enterprisevaultxpubsigned', (signed: serverResponse) => {
      console.log('Enterprise vault xpub signed');
      console.log(signed);
      try {
        const payload = JSON.parse(
          signed.payload,
        ) as EnterpriseVaultXpubSignedPayload;
        setEnterpriseVaultXpubSigned(payload);
      } catch {
        console.error('Failed to parse enterprisevaultxpubsigned payload');
      }
    });

    newSocket.on('enterprisevaultxpubrejected', (rejected: serverResponse) => {
      console.log('Enterprise vault xpub rejected');
      console.log(rejected);
      setEnterpriseVaultXpubRejected('enterprisevaultxpubrejected');
    });

    newSocket.on('enterprisevaultsigned', (signed: serverResponse) => {
      console.log('Enterprise vault sign completed');
      console.log(signed);
      try {
        const payload = JSON.parse(
          signed.payload,
        ) as EnterpriseVaultSignedPayload;
        setEnterpriseVaultSigned(payload);
      } catch {
        console.error('Failed to parse enterprisevaultsigned payload');
      }
    });

    newSocket.on('enterprisevaultsignrejected', (rejected: serverResponse) => {
      console.log('Enterprise vault sign rejected');
      console.log(rejected);
      setEnterpriseVaultSignRejected('enterprisevaultsignrejected');
    });

    // WalletConnect socket events
    newSocket.on(
      'walletconnect_response',
      (response: WalletConnectSocketResponse) => {
        console.log('[WalletConnect Socket] Response received:', response);
        setWalletConnectResponse(response);
      },
    );

    setSocket(newSocket);

    return () => {
      console.log('socket cleanup, leaving room:', wkIdentity);
      // Clear socket state immediately to prevent stale reference usage
      setSocket(null);
      if (newSocket.connected) {
        newSocket.emit('leave', { wkIdentity });
      }
      newSocket.close();
    };
  }, [wkIdentity]);

  const clearTxid = () => {
    setTxid('');
  };

  const clearTxRejected = () => {
    setTxRejected('');
  };

  const clearPublicNonces = () => {
    setPublicNonces('');
  };

  const clearPublicNoncesRejected = () => {
    setPublicNoncesRejected('');
  };

  const clearWalletConnectResponse = () => {
    setWalletConnectResponse(null);
  };

  const clearEvmSigned = () => {
    setEvmSigned('');
  };

  const clearEvmSigningRejected = () => {
    setEvmSigningRejected('');
  };

  const clearWkSigned = () => {
    setWkSigned(null);
  };

  const clearWkSigningRejected = () => {
    setWkSigningRejected('');
  };

  const clearEnterpriseVaultXpubSigned = () => {
    setEnterpriseVaultXpubSigned(null);
  };

  const clearEnterpriseVaultXpubRejected = () => {
    setEnterpriseVaultXpubRejected('');
  };

  const clearEnterpriseVaultSigned = () => {
    setEnterpriseVaultSigned(null);
  };

  const clearEnterpriseVaultSignRejected = () => {
    setEnterpriseVaultSignRejected('');
  };

  const sendWalletConnectRequest = (request: WalletConnectSocketRequest) => {
    if (!socket || !socket.connected) {
      console.error('[WalletConnect Socket] Socket not connected');
      return;
    }

    console.log('[WalletConnect Socket] Sending request:', request);

    const action = {
      id: request.id,
      action: 'PERSONAL_SIGN', // Map method to action type
      wkIdentity,
      method: request.method,
      params: request.params,
      metadata: request.metadata,
      chain: request.chain,
      timestamp: new Date(),
    };

    socket.emit('walletconnect', action);
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        txRejected,
        txid,
        chain,
        publicNonces,
        publicNoncesRejected,
        walletConnectResponse,
        evmSigned,
        evmSigningRejected,
        wkSigned,
        wkSigningRejected,
        enterpriseVaultXpubSigned,
        enterpriseVaultXpubRejected,
        enterpriseVaultSigned,
        enterpriseVaultSignRejected,
        clearTxid,
        clearTxRejected,
        clearPublicNonces,
        clearPublicNoncesRejected,
        clearWalletConnectResponse,
        clearEvmSigned,
        clearEvmSigningRejected,
        clearWkSigned,
        clearWkSigningRejected,
        clearEnterpriseVaultXpubSigned,
        clearEnterpriseVaultXpubRejected,
        clearEnterpriseVaultSigned,
        clearEnterpriseVaultSignRejected,
        sendWalletConnectRequest,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
