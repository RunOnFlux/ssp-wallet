import { useEffect, useRef } from 'react';
import BigNumber from 'bignumber.js';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setBalance, setUnconfirmedBalance } from '../../store';
import { fetchAddressBalance } from '../../lib/balances.ts';

function Balances() {
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

export default Balances;