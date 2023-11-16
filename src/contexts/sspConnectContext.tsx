import React, { createContext, useState, useEffect } from 'react';
import { useAppSelector } from '../hooks';

interface SspConnectContextType {
  type: string;
  address: string;
  message: string;
  chain: string;
  clearRequest?: () => void;
}

const defaultValue: SspConnectContextType = {
  type: '', // only sign_message
  address: '', // address to sign with
  message: '', // message to sign
  chain: '', // chain to sign with
};

interface dataBgRequest {
  type: string;
  address: string;
  message: string;
  chain: string;
}

interface bgRequest {
  origin: string;
  data: dataBgRequest;
}

export const SspConnectContext = createContext<SspConnectContextType>(defaultValue);

export const SspConnectProvider = ({ children }: { children: React.ReactNode }) => {
  const { sspWalletKeyExternalIdentity: wkExternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const [type, setType] = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [chain, setChain] = useState('');

  useEffect(() => {
    if (chrome?.runtime?.onMessage) { // this will move to separate lib file
      chrome.runtime.onMessage.addListener((request: bgRequest) => {
        console.log(request);
        if (request.origin === 'ssp-background') {
          if (request.data.type === 'sign_message') {
            setType(request.data.type);
            setAddress(request.data.address);
            setMessage(request.data.message);
            setChain(request.data.chain);
          }
        }
      });
    }
  }, [wkExternalIdentity]);

  const clearRequest = () => {
    setType('');
    setAddress('');
    setMessage('');
    setChain('');
  };

  return (
    <SspConnectContext.Provider value={{ type, address, chain, message, clearRequest }}>
      {children}
    </SspConnectContext.Provider>
  );
};
