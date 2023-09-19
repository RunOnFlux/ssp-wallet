import { useEffect, useRef } from 'react';
import localForage from 'localforage';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setTransactions, setBlockheight } from '../../store';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import { getBlockheight } from '../../lib/blockheight.ts';
import TransactionsTable from './TransactionsTable.tsx';
import PendingTransactionsTable from './PendingTransactionsTable.tsx';

function Transactions() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const dispatch = useAppDispatch();
  const { transactions, address, blockheight } = useAppSelector(
    (state) => state.flux,
  );

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    fetchTransactions();
    fetchBlockheight();
  });

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

  return (
    <>
      <PendingTransactionsTable
      />

      <TransactionsTable
        transactions={transactions}
        blockheight={blockheight}
      />
    </>
  );
}

export default Transactions;
