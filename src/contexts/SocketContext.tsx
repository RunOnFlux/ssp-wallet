import React, { createContext, useState, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAppSelector } from '../hooks';
import { sspConfig } from '@storage/ssp';

interface SocketContextType {
  socket: Socket | null;
  txid: string;
  txRejected: string;
  chain: string;
  clearTxid?: () => void;
  clearTxRejected?: () => void;
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
};

export const SocketContext = createContext<SocketContextType>(defaultValue);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { sspWalletKeyIdentity: wkIdentity } = useAppSelector(
    (state) => state.flux,
  );
  const [socket, setSocket] = useState<Socket | null>(null);
  const [txRejected, setTxRejected] = useState('');
  const [txid, setTxid] = useState('');
  const [chain, setChain] = useState('');
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
      setTxRejected(tx.payload)
      setChain(tx.chain);
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

  return (
    <SocketContext.Provider value={{ socket, txRejected: txRejected, txid: txid, chain: chain, clearTxid, clearTxRejected }}>
      {children}
    </SocketContext.Provider>
  );
};
