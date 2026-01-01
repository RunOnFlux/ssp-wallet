import React, { createContext, useState, useEffect } from 'react';
import { useAppSelector } from '../hooks';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';

export interface WkSignRequesterInfo {
  origin: string; // domain/origin of the requesting site (required)
  siteName?: string; // friendly name of the site (optional)
  description?: string; // what the site wants to authenticate for (optional)
  iconUrl?: string; // site icon URL - HTTPS only (optional)
}

interface SspConnectContextType {
  type: string;
  address: string;
  message: string;
  amount: string;
  chain: string;
  contract: string;
  authMode: number; // 1 = wallet only, 2 = wallet + key
  requesterInfo: WkSignRequesterInfo | null; // requester info for wk_sign
  clearRequest?: () => void;
}

const defaultValue: SspConnectContextType = {
  type: '', // only sign_message and sspwid_sign_message and pay and wk_sign_message
  address: '', // address to sign with
  message: '', // message to sign
  amount: '', // amount to pay
  chain: '', // chain to sign with
  contract: '', // contract to send token from
  authMode: 2, // default to 2-of-2 for wk_sign
  requesterInfo: null, // requester info for wk_sign
};

interface dataBgParams {
  address: string;
  message: string;
  amount: string;
  chain: string;
  contract: string;
  authMode?: number;
  // Requester info for wk_sign_message
  origin?: string; // domain of requesting site
  siteName?: string; // friendly name
  description?: string; // what the auth is for
  iconUrl?: string; // site icon (HTTPS only)
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
  const { sspWalletExternalIdentity: wExternalIdentity, identityChain } =
    useAppSelector((state) => state.sspState);
  const [type, setType] = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState(''); // only for pay
  const [chain, setChain] = useState('');
  const [contract, setContract] = useState('');
  const [authMode, setAuthMode] = useState(2); // default to 2-of-2 for wk_sign
  const [requesterInfo, setRequesterInfo] =
    useState<WkSignRequesterInfo | null>(null);
  const { t } = useTranslation(['home', 'common']);
  const browser = window.chrome || window.browser;

