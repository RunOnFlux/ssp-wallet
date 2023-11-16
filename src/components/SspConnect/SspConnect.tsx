import { useEffect, useState } from 'react';
import { useSspConnect } from '../../hooks/useSspConnect';
import SignMessage from '../../components/SignMessage/SignMessage';
import { useTranslation } from 'react-i18next';
import { cryptos } from '../../types';

interface signMessageData {
  status: string;
  result: string;
}

function SspConnect() {
  const {
    address: sspConnectAddress,
    message: sspConnectMessage,
    chain: sspConnectChain,
    clearRequest,
  } = useSspConnect();
  const { t } = useTranslation(['common']);
  const [openSignMessage, setOpenSignMessage] = useState(false);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [chain, setChain] = useState('');

  useEffect(() => {
    console.log(sspConnectMessage);
    if (sspConnectMessage) {
      setAddress(sspConnectAddress);
      setMessage(sspConnectMessage);
      setChain(sspConnectChain);
      setOpenSignMessage(true);
      clearRequest?.();
    }
  }, [sspConnectMessage]);

  const signMessageAction = (data: signMessageData | null) => {
    if (chrome?.runtime?.sendMessage) {
      // we do not use sendResponse, instead we are sending new message
      if (!data) {
        // reject message
        void chrome.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: t('common:error'),
            result: 'REQUEST REJECTED',
          },
        });
      } else {
        void chrome.runtime.sendMessage({
          origin: 'ssp',
          data,
        });
      }
    } else {
      console.log('no chrome.runtime.sendMessage');
    }
    setOpenSignMessage(false);
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
    </>
  );
}

export default SspConnect;
