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
  clearTxid?: () => void;
  clearTxRejected?: () => void;
  clearPublicNonces?: () => void;
  clearPublicNoncesRejected?: () => void;
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

  return (
    <SocketContext.Provider
      value={{
        socket,
        txRejected,
        txid,
        chain,
        publicNonces,
        publicNoncesRejected,
        clearTxid,
        clearTxRejected,
        clearPublicNonces,
        clearPublicNoncesRejected,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
