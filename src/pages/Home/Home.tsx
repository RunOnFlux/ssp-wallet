import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setXpubInitialState } from '../../store';
import { Spin, Row, Col } from 'antd';
import './Home.css';
import Key from '../../components/Key/Key';

function App() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(true);
  const { xpubKey, xpubWallet } = useAppSelector((state) => state.xpubs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!xpubWallet) {
      // we do not have it in redux, navigate to login
      navigate('/login');
      return;
    }
    // if not, show modal. onModal close check 2-xpub again
    // if user exists, navigate to login
    setIsLoading(false);
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
        dispatch(setXpubInitialState());
        navigate('/login');
      })();
    } else {
      console.log('Key synchronised.');
    }
  };

  return (
    <>
      {isLoading && <Spin size="large" />}
      {!isLoading && (
        <>
          <Row>
            <Col span={4}>logo</Col>
            <Col span={16}>Wallet 1</Col>
            <Col span={4}>lock</Col>
          </Row>
          header - logo, Wallet 1, settings, lock address 0.0 FLUX usd value
          actions - send, receive transactions
        </>
      )}
      {xpubWallet}
      {xpubKey}
      <Key derivationPath="xpub-48-19167-0-0" synchronised={keySynchronised} />
    </>
  );
}

export default App;
