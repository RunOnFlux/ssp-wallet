import { useEffect, useState } from 'react';
import { useSspConnect } from '../../hooks/useSspConnect';
import SignMessage from '../../components/SignMessage/SignMessage';
import PaymentRequest from '../../components/PaymentRequest/PaymentRequest';
import { useTranslation } from 'react-i18next';
import { cryptos } from '../../types';

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

function SspConnect() {
  const {
    address: sspConnectAddress,
    message: sspConnectMessage,
    chain: sspConnectChain,
    amount: sspConnectAmount,
    type: sspConnectType,
    clearRequest,
  } = useSspConnect();
  const { t } = useTranslation(['common']);
  const [openSignMessage, setOpenSignMessage] = useState(false);
  const [openPayRequest, setOpenPayRequest] = useState(false);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [chain, setChain] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    console.log(sspConnectMessage);
    if (sspConnectType) {
      setAddress(sspConnectAddress);
      setMessage(sspConnectMessage);
      setChain(sspConnectChain);
      setAmount(sspConnectAmount);
      if (
        sspConnectType === 'sign_message' ||
        sspConnectType === 'sspwid_sign_message'
      ) {
        setOpenSignMessage(true);
      } else if (sspConnectType === 'pay') {
        // show poup with information that we are going to pay after user approval
        // here we should navigate to send page, change chain and input proper address, message, amount.
        console.log(amount);
        setOpenPayRequest(true);
      }
      clearRequest?.();
    }
  }, [sspConnectMessage]);

  const signMessageAction = (data: signMessageData | null) => {
    if (window?.chrome?.runtime?.sendMessage) {
      // we do not use sendResponse, instead we are sending new message
      if (!data) {
        // reject message
        void window.chrome.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: t('common:error'),
            result: t('common:request_rejected'),
          },
        });
      } else {
        void window.chrome.runtime.sendMessage({
          origin: 'ssp',
          data,
        });
      }
    } else if (window?.browser?.runtime?.sendMessage) { 
      // we do not use sendResponse, instead we are sending new message
      if (!data) {
        // reject message
        void window.browser.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: t('common:error'),
            result: t('common:request_rejected'),
          },
        });
      } else {
        void window.browser.runtime.sendMessage({
          origin: 'ssp',
          data,
        });
      }
    } else {
      console.log('no browser or chrome runtime.sendMessage');
    }
    setOpenSignMessage(false);
  };
  const payRequestAction = (data: paymentData | null | 'continue') => {
    console.log(data);
    setOpenPayRequest(false);
    if (data === 'continue') {
      return;
    }
    if (window?.chrome?.runtime?.sendMessage) {
      // we do not use sendResponse, instead we are sending new message
      if (!data) {
        // reject message
        void window.chrome.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: t('common:error'),
            result: t('common:request_rejected'),
          },
        });
      } else {
        void window.chrome.runtime.sendMessage({
          origin: 'ssp',
          data,
        });
      }
    } else if (window?.browser?.runtime?.sendMessage) {
      // we do not use sendResponse, instead we are sending new message
      if (!data) {
        // reject message
        void window.browser.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: t('common:error'),
            result: t('common:request_rejected'),
          },
        });
      } else {
        void window.browser.runtime.sendMessage({
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
        openAction={signMessageAction}
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
        chain={chain as keyof cryptos}
      />
    </>
  );
}

export default SspConnect;
