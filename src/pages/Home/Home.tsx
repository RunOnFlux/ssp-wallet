import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setFluxInitialState, setPasswordBlobInitialState } from '../../store';
import { Spin, Row, Col, Image } from 'antd';
import './Home.css';
import { LockOutlined, SettingOutlined } from '@ant-design/icons';
import Key from '../../components/Key/Key';
import { generateMultisigAddress } from '../../lib/wallet.ts';

function Navbar() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const logout = () => {
    dispatch(setFluxInitialState());
    dispatch(setPasswordBlobInitialState());
    navigate('/login');
  };
  return (
    <div className="navbar">
      <Row justify="space-evenly">
        <Col span={4}>
          <Image height={30} preview={false} src="/ssp-logo.svg" />
        </Col>
        <Col span={16}>Wallet 1</Col>
        <Col span={4}>
          <SettingOutlined style={{ fontSize: '16px', paddingRight: '6px' }} />{' '}
          <LockOutlined style={{ fontSize: '16px' }} onClick={logout} />
        </Col>
      </Row>
    </div>
  );
}

function App() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(true);
  const { xpubKey, xpubWallet } = useAppSelector((state) => state.flux);

  const generateAddress = () => {
    const { address, redeemScript } = generateMultisigAddress(
      xpubWallet,
      xpubKey,
      0,
      0,
      'flux',
    );
    console.log(address, redeemScript);
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
      {isLoading && <Spin size="large" />}
      {!isLoading && (
        <>
          <Navbar />
          {/* header - logo, Wallet 1, settings, lock address 0.0 FLUX usd value
          actions - send, receive transactions */}
        </>
      )}
      {/* {xpubWallet}
      {xpubKey} */}
      <Key derivationPath="xpub-48-19167-0-0" synchronised={keySynchronised} />
    </>
  );
}

export default App;
