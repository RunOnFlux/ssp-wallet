import React, { createContext, useState, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAppSelector } from '../hooks';
import { sspConfig } from '@storage/ssp';

interface SocketContextType {
  socket: Socket | null;
  txid: string;
  txRejected: string;
  chain: string;
  publicNonces: string;
  publicNoncesRejected: string;
  walletConnectResponse: WalletConnectSocketResponse | null;
  clearTxid?: () => void;
  clearTxRejected?: () => void;
  clearPublicNonces?: () => void;
  clearPublicNoncesRejected?: () => void;
  clearWalletConnectResponse?: () => void;
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
};

export const SocketContext = createContext<SocketContextType>(defaultValue);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { sspWalletKeyInternalIdentity: wkIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const [socket, setSocket] = useState<Socket | null>(null);
  const [txRejected, setTxRejected] = useState('');
  const [txid, setTxid] = useState('');
  const [chain, setChain] = useState('');
  const [publicNonces, setPublicNonces] = useState('');
  const [publicNoncesRejected, setPublicNoncesRejected] = useState('');
  const [socketIdentiy, setSocketIdentity] = useState('');
  const [walletConnectResponse, setWalletConnectResponse] =
    useState<WalletConnectSocketResponse | null>(null);

  useEffect(() => {
    console.log('socket init');
    if (!wkIdentity) {
      return;
    }

    const newSocket = io(`https://${sspConfig().relay}`, {
      path: '/v1/socket/wallet',
      reconnectionAttempts: 100,
      timeout: 10000,
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection Error', error);
    });

    // leave if identity changed
    if (socketIdentiy) {
      newSocket.emit('leave', { wkIdentity: socketIdentiy });
    }
    setSocketIdentity(wkIdentity);

    newSocket.emit('join', {
      wkIdentity,
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

  const sendWalletConnectRequest = (request: WalletConnectSocketRequest) => {
    if (!socket) {
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
        clearTxid,
        clearTxRejected,
        clearPublicNonces,
        clearPublicNoncesRejected,
        clearWalletConnectResponse,
        sendWalletConnectRequest,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
