import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setTransactions, setBlockheight } from '../../store';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import { getBlockheight } from '../../lib/blockheight.ts';
import TransactionsTable from './TransactionsTable.tsx';

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
      .then((txs) => {
        dispatch(setTransactions(txs));
      })
      .catch((error) => {
        console.log(error);
      });
  };
  const fetchBlockheight = () => {
    getBlockheight('flux')
      .then((height) => {
        dispatch(setBlockheight(height));
      })
      .catch((error) => {
        console.log(error);
      });
  };
  return (
    <>
      <TransactionsTable
        transactions={transactions}
        blockheight={blockheight}
      />
    </>
  );
}

export default Transactions;
