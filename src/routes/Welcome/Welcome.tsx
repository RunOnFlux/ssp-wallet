import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import secureLocalStorage from 'react-secure-storage';
import { Button, Image, Space } from 'antd';
import './Welcome.css';

function App() {
  const navigate = useNavigate();
  useEffect(() => {
    // if user exists, navigate to login
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
  });

  return (
    <>
      <Image width={120} preview={false} src="/ssp-logo.svg" />
      <h1>Welcome to SSP Wallet</h1>
      <p className="welcome-text">
        Dual signature wallet for the decentralized world.
        <br />
        <br />
        Simple. Secure. Powerful.
      </p>
      <Space direction="vertical" size="large">
        <Button type="primary" size="large">
          <Link to={`/create`}>Get Started!</Link>
        </Button>
        <Button type="link" block size="small">
          <Link to={`/restore`}>Restore with Seed</Link>
        </Button>
      </Space>
    </>
  );
}

export default App;
