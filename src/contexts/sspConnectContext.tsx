import React, { createContext, useState, useEffect } from 'react';
import { useAppSelector } from '../hooks';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';

interface SspConnectContextType {
  type: string;
  address: string;
  message: string;
  chain: string;
  clearRequest?: () => void;
}

const defaultValue: SspConnectContextType = {
  type: '', // only sign_message and sspwid_sign_message
  address: '', // address to sign with
  message: '', // message to sign
  chain: '', // chain to sign with
};

interface dataBgParams {
  address: string;
  message: string;
  chain: string;
}

interface dataBgRequest {
  method: string;
  params: dataBgParams;
}

interface bgRequest {
  origin: string;
  data: dataBgRequest;
}

export const SspConnectContext =
  createContext<SspConnectContextType>(defaultValue);

export const SspConnectProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { sspWalletExternalIdentity: wExternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const [type, setType] = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [chain, setChain] = useState('');
  const { t } = useTranslation(['home', 'common']);

  useEffect(() => {
    if (chrome?.runtime?.onMessage) {
      // this will move to separate lib file
      chrome.runtime.onMessage.addListener((request: bgRequest) => {
        console.log(request);
        if (request.origin === 'ssp-background') {
          if (
            request.data.method === 'sign_message' ||
            request.data.method === 'sspwid_sign_message'
          ) {
            if (
              blockchains[request.data.params.chain] ||
              !request.data.params.chain
            ) {
              setChain(request.data.params.chain || 'btc');
              // default to sspwid
              setType(request.data.method);
              setAddress(request.data.params.address || wExternalIdentity); // this can be undefined if its a request before we have identity
              setMessage(request.data.params.message || '');
            } else {
              console.log('Invalid chain' + request.data.params.chain);
              void chrome.runtime.sendMessage({
                origin: 'ssp',
                data: {
                  status: t('common:error'),
                  result: 'REQUEST REJECTED: Invalid chain',
                },
              });
            }
          } else {
            console.log('Invalid method' + request.data.method);
            void chrome.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: t('common:error'),
                result: 'REQUEST REJECTED: Invalid method',
              },
            });
          }
        } else {
          console.log('Ignore Invalid Origin' + request.origin);
        }
      });
    }
  }, [wExternalIdentity]);

  const clearRequest = () => {
    setType('');
    setAddress('');
    setMessage('');
    setChain('');
  };

  return (
    <SspConnectContext.Provider
      value={{ type, address, chain, message, clearRequest }}
    >
      {children}
    </SspConnectContext.Provider>
  );
};
