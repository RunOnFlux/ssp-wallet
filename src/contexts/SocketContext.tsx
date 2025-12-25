import React, { createContext, useState, useEffect, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAppSelector } from '../hooks';
import { useRelayAuth } from '../hooks/useRelayAuth';
import { sspConfig } from '@storage/ssp';

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
  clearTxid?: () => void;
  clearTxRejected?: () => void;
  clearPublicNonces?: () => void;
  clearPublicNoncesRejected?: () => void;
  clearWalletConnectResponse?: () => void;
  clearEvmSigned?: () => void;
  clearEvmSigningRejected?: () => void;
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
        console.log('[Socket] Emitting unauthenticated join (auth not available)');
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
        clearTxid,
        clearTxRejected,
        clearPublicNonces,
        clearPublicNoncesRejected,
        clearWalletConnectResponse,
        clearEvmSigned,
        clearEvmSigningRejected,
        sendWalletConnectRequest,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
