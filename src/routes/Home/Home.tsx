import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { Spin, Row, Col, Modal, QRCode } from 'antd';
import './Home.css';

function App() {
  const navigate = useNavigate();
  const [isModalKeyOpen, setIsModalKeyOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { xpubKey, xpubWallet } = useAppSelector((state) => state.xpubs);
  console.log(xpubKey);
  console.log(xpubWallet);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!xpubWallet) {
      // we do not have it in redux, navigate to login
      navigate('/login');
      return;
    }
    // check if we have 2-xpub-48-19167-0-0
    if (!xpubKey) {
      // no xpubKey, show modal of Key
      setIsModalKeyOpen(true);
    }
    // if not, show modal. onModal close check 2-xpub again
    // if user exists, navigate to login
    setIsLoading(false);
  });

  const handleOkModalKey = () => {
    // display dialog awaiting synchronisation. This is automatic stuff
    console.log('here');
  };

  const handleCancelModalKey = () => {
    console.log('cancel');
    // display confirmation dialog and tell that we are 2fa. If no Key, log out.
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
      <Modal
        title="Dual Factor SSP Key"
        open={isModalKeyOpen}
        onOk={handleOkModalKey}
        onCancel={handleCancelModalKey}
        okText="Alrighty"
        style={{ textAlign: 'center' }}
      >
        <p>
          SSP Wallet is a Dual Signature Wallet. You will need to download SSP
          Key on your mobile device to access your wallet.
          <br />
          SSP Key acts as a second factor authentication to your wallet, nobody
          can access your wallet without your SSP Key.
          <br />
          SSP Key is a fully self-custody second signature. You will need to
          backup SSP Key Seed Phrase alongside your SSP Wallet Seed Phrase too!
          <br />
          Loss of your SSP Key Seed Phrase will result in loss of access to your
          wallet.
          <br />
          Scan following QR code to sync your SSP Wallet with your SSP Key.
        </p>
        {xpubWallet}

        <QRCode
          errorLevel="H"
          value={xpubWallet}
          icon="/ssp-logo.svg"
          size={256}
        />
        <br />
        <br />
      </Modal>
    </>
  );
}

export default App;
