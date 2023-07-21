import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useAppDispatch } from '../../hooks';
import { setXpubInitialState } from '../../store';
import { Spin, Row, Col, Modal, QRCode, Button, Input } from 'antd';
const { TextArea } = Input;
const { confirm } = Modal;
import './Home.css';

function App() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isModalKeyOpen, setIsModalKeyOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [keyInputVisible, setKeyInputVisible] = useState(false);
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
    // validate xpub key is correct
  };

  const handleCancelModalKey = () => {
    // display confirmation dialog and tell that we are 2fa. If no Key, log out.
    showConfirmCancelModalKey();
  };

  const logout = async () => {
    try {
      setKeyInputVisible(false);
      setKeyInput('');
      if (chrome?.storage?.session) {
        // if different browser we will need to be inputting password every time
        await chrome.storage.session.clear();
      }
      dispatch(setXpubInitialState());
      navigate('/login');
    } catch (error) {
      console.log(error);
    }
  };

  const showConfirmCancelModalKey = () => {
    confirm({
      title: 'Cancel SSP Key Sync?',
      icon: <ExclamationCircleFilled />,
      okText: 'Cancel SSP Sync',
      cancelText: 'Back to SSP Key Sync',
      content:
        'SSP Wallet cannot be used without SSP Key. This will log you out of SSP Wallet.',
      onOk() {
        logout().catch((e) => console.log(e));
      },
      onCancel() {
        console.log('Cancel, just hidden');
      },
    });
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
        okText="Sync Key"
        style={{ textAlign: 'center' }}
      >
        <p>
          SSP Wallet is a Dual Signature Wallet. You will need to download SSP
          Key on your mobile device to access your wallet.
        </p>
        <b>
          Scan the following QR code to sync your SSP Wallet with your SSP Key.
        </b>
        <br />
        <br />
        <QRCode
          errorLevel="H"
          value={xpubWallet}
          icon="/ssp-logo.svg"
          size={256}
          style={{ margin: '0 auto' }}
        />
        <br />
        {!keyInputVisible && (
          <Button
            type="link"
            block
            size="small"
            onClick={() => setKeyInputVisible(true)}
          >
            Issues syncing? Manual Input
          </Button>
        )}
        {keyInputVisible && (
          <>
            <TextArea
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Input Extended Public Key xpub-48-19167-0-0 of SSP Key here"
              autoSize
            />
          </>
        )}
        <br />
        <br />
      </Modal>
    </>
  );
}

export default App;
