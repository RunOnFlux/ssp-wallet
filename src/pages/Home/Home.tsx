import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { useAppSelector, useAppDispatch } from '../../hooks';
import {
  setFluxInitialState,
  setPasswordBlobInitialState,
  setAddress,
  setRedeemScript,
  setSspWalletIdentity,
  setSspWalletKeyIdentity,
} from '../../store';
import { Spin, Divider, message, Space } from 'antd';
import './Home.css';
import Key from '../../components/Key/Key';
import Navigation from '../../components/Navigation/Navigation';
import Transactions from '../../components/Transactions/Transactions';
import Balances from '../../components/Balances/Balances';
import Navbar from '../../components/Navbar/Navbar';
import AddressContainer from '../../components/AddressContainer/AddressContainer.tsx';
import {
  generateMultisigAddress,
  generateIdentityAddress,
} from '../../lib/wallet.ts';
import { useTranslation } from 'react-i18next';
import { generatedWallets } from '../../types';

function Home() {
  const { t } = useTranslation(['home']);
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(true);
  const { xpubKey, xpubWallet, walletInUse } = useAppSelector(
    (state) => state.flux,
  );
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const generateAddress = () => {
    try {
      const splittedDerPath = walletInUse.split('-');
      const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
      const addressIndex = Number(splittedDerPath[1]);
      const addrInfo = generateMultisigAddress(
        xpubWallet,
        xpubKey,
        typeIndex,
        addressIndex,
        'flux',
      );
      dispatch(setAddress({ wallet: walletInUse, data: addrInfo.address }));
      dispatch(
        setRedeemScript({ wallet: walletInUse, data: addrInfo.redeemScript }),
      );
      // get stored wallets
      void (async function () {
        const generatedWallets: generatedWallets =
          (await localForage.getItem('wallets-flux')) ?? {};
        generatedWallets[walletInUse] = addrInfo.address;
        await localForage.setItem('wallets-flux', generatedWallets);
      })();
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const generateSSPIdentities = () => {
    try {
      // generate ssp wallet identity
      const generatedSspWalletIdentity = generateIdentityAddress(
        xpubWallet,
        'flux',
      );
      dispatch(setSspWalletIdentity(generatedSspWalletIdentity));
      const generatedSspWalletKeyIdentity = generateMultisigAddress(
        xpubWallet,
        xpubKey,
        10,
        0,
        'flux',
      );
      dispatch(setSspWalletKeyIdentity(generatedSspWalletKeyIdentity.address));
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

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
    }
  });

  useEffect(() => {
    if (!xpubKey) return;
    generateAddress();
  }, [walletInUse]);

  useEffect(() => {
    if (!xpubKey) return;
    console.log('Key synchronised.');
    generateAddress();
    generateSSPIdentities();
    setIsLoading(false);
  }, [xpubKey]);

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
    } // else is handled in useEffect
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
