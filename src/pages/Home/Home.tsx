import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { useAppSelector, useAppDispatch } from '../../hooks';
import {
  setSSPInitialState,
  setInitialStateForAllChains,
  setPasswordBlobInitialState,
  setAddress,
  setRedeemScript,
  setWitnessScript,
  setSspWalletInternalIdentity,
  setSspWalletKeyInternalIdentity,
  setSspWalletExternalIdentity,
} from '../../store';
import { Spin, Divider, message, Space, Tabs } from 'antd';
import './Home.css';
import Key from '../../components/Key/Key';
import Navigation from '../../components/Navigation/Navigation';
import Transactions from '../../components/Transactions/Transactions';
import Nodes from '../../components/Nodes/Nodes';
import Balances from '../../components/Balances/Balances';
import Navbar from '../../components/Navbar/Navbar';
import AddressContainer from '../../components/AddressContainer/AddressContainer.tsx';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import SspConnect from '../../components/SspConnect/SspConnect.tsx';
import {
  generateMultisigAddress,
  generateInternalIdentityAddress,
  generateExternalIdentityAddress,
} from '../../lib/wallet.ts';
import { useTranslation } from 'react-i18next';
import { generatedWallets } from '../../types';

function Home() {
  const { t } = useTranslation(['home']);
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(true);
  const { activeChain, identityChain } = useAppSelector(
    (state) => state.sspState,
  );
  const { xpubKey: xpubKeyIdentity, xpubWallet: xpubWalletIdentity } =
    useAppSelector((state) => state[identityChain]);
  const { xpubKey, xpubWallet, walletInUse, wallets } = useAppSelector(
    (state) => state[activeChain],
  );
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const refresh = () => {
    console.log('kapp');
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
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
        activeChain,
      );
      setAddress(activeChain, walletInUse, addrInfo.address);
      setRedeemScript(activeChain, walletInUse, addrInfo.redeemScript ?? '');
      setWitnessScript(activeChain, walletInUse, addrInfo.witnessScript ?? '');
      // get stored wallets
      void (async function () {
        const generatedWallets: generatedWallets =
          (await localForage.getItem('wallets-' + activeChain)) ?? {};
        generatedWallets[walletInUse] = addrInfo.address;
        await localForage.setItem('wallets-' + activeChain, generatedWallets);
      })();
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const generateSSPIdentity = () => {
    try {
      // generate ssp wallet identity
      console.log(xpubWalletIdentity);
      console.log(xpubKeyIdentity);
      const generatedSspWalletInternalIdentity =
        generateInternalIdentityAddress(xpubWalletIdentity, identityChain);
      dispatch(
        setSspWalletInternalIdentity(generatedSspWalletInternalIdentity),
      );
      const generatedSspWalletKeyInternalIdentity = generateMultisigAddress(
        xpubWalletIdentity,
        xpubKeyIdentity,
        10,
        0,
        identityChain,
      );
      dispatch(
        setSspWalletKeyInternalIdentity(
          generatedSspWalletKeyInternalIdentity.address,
        ),
      );
      const generatedSspWalletExternaldentity =
        generateExternalIdentityAddress(xpubWalletIdentity);
      dispatch(setSspWalletExternalIdentity(generatedSspWalletExternaldentity));
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
    if (!xpubKeyIdentity) return;
    console.log('Key of Identity synchronised.');
    generateSSPIdentity();
  }, [xpubKeyIdentity]);

  useEffect(() => {
    if (!xpubKey) return;
    console.log('Key of Chain synchronised.');
    generateAddress();
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
        setInitialStateForAllChains();
        dispatch(setSSPInitialState());
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
        <div style={{ paddingBottom: '43px' }}>
          <Navbar refresh={refresh} hasRefresh={true} />
          <Divider />
          <Space direction="vertical">
            <AddressContainer />
            <Balances />
            <Navigation />
          </Space>
          {wallets?.[walletInUse]?.nodes && (
            <Tabs
              defaultActiveKey="activity"
              size="small"
              centered
              tabBarStyle={{ marginBottom: 0 }}
              items={[
                {
                  label: 'Activity',
                  key: 'activity',
                  children: <Transactions />,
                },
                {
                  label: 'Nodes',
                  key: 'nodes',
                  children: <Nodes />,
                },
              ]}
            />
          )}
          {wallets?.[walletInUse] && !wallets[walletInUse].nodes && (
            <Transactions />
          )}
        </div>
      )}
      <Key synchronised={keySynchronised} />
      <SspConnect />
      <PoweredByFlux />
    </>
  );
}

export default Home;
