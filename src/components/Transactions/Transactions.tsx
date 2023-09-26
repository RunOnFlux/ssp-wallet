import { useEffect, useRef, useState } from 'react';
import localForage from 'localforage';
import axios from 'axios';
import { sspConfig } from '@storage/ssp';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setTransactions, setBlockheight } from '../../store';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import { getBlockheight } from '../../lib/blockheight.ts';
import TransactionsTable from './TransactionsTable.tsx';
import PendingTransactionsTable from './PendingTransactionsTable.tsx';
import SocketListener from '../SocketListener/SocketListener.tsx';
import { decodeTransactionForApproval } from '../../lib/transactions.ts';
import { actionSSPRelay, pendingTransaction } from '../../types';
import { fetchRate } from '../../lib/currency.ts';

let refreshInterval: string | number | NodeJS.Timeout | undefined;

function Transactions() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const dispatch = useAppDispatch();
  const { transactions, address, blockheight, sspWalletKeyIdentity } =
    useAppSelector((state) => state.flux);
  const [pendingTxs, setPendingTxs] = useState<pendingTransaction[]>([]);
  const [fiatRate, setFiatRate] = useState(0);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    getPendingTx();
    getTransactions();
    obtainRate();
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
      getTransactions();
      obtainRate();
    }, 20000);
  });

  const getTransactions = () => {
    fetchTransactions();
    fetchBlockheight();
  };

  const fetchTransactions = () => {
    fetchAddressTransactions(address, 'flux', 0, 10)
      .then(async (txs) => {
        dispatch(setTransactions(txs));
        await localForage.setItem('transactions-flux', txs);
      })
      .catch((error) => {
        console.log(error);
      });
  };
  const fetchBlockheight = () => {
    getBlockheight('flux')
      .then(async (height) => {
        dispatch(setBlockheight(height));
        await localForage.setItem('blockheight-flux', height);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const getPendingTx = () => {
    axios
      .get<actionSSPRelay>(
        `https://${sspConfig().relay}/v1/action/${sspWalletKeyIdentity}`,
      )
      .then((res) => {
        if (res.data.action === 'tx') {
          const decoded = decodeTransactionForApproval(
            res.data.payload,
            address,
          );
          setPendingTxs([{ ...decoded, ...res.data }]);
        } else {
          setPendingTxs([]);
        }
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const obtainRate = () => {
    fetchRate('flux')
      .then((rate) => {
        console.log(rate);
        setFiatRate(rate.USD);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const onTxRejected = () => {
    getPendingTx();
  };

  const onTxSent = () => {
    getPendingTx();
    setTimeout(() => {
      getTransactions();
    }, 2500);
  };

  return (
    <>
      <PendingTransactionsTable
        transactions={pendingTxs}
        fiatRate={fiatRate}
        refresh={getPendingTx}
      />

      <TransactionsTable
        transactions={transactions}
        blockheight={blockheight}
        fiatRate={fiatRate}
        refresh={getTransactions}
      />

      <SocketListener txRejected={onTxRejected} txSent={onTxSent} />
    </>
  );
}

export default Transactions;
