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
  orgIndex: number; // enterprise vault org index
  vaultName: string; // enterprise vault name
  orgName: string; // enterprise org name
  // enterprise vault sign tx params
  vaultIndex: number; // enterprise vault index
  recipients: string; // JSON string of recipients array
  fee: string; // transaction fee
  memo: string; // transaction memo
  rawUnsignedTx: string; // raw unsigned transaction hex
  inputDetails: string; // JSON string of input details array
  reservedNonce?: { kPublic: string; kTwoPublic: string }; // EVM wallet enterprise nonce
  reservedKeyNonce?: { kPublic: string; kTwoPublic: string }; // EVM key enterprise nonce
  keyXpub?: string; // Key's vault xpub for EVM Schnorr signing
  allSignerKeys?: string[]; // EVM M-of-N: all 2M public keys hex (canonical order)
  allSignerNonces?: Array<{ kPublic: string; kTwoPublic: string }>; // EVM M-of-N: all 2M nonces
  // ERC-20 token metadata (EVM only)
  tokenContract?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  clearRequest?: () => void;
}

const defaultValue: SspConnectContextType = {
  type: '', // only sign_message and sspwid_sign_message and pay and wk_sign_message and enterprise_vault_xpub and enterprise_vault_sign_tx
  address: '', // address to sign with
  message: '', // message to sign
  amount: '', // amount to pay
  chain: '', // chain to sign with
  contract: '', // contract to send token from
  authMode: 2, // default to 2-of-2 for wk_sign
  requesterInfo: null, // requester info for wk_sign
  orgIndex: 0, // enterprise vault org index
  vaultName: '', // enterprise vault name
  orgName: '', // enterprise org name
  // enterprise vault sign tx defaults
  vaultIndex: 0,
  recipients: '',
  fee: '',
  memo: '',
  rawUnsignedTx: '',
  inputDetails: '',
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
  // Enterprise vault xpub params
  orgIndex?: number; // enterprise org index (positive integer)
  vaultName?: string; // enterprise vault name
  orgName?: string; // enterprise org name
  // Enterprise vault sign tx params
  vaultIndex?: number; // enterprise vault index (non-negative integer)
  recipients?: string; // JSON string of recipients array
  fee?: string; // transaction fee
  memo?: string; // transaction memo
  rawUnsignedTx?: string; // raw unsigned transaction hex
  inputDetails?: string; // JSON string of input details array
  reservedNonce?: { kPublic: string; kTwoPublic: string }; // EVM wallet nonce for signing
  reservedKeyNonce?: { kPublic: string; kTwoPublic: string }; // EVM key nonce for Key signing
  keyXpub?: string; // Key's vault xpub for EVM Schnorr signing
  allSignerKeys?: string; // JSON string of all 2M public keys hex
  allSignerNonces?: string; // JSON string of all 2M nonces
  // ERC-20 token metadata (EVM only)
  tokenContract?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
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
  const [orgIndex, setOrgIndex] = useState(0);
  const [vaultName, setVaultName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [vaultIndex, setVaultIndex] = useState(0);
  const [recipients, setRecipients] = useState('');
  const [fee, setFee] = useState('');
  const [memo, setMemo] = useState('');
  const [rawUnsignedTx, setRawUnsignedTx] = useState('');
  const [inputDetails, setInputDetails] = useState('');
  const [reservedNonce, setReservedNonce] = useState<
    { kPublic: string; kTwoPublic: string } | undefined
  >(undefined);
  const [reservedKeyNonce, setReservedKeyNonce] = useState<
    { kPublic: string; kTwoPublic: string } | undefined
  >(undefined);
  const [keyXpub, setKeyXpub] = useState<string | undefined>(undefined);
  const [allSignerKeys, setAllSignerKeys] = useState<string[] | undefined>(
    undefined,
  );
  const [allSignerNonces, setAllSignerNonces] = useState<
    Array<{ kPublic: string; kTwoPublic: string }> | undefined
  >(undefined);
  const [tokenContract, setTokenContract] = useState<string | undefined>(
    undefined,
  );
  const [tokenSymbol, setTokenSymbol] = useState<string | undefined>(undefined);
  const [tokenDecimals, setTokenDecimals] = useState<number | undefined>(
    undefined,
  );
  const { t } = useTranslation(['home', 'common']);
  const browser = window.chrome || window.browser;

  // Port connection enables background.js to detect if UI (popup/sidepanel) is open
  useEffect(() => {
    if (!browser?.runtime?.connect) return;
    const port = browser.runtime.connect({ name: 'ssp-ui' });
    return () => {
      try {
        port.disconnect();
      } catch {
        /* Port already disconnected */
      }
    };
  }, []);

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
        // authMode, orgIndex, and vaultIndex are numbers, other params are strings
        if (key === 'authMode') {
          if (
            typeof paramValue !== 'number' ||
            (paramValue !== 1 && paramValue !== 2)
          ) {
            console.log('Invalid authMode value:', paramValue);
            return null;
          }
        } else if (key === 'orgIndex') {
          if (
            typeof paramValue !== 'number' ||
            !Number.isInteger(paramValue) ||
            paramValue < 100 ||
            paramValue > 99999
          ) {
            console.log('Invalid orgIndex value:', paramValue);
            return null;
          }
        } else if (key === 'vaultIndex') {
          if (
            typeof paramValue !== 'number' ||
            !Number.isInteger(paramValue) ||
            paramValue < 0 ||
            paramValue > 99
          ) {
            console.log('Invalid vaultIndex value:', paramValue);
            return null;
          }
        } else if (key === 'reservedNonce' || key === 'reservedKeyNonce') {
          // EVM enterprise nonce objects — validate structure
          if (
            typeof paramValue !== 'object' ||
            typeof (paramValue as Record<string, unknown>).kPublic !==
              'string' ||
            typeof (paramValue as Record<string, unknown>).kTwoPublic !==
              'string'
          ) {
            console.log('Invalid ' + key + ' value');
            return null;
          }
        } else if (key === 'tokenDecimals') {
          // ERC-20 token decimals — non-negative integer
          if (
            typeof paramValue !== 'number' ||
            !Number.isInteger(paramValue) ||
            paramValue < 0
          ) {
            console.log('Invalid tokenDecimals value:', paramValue);
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
      const handler = (originalRequest: bgRequest) => {
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
              status: 'ERROR',
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
                status: 'ERROR',
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
                      status: 'ERROR',
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
                status: 'ERROR',
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
        } else if (request.data.method === 'enterprise_vault_xpub') {
          // Validate required params for enterprise vault xpub
          const vaultChain = request.data.params.chain;
          const vaultOrgIndex = request.data.params.orgIndex;
          const vaultNameParam = request.data.params.vaultName;
          const orgNameParam = request.data.params.orgName;

          if (!vaultChain || !blockchains[vaultChain]) {
            console.log('Invalid chain for enterprise_vault_xpub');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_chain'),
              },
            });
            return;
          }
          if (
            typeof vaultOrgIndex !== 'number' ||
            !Number.isInteger(vaultOrgIndex) ||
            vaultOrgIndex < 100 ||
            vaultOrgIndex > 99999
          ) {
            console.log('Invalid orgIndex for enterprise_vault_xpub');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }
          if (
            typeof vaultNameParam !== 'string' ||
            !vaultNameParam ||
            vaultNameParam.length > 100
          ) {
            console.log('Invalid vaultName for enterprise_vault_xpub');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }
          if (
            typeof orgNameParam !== 'string' ||
            !orgNameParam ||
            orgNameParam.length > 100
          ) {
            console.log('Invalid orgName for enterprise_vault_xpub');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }

          setChain(vaultChain);
          setOrgIndex(vaultOrgIndex);
          setVaultName(vaultNameParam);
          setOrgName(orgNameParam);
          setType('enterprise_vault_xpub');

          // Capture requester info
          const origin = request.data.params.origin;
          if (origin && typeof origin === 'string' && origin.length <= 100) {
            setRequesterInfo({
              origin,
              siteName: request.data.params.siteName?.substring(0, 100),
              iconUrl: sanitizeIconUrl(request.data.params.iconUrl),
            });
          } else {
            setRequesterInfo({ origin: 'Unknown' });
          }
        } else if (request.data.method === 'enterprise_vault_sign_tx') {
          // Validate required params for enterprise vault sign tx
          const signChain = request.data.params.chain;
          const signOrgIndex = request.data.params.orgIndex;
          const signVaultIndex = request.data.params.vaultIndex;
          const signRecipients = request.data.params.recipients;
          const signFee = request.data.params.fee;
          const signMemo = request.data.params.memo;
          const signRawUnsignedTx = request.data.params.rawUnsignedTx;
          const signInputDetails = request.data.params.inputDetails;
          const signVaultName = request.data.params.vaultName;
          const signOrgName = request.data.params.orgName;

          if (!signChain || !blockchains[signChain]) {
            console.log('Invalid chain for enterprise_vault_sign_tx');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_chain'),
              },
            });
            return;
          }
          if (
            typeof signOrgIndex !== 'number' ||
            !Number.isInteger(signOrgIndex) ||
            signOrgIndex < 100 ||
            signOrgIndex > 99999
          ) {
            console.log('Invalid orgIndex for enterprise_vault_sign_tx');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }
          if (
            typeof signVaultIndex !== 'number' ||
            !Number.isInteger(signVaultIndex) ||
            signVaultIndex < 0 ||
            signVaultIndex > 99
          ) {
            console.log('Invalid vaultIndex for enterprise_vault_sign_tx');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }
          if (typeof signRecipients !== 'string' || !signRecipients) {
            console.log('Invalid recipients for enterprise_vault_sign_tx');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }
          if (typeof signFee !== 'string' || !signFee) {
            console.log('Invalid fee for enterprise_vault_sign_tx');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }
          if (typeof signRawUnsignedTx !== 'string' || !signRawUnsignedTx) {
            console.log('Invalid rawUnsignedTx for enterprise_vault_sign_tx');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }
          if (typeof signInputDetails !== 'string' || !signInputDetails) {
            console.log('Invalid inputDetails for enterprise_vault_sign_tx');
            void browser.runtime.sendMessage({
              origin: 'ssp',
              data: {
                status: 'ERROR',
                result:
                  t('common:request_rejected') +
                  ': ' +
                  t('home:sspConnect.invalid_request'),
              },
            });
            return;
          }

          setChain(signChain);
          setOrgIndex(signOrgIndex);
          setVaultIndex(signVaultIndex);
          setRecipients(signRecipients);
          setFee(signFee);
          setMemo(signMemo || '');
          setRawUnsignedTx(signRawUnsignedTx);
          setInputDetails(signInputDetails);
          setVaultName(typeof signVaultName === 'string' ? signVaultName : '');
          setOrgName(typeof signOrgName === 'string' ? signOrgName : '');
          // EVM enterprise nonce (optional)
          const signReservedNonce = request.data.params.reservedNonce;
          if (
            signReservedNonce &&
            typeof signReservedNonce === 'object' &&
            typeof signReservedNonce.kPublic === 'string' &&
            typeof signReservedNonce.kTwoPublic === 'string'
          ) {
            setReservedNonce(signReservedNonce);
          } else {
            setReservedNonce(undefined);
          }
          // EVM enterprise key nonce (optional — forwarded to Key for signing)
          const signReservedKeyNonce = request.data.params.reservedKeyNonce;
          if (
            signReservedKeyNonce &&
            typeof signReservedKeyNonce === 'object' &&
            typeof signReservedKeyNonce.kPublic === 'string' &&
            typeof signReservedKeyNonce.kTwoPublic === 'string'
          ) {
            setReservedKeyNonce(signReservedKeyNonce);
          } else {
            setReservedKeyNonce(undefined);
          }
          // Key's vault xpub (optional — for EVM Schnorr pubkey derivation)
          const signKeyXpub = request.data.params.keyXpub;
          setKeyXpub(
            typeof signKeyXpub === 'string' && signKeyXpub
              ? signKeyXpub
              : undefined,
          );
          // EVM M-of-N: all signer keys and nonces (optional JSON strings)
          const signAllSignerKeys = request.data.params.allSignerKeys;
          if (typeof signAllSignerKeys === 'string' && signAllSignerKeys) {
            try {
              const parsed = JSON.parse(signAllSignerKeys) as unknown;
              if (
                Array.isArray(parsed) &&
                parsed.every((k) => typeof k === 'string')
              ) {
                setAllSignerKeys(parsed);
              } else {
                setAllSignerKeys(undefined);
              }
            } catch {
              setAllSignerKeys(undefined);
            }
          } else {
            setAllSignerKeys(undefined);
          }
          const signAllSignerNonces = request.data.params.allSignerNonces;
          if (typeof signAllSignerNonces === 'string' && signAllSignerNonces) {
            try {
              const parsed = JSON.parse(signAllSignerNonces) as unknown;
              if (
                Array.isArray(parsed) &&
                parsed.every(
                  (n) =>
                    typeof n === 'object' &&
                    n !== null &&
                    typeof (n as Record<string, unknown>).kPublic ===
                      'string' &&
                    typeof (n as Record<string, unknown>).kTwoPublic ===
                      'string',
                )
              ) {
                setAllSignerNonces(
                  parsed as Array<{ kPublic: string; kTwoPublic: string }>,
                );
              } else {
                setAllSignerNonces(undefined);
              }
            } catch {
              setAllSignerNonces(undefined);
            }
          } else {
            setAllSignerNonces(undefined);
          }
          // ERC-20 token metadata (optional)
          const signTokenContract = request.data.params.tokenContract;
          setTokenContract(
            typeof signTokenContract === 'string' && signTokenContract
              ? signTokenContract
              : undefined,
          );
          const signTokenSymbol = request.data.params.tokenSymbol;
          setTokenSymbol(
            typeof signTokenSymbol === 'string' && signTokenSymbol
              ? signTokenSymbol
              : undefined,
          );
          const signTokenDecimals = request.data.params.tokenDecimals;
          setTokenDecimals(
            typeof signTokenDecimals === 'number' &&
              Number.isInteger(signTokenDecimals) &&
              signTokenDecimals >= 0
              ? signTokenDecimals
              : undefined,
          );

          setType('enterprise_vault_sign_tx');

          // Capture requester info
          const signOrigin = request.data.params.origin;
          if (
            signOrigin &&
            typeof signOrigin === 'string' &&
            signOrigin.length <= 100
          ) {
            setRequesterInfo({
              origin: signOrigin,
              siteName: request.data.params.siteName?.substring(0, 100),
              iconUrl: sanitizeIconUrl(request.data.params.iconUrl),
            });
          } else {
            setRequesterInfo({ origin: 'Unknown' });
          }
        } else {
          console.log('Invalid method' + request.data.method);
          void browser.runtime.sendMessage({
            origin: 'ssp',
            data: {
              status: 'ERROR',
              result:
                t('common:request_rejected') +
                ': ' +
                t('home:sspConnect.invalid_method'),
            },
          });
        }
      };
      browser.runtime.onMessage.addListener(handler);
      return () => {
        browser.runtime.onMessage.removeListener(handler);
      };
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
    setOrgIndex(0);
    setVaultName('');
    setOrgName('');
    setVaultIndex(0);
    setRecipients('');
    setFee('');
    setMemo('');
    setRawUnsignedTx('');
    setInputDetails('');
    setReservedNonce(undefined);
    setReservedKeyNonce(undefined);
    setKeyXpub(undefined);
    setAllSignerKeys(undefined);
    setAllSignerNonces(undefined);
    setTokenContract(undefined);
    setTokenSymbol(undefined);
    setTokenDecimals(undefined);
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
        orgIndex,
        vaultName,
        orgName,
        vaultIndex,
        recipients,
        fee,
        memo,
        rawUnsignedTx,
        inputDetails,
        reservedNonce,
        reservedKeyNonce,
        keyXpub,
        allSignerKeys,
        allSignerNonces,
        tokenContract,
        tokenSymbol,
        tokenDecimals,
        clearRequest,
      }}
    >
      {children}
    </SspConnectContext.Provider>
  );
};
