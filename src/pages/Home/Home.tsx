import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoticeType } from 'antd/es/message/interface';
import { useAppSelector, useAppDispatch } from '../../hooks';
import {
  setFluxInitialState,
  setPasswordBlobInitialState,
  setAddress,
  setRedeemScript,
} from '../../store';
import { Spin, Divider, message, Space } from 'antd';
import './Home.css';
import Key from '../../components/Key/Key';
import Navigation from '../../components/Navigation/Navigation';
import Transactions from '../../components/Transactions/Transactions';
import Balances from '../../components/Balances/Balances';
import Navbar from '../../components/Navbar/Navbar';
import AddressContainer from '../../components/AddressContainer/AddressContainer.tsx';
import { generateMultisigAddress } from '../../lib/wallet.ts';

function Home() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(true);
  const { xpubKey, xpubWallet } = useAppSelector((state) => state.flux);
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const generateAddress = () => {
    try {
      const addrInfo = generateMultisigAddress(
        xpubWallet,
        xpubKey,
        0,
        0,
        'flux',
      );
      console.log(addrInfo.address, addrInfo.redeemScript);
      dispatch(setAddress(addrInfo.address));
      dispatch(setRedeemScript(addrInfo.redeemScript));
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', 'PANIC: Invalid SSP Key.');
      console.log(error);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // if not, show modal. onModal close check 2-xpub again
    // if user exists, navigate to login
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    if (!xpubWallet) {
      // we do not have it in redux, navigate to login
      navigate('/login');
      return;
    }
    if (xpubKey) {
      console.log('Key already synchronised.');
      generateAddress();
      setIsLoading(false);
    }
  });

  const keySynchronised = (status: boolean) => {
    if (status === false) {
      // logout
      void (async function () {
        if (chrome?.storage?.session) {
          try {
            await chrome.storage.session.clear();
          } catch (error) {
            console.log(error);
          }
        }
        dispatch(setFluxInitialState());
        dispatch(setPasswordBlobInitialState());
        navigate('/login');
      })();
    } else {
      console.log('Key synchronised.');
      generateAddress();
      setIsLoading(false);
    }
  };
  return (
    <>
      {contextHolder}
      {isLoading && <Spin size="large" />}
      {!isLoading && (
        <>
          <Navbar />
          <Divider />
          <Space direction="vertical">
            <AddressContainer />
            <Balances />
            <Navigation />
            <Transactions />
          </Space>
        </>
      )}
      <Key derivationPath="xpub-48-19167-0-0" synchronised={keySynchronised} />
    </>
  );
}

export default Home;
