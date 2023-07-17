import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import secureLocalStorage from 'react-secure-storage';
import { Typography, Button, Image, Space } from 'antd';
import './Welcome.css';

const { Title } = Typography;

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
      <Title level={2}>Welcome to SSP Wallet</Title>
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
        <Button type="link" block size="small" className="">
          <Link to={`/recover`}>Recover</Link>
        </Button>
      </Space>
    </>
  );
}

export default App;
