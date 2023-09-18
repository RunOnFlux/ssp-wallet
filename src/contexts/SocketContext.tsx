import React, { createContext, useState, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAppSelector } from '../hooks';
import { sspConfig } from '@storage/ssp';
import { getOrSavePendingTx, removePendingTx } from '../lib/transactions';

interface SocketContextType {
  socket: Socket | null;
  txid: string;
  txRejected: string;
  pendingTxs: Record<string, any>[],
  addPendingTx?: (data: Record<string, any>) => void;
  refreshPendingTx?: (exp?: string) => void;
  clearTxid?: () => void;
  clearTxRejected?: () => void;
}

interface serverResponse {
  payload: string;
  action: string;
  wkIdentity: string;
  chain: string;
  expireAt: string;
}

const defaultValue: SocketContextType = {
  socket: null,
  txid: '',
  txRejected: '',
  pendingTxs: [],
};

export const SocketContext = createContext<SocketContextType>(defaultValue);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { sspWalletKeyIdentity: wkIdentity } = useAppSelector(
    (state) => state.flux,
  );
  const [socket, setSocket] = useState<Socket | null>(null);
  const [txRejected, setTxRejected] = useState('');
  const [txid, setTxid] = useState('');
  const [socketIdentiy, setSocketIdentity] = useState('');
  const [pendingTxs, setPendingTxs] = useState<Record<string, any>[]>([]);

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

    newSocket.on('txid', (txid: serverResponse) => {
      console.log('incoming txid');
      console.log(txid);
      setTxid(txid.payload);
      setPendingTxs(p => {
        removePendingTx?.(p[0].expireAt);
        return [...p.splice(1)];
      });
    });

    newSocket.on('txrejected', (tx: serverResponse) => {
      console.log('tx rejected');
      console.log(tx);
      setTxRejected(tx.payload)
      setPendingTxs(p => {
        removePendingTx?.(p[0].expireAt);
        return [...p.splice(1)];
      });
    });

    setSocket(newSocket);
    
    return () => {
      newSocket.close();
    };
  }, [wkIdentity]);

  useEffect(() => {
      getOrSavePendingTx().then(setPendingTxs);
  }, []);

  const clearTxid = () => {
    setTxid('');
  };

  const clearTxRejected = () => {
    setTxRejected('');
  };

  const addPendingTx = (data:Record<string, any>) => {
    getOrSavePendingTx(data).then(r => setPendingTxs([...r]));
  }

  const refreshPendingTx = (expireAt?: string) => {
    if(expireAt) {
      removePendingTx?.(expireAt);
    }
    setPendingTxs(p => [...p.filter(p => p.expireAt !== expireAt)])
    console.log("refreshPendingTx");
  }

  return (
    <SocketContext.Provider value={{ socket, txRejected: txRejected, txid: txid, pendingTxs, clearTxid, clearTxRejected, addPendingTx, refreshPendingTx }}>
      {children}
    </SocketContext.Provider>
  );
};