  // Validate and sanitize iconUrl - must be HTTPS
  const sanitizeIconUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      // Only allow HTTPS URLs
      if (parsed.protocol !== 'https:') {
        console.log('Icon URL must be HTTPS');
        return undefined;
      }
      // Limit URL length
      if (url.length > 500) {
        console.log('Icon URL too long');
        return undefined;
      }
      return url;
    } catch {
      console.log('Invalid icon URL');
      return undefined;
    }
  };

  const sanitizeRequest = (request: bgRequest) => {
    // sanitize request
    // must be an object of only data and origin, origin must be a string of max 50 characters
    // data must be an object of only method and params
    // params must be an object of only keys containing strings of max 50k characters
    // method must be a string of max 50 characters
    // return sanitized request
    const sanitizedRequest = {
      origin: request.origin,
      data: request.data,
    };
    console.log('sanitizedRequest');
    console.log(sanitizedRequest);
    if (
      typeof sanitizedRequest.origin !== 'string' ||
      sanitizedRequest.origin.length > 50
    ) {
      console.log('Invalid origin type');
      return null;
    }
    if (typeof sanitizedRequest.data !== 'object') {
      console.log('Invalid data type');
      return null;
    }
    if (
      typeof sanitizedRequest.data.method !== 'string' ||
      sanitizedRequest.data.method.length > 50
    ) {
      console.log('Invalid method type');
      return null;
    }
    if (
      sanitizedRequest.data.params &&
      typeof sanitizedRequest.data.params !== 'object'
    ) {
      console.log('Invalid params type');
      return null;
    }
    if (sanitizedRequest.data.params) {
      for (const key in sanitizedRequest.data.params) {
        const paramValue =
          sanitizedRequest.data.params[key as keyof dataBgParams];
        // Skip undefined/null values
        if (paramValue === undefined || paramValue === null) {
          continue;
        }
        // authMode is a number, other params are strings
        if (key === 'authMode') {
          if (
            typeof paramValue !== 'number' ||
            (paramValue !== 1 && paramValue !== 2)
          ) {
            console.log('Invalid authMode value: ' + paramValue);
            return null;
          }
        } else {
          if (typeof paramValue !== 'string') {
            console.log('Invalid param type ' + key);
            return null;
          }
          if (paramValue.length > 50000) {
            console.log('Invalid param length ' + key);
            return null;
          }
        }
      }
    }
    return sanitizedRequest;
  };

  useEffect(() => {
    if (browser?.runtime?.onMessage) {
      // this will move to separate lib file
      browser.runtime.onMessage.addListener((originalRequest: bgRequest) => {
        console.log(originalRequest);
        // sanitize request
        if (
          originalRequest &&
          typeof originalRequest === 'object' &&
          originalRequest.origin !== 'ssp-background'
        ) {
          console.log('Ignore Invalid Origin' + originalRequest.origin);
          return;
        }
        const request = sanitizeRequest(originalRequest);
        if (!request) {
          void browser.runtime.sendMessage({
            origin: 'ssp',
            data: {
              status: 'ERROR', // do not translate
              result:
                t('common:request_rejected') +
                ': ' +
                t('home:sspConnect.invalid_request'),
            },
          });
          return;
        }
        if (
          request.data.method === 'sign_message' ||
          request.data.method === 'sspwid_sign_message' ||
          request.data.method === 'wk_sign_message'
        ) {
          if (
            blockchains[request.data.params.chain] ||
            !request.data.params.chain
          ) {
            setChain(request.data.params.chain || identityChain);
            // default to sspwid
            setType(request.data.method);
            setAddress(request.data.params.address || wExternalIdentity); // this can be undefined if its a request before we have identity
            setMessage(request.data.params.message || '');
            // Set authMode and requester info for wk_sign_message
            if (request.data.method === 'wk_sign_message') {
              setAuthMode(request.data.params.authMode ?? 2);
              // Capture requester info - origin is required for wk_sign
              const origin = request.data.params.origin;
              if (
                origin &&
                typeof origin === 'string' &&
                origin.length <= 100
              ) {
                setRequesterInfo({
                  origin,
                  siteName: request.data.params.siteName?.substring(0, 100),
                  description: request.data.params.description?.substring(
                    0,
                    500,
                  ),
                  iconUrl: sanitizeIconUrl(request.data.params.iconUrl),
                });
              } else {
                // Use a fallback if origin not provided
                setRequesterInfo({ origin: 'Unknown' });
              }
            }
          } else {
            console.log('Invalid chain' + request.data.params.chain);
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR', // do not translate
                result: 'REQUEST REJECTED: Invalid chain',
              },
            });
          }
        } else if (request.data.method === 'pay') {
          if (blockchains[request.data.params.chain]) {
            // if the chain has tokens, set the contract
            if (blockchains[request.data.params.chain].tokens) {
              if (request.data.params.contract) {
                // find if the contract is in the tokens array
                const token = blockchains[
                  request.data.params.chain
                ].tokens.find(
                  (t) => t.contract === request.data.params.contract,
                );
                if (!token) {
                  console.log(
                    'Invalid contract' + request.data.params.contract,
                  );
                  void browser.runtime.sendMessage({
                    origin: 'ssp',
                    data: {
                      status: 'ERROR', // do not translate
                      result:
                        t('common:request_rejected') +
                        ': ' +
                        t('home:sspConnect.unsupported_contract'),
                    },
                  });
                  return;
                }
              }
            }
            setChain(request.data.params.chain || identityChain);
            // default to btc
            setAmount(request.data.params.amount || '');
            setType(request.data.method);
            setAddress(request.data.params.address || '');
            setMessage(request.data.params.message || '');
            // if the chain has tokens, set the contract
            if (blockchains[request.data.params.chain].tokens) {
              setContract(request.data.params.contract || ''); // determine what token to send
            }
          } else {
            console.log('Invalid chain' + request.data.params.chain);
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR', // do not translate
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_chain'),
              },
            });
          }
        } else if (
          request.data.method === 'chains_info' ||
          request.data.method === 'user_chains_info' ||
          request.data.method === 'user_chains_addresses_all'
        ) {
          console.log(request.data.method);
          // show dialog asking for approval to get information about all integarted chains in ssp
          setType(request.data.method);
        } else if (request.data.method === 'chain_tokens') {
          console.log(request.data.method);
          // show dialog asking for approval to get information about all tokens for a given chain
          setType(request.data.method);
          setChain(request.data.params.chain || '');
        } else if (request.data.method === 'user_addresses') {
          console.log(request.data.method);
          // show dialog asking for approval to get the list of addresses for a given chain
          setType(request.data.method);
          setChain(request.data.params.chain || '');
        } else {
          console.log('Invalid method' + request.data.method);
          void browser.runtime.sendMessage({
            origin: 'ssp',
            data: {
              status: 'ERROR', // do not translate
              result:
                t('common:request_rejected') +
                ': ' +
                t('home:sspConnect.invalid_method'),
            },
          });
        }
      });
    }
  }, [wExternalIdentity]);

  const clearRequest = () => {
    setType('');
    setAddress('');
    setMessage('');
    setAmount('');
    setChain('');
    setContract('');
    setAuthMode(2);
    setRequesterInfo(null);
  };

  return (
    <SspConnectContext.Provider
      value={{
        type,
        address,
        chain,
        message,
        amount,
        contract,
        authMode,
        requesterInfo,
        clearRequest,
      }}
    >
      {children}
    </SspConnectContext.Provider>
  );
};
