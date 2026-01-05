import { useEffect, useState } from 'react';
import { useSspConnect } from '../../hooks/useSspConnect';
import SignMessage from '../../components/SignMessage/SignMessage';
import PaymentRequest from '../../components/PaymentRequest/PaymentRequest';
import ChainsInfo from '../../components/ChainsInfo/ChainsInfo';
import TokensInfo from '../../components/TokensInfo/TokensInfo';
import AddressesInfo from '../../components/AddressesInfo/AddressesInfo';
import AllAddressesInfo from '../../components/AllAddressesInfo/AllAddressesInfo';
import WkSign from '../../components/WkSign/WkSign';
import { useTranslation } from 'react-i18next';
import { cryptos } from '../../types';
import { WkSignResponse, WkSignRequesterInfo } from '../../lib/wkSign';

interface signMessageData {
  status: string;
  address?: string;
  signature?: string;
  message?: string;
  data?: string;
}

interface paymentData {
  status: string;
  txid?: string;
  data?: string;
}

interface wkSignData {
  status: string;
  result?: WkSignResponse;
  data?: string;
}

function SspConnect() {
  const {
    address: sspConnectAddress,
    message: sspConnectMessage,
    chain: sspConnectChain,
    amount: sspConnectAmount,
    type: sspConnectType,
    contract: sspConnectContract,
    authMode: sspConnectAuthMode,
    requesterInfo: sspConnectRequesterInfo,
    clearRequest,
  } = useSspConnect();
  const { t } = useTranslation(['common', 'home']);
  const [openSignMessage, setOpenSignMessage] = useState(false);
  const [openPayRequest, setOpenPayRequest] = useState(false);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [chain, setChain] = useState('');
  const [amount, setAmount] = useState('');
  const browser = window.chrome || window.browser;
  const [contract, setContract] = useState('');
  const [openChainsInfo, setOpenChainsInfo] = useState(false);
  const [userOnlyChains, setUserOnlyChains] = useState(false);
  const [openTokensInfo, setOpenTokensInfo] = useState(false);
  const [openAddressesInfo, setOpenAddressesInfo] = useState(false);
  const [openAllAddressesInfo, setOpenAllAddressesInfo] = useState(false);
  const [openWkSign, setOpenWkSign] = useState(false);
  const [authMode, setAuthMode] = useState<1 | 2>(2);
  const [requesterInfo, setRequesterInfo] =
    useState<WkSignRequesterInfo | null>(null);

  useEffect(() => {
    console.log(sspConnectMessage);
    if (sspConnectType) {
      setAddress(sspConnectAddress);
      setMessage(sspConnectMessage);
      setChain(sspConnectChain);
      setAmount(sspConnectAmount);
      setContract(sspConnectContract);
      if (
        sspConnectType === 'sign_message' ||
        sspConnectType === 'sspwid_sign_message'
      ) {
        setOpenSignMessage(true);
      } else if (sspConnectType === 'wk_sign_message') {
        // wk_sign uses authMode from request (1 = wallet only, 2 = wallet + key)
        setAuthMode(sspConnectAuthMode === 1 ? 1 : 2);
        // Capture requesterInfo before clearRequest clears it
        setRequesterInfo(sspConnectRequesterInfo);
        setOpenWkSign(true);
      } else if (sspConnectType === 'pay') {
        // show poup with information that we are going to pay after user approval
        // here we should navigate to send page, change chain and input proper address, message, amount.
        console.log(amount);
        setOpenPayRequest(true);
      } else if (sspConnectType === 'chains_info') {
        // show poup that someone is asking to get all chains information and what information is being given
        setUserOnlyChains(false);
        setOpenChainsInfo(true);
      } else if (sspConnectType === 'user_chains_info') {
        // show poup that someone is asking to get all chains information and what information is being given
        setUserOnlyChains(true);
        setOpenChainsInfo(true);
      } else if (sspConnectType === 'chain_tokens') {
        // show poup that someone is asking to get all tokens for a chain
        setOpenTokensInfo(true);
      } else if (sspConnectType === 'user_addresses') {
        // show poup that someone is asking to get all addresses for a chain
        setOpenAddressesInfo(true);
      } else if (sspConnectType === 'user_chains_addresses_all') {
        // show poup that someone is asking to get all addresses for all chains
        setOpenAllAddressesInfo(true);
      } else {
        generalAction({
          status: 'ERROR', // do not translate
          data:
            t('common:request_rejected') +
            ': ' +
            t('home:sspConnect.invalid_method'),
        });
      }
      console.log('sspConnectType');
      console.log(sspConnectType);
      clearRequest?.();
    }
  }, [sspConnectType]);

  const generalAction = (data: signMessageData | null) => {
    if (browser?.runtime?.sendMessage) {
      if (!data) {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: 'ERROR',
            result: t('common:request_rejected'),
          },
        });
      } else {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data,
        });
      }
    } else {
      console.log('no browser or chrome runtime.sendMessage');
    }
    setOpenSignMessage(false);
    setOpenChainsInfo(false);
    setOpenTokensInfo(false);
    setOpenAddressesInfo(false);
    setOpenAllAddressesInfo(false);
    setOpenWkSign(false);
  };

  const wkSignAction = (data: wkSignData | null) => {
    console.log('[WkSign] Action result:', data);
    setOpenWkSign(false);
    if (browser?.runtime?.sendMessage) {
      if (!data) {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: 'ERROR',
            result: t('common:request_rejected'),
          },
        });
      } else {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data,
        });
      }
    } else {
      console.log('no browser or chrome runtime.sendMessage');
    }
  };
  const payRequestAction = (data: paymentData | null | 'continue') => {
    console.log(data);
    setOpenPayRequest(false);
    if (data === 'continue') {
      return;
    }
    if (browser?.runtime?.sendMessage) {
      if (!data) {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: 'ERROR',
            result: t('common:request_rejected'),
          },
        });
      } else {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data,
        });
      }
    } else {
      console.log('no browser or chrome runtime.sendMessage');
    }
  };
  return (
    <>
      <SignMessage
        open={openSignMessage}
        openAction={generalAction}
        address={address}
        message={message}
        chain={chain as keyof cryptos}
      />
      <PaymentRequest
        open={openPayRequest}
        openAction={payRequestAction}
        address={address}
        message={message}
        amount={amount}
        contract={contract}
        chain={chain as keyof cryptos}
      />
      <ChainsInfo
        open={openChainsInfo}
        openAction={generalAction}
        userOnly={userOnlyChains}
      />
      <TokensInfo
        open={openTokensInfo}
        openAction={generalAction}
        chain={chain as keyof cryptos}
      />
      <AddressesInfo
        open={openAddressesInfo}
        openAction={generalAction}
        chain={chain as keyof cryptos}
      />
      <AllAddressesInfo
        open={openAllAddressesInfo}
        openAction={generalAction}
      />
      <WkSign
        open={openWkSign}
        openAction={wkSignAction}
        message={message}
        authMode={authMode}
        requesterInfo={requesterInfo}
      />
    </>
  );
}

export default SspConnect;
