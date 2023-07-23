import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BigNumber from 'bignumber.js';
import { NoticeType } from 'antd/es/message/interface';
import { useAppSelector, useAppDispatch } from '../../hooks';
import {
  setFluxInitialState,
  setPasswordBlobInitialState,
  setAddress,
  setRedeemScript,
  setTransactions,
  setBalance,
  setUnconfirmedBalance,
} from '../../store';
import {
  Spin,
  Row,
  Col,
  Image,
  Divider,
  Typography,
  message,
  Table,
  Space,
} from 'antd';
const { Paragraph, Text } = Typography;
import './Home.css';
import { LockOutlined, SettingOutlined } from '@ant-design/icons';
import Key from '../../components/Key/Key';
import Navigation from '../../components/Navigation/Navigation';
import { generateMultisigAddress } from '../../lib/wallet.ts';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import { fetchAddressBalance } from '../../lib/balances.ts';
import { transaction } from '../../types';

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

function TransactionsTable(props: { transactions: transaction[] }) {
  const tableColumns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
    },
  ];
  return (
    <>
      <Table
        pagination={false}
        showHeader={false}
        rowKey="txid"
        bordered={false}
        loading={false}
        columns={tableColumns}
        dataSource={props.transactions}
      />
    </>
  );
}

function Transactions() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const dispatch = useAppDispatch();
  const { transactions, address } = useAppSelector((state) => state.flux);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    fetchTransactions();
  });

  const fetchTransactions = () => {
    fetchAddressTransactions(address, 'flux', 0, 10)
      .then((txs) => {
        dispatch(setTransactions(txs));
        console.log(txs);
      })
      .catch((error) => {
        console.log(error);
      });
  };
  return (
    <>
      <TransactionsTable transactions={transactions} />
    </>
  );
}

function Balance() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const dispatch = useAppDispatch();
  const { balance, unconfirmedBalance, address } = useAppSelector(
    (state) => state.flux,
  );

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    fetchBalance();
  });

  const fetchBalance = () => {
    fetchAddressBalance(address, 'flux')
      .then((balance) => {
        dispatch(setBalance(balance.confirmed));
        dispatch(setUnconfirmedBalance(balance.unconfirmed));
        console.log(balance);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const totalBalance = new BigNumber(balance)
    .plus(new BigNumber(unconfirmedBalance))
    .dividedBy(1e8);
  const rate = '0.42';
  const balanceUSD = totalBalance.multipliedBy(new BigNumber(rate));
  return (
    <>
      <h3>{totalBalance.toFixed(8) || '0.00'} FLUX</h3>
      <h4>${balanceUSD.toFixed(2) || '0.00'} USD</h4>
    </>
  );
}

function AddressContainer() {
  const { address } = useAppSelector((state) => state.flux);

  return (
    <>
      <Paragraph copyable={{ text: address }} className="copyableAddress">
        <Text>
          {address.substring(0, 7)}...{address.substring(address.length - 6)}
        </Text>
      </Paragraph>
    </>
  );
}

function App() {
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
            <Balance />
            <Navigation />
            <Transactions />
          </Space>
        </>
      )}
      <Key derivationPath="xpub-48-19167-0-0" synchronised={keySynchronised} />
    </>
  );
}

export default App;
