import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setTransactions } from '../../store';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import TransactionsTable from './TransactionsTable.tsx';

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

export default Transactions;
