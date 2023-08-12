import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import secureLocalStorage from 'react-secure-storage';
import { Button, Image, Space, Spin } from 'antd';
import './Welcome.css';

function Welcome() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    // if user exists, navigate to login
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
    setIsLoading(false);
  });

  return (
    <>
      {isLoading && <Spin size="large" />}
      {!isLoading && (
        <>
          <br />
          <br />
          <br />
          <Image width={120} preview={false} src="/ssp-logo.svg" />
          <h1>Welcome to SSP Wallet</h1>
          <p className="welcome-text">
            Dual signature wallet for the decentralized world.
            <br />
            <br />
            Secure. Simple. Powerful.
          </p>
          <Space direction="vertical" size="large">
            <Button type="primary" size="large">
              <Link to={'/create'}>Get Started!</Link>
            </Button>
            <Button type="link" block size="small">
              <Link to={'/restore'}>Restore with Seed</Link>
            </Button>
          </Space>
        </>
      )}
    </>
  );
}

export default Welcome;
