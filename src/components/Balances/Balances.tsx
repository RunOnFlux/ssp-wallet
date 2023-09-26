import { useEffect, useRef, useState } from 'react';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setBalance, setUnconfirmedBalance } from '../../store';
import { fetchAddressBalance } from '../../lib/balances.ts';
import { fetchRate } from '../../lib/currency.ts';
import SocketListener from '../SocketListener/SocketListener.tsx';

let refreshInterval: string | number | NodeJS.Timeout | undefined;

function Balances() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [fiatRate, setFiatRate] = useState(0);
  const dispatch = useAppDispatch();
  const { balance, unconfirmedBalance, address } = useAppSelector(
    (state) => state.flux,
  );

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    refresh();
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
      refresh();
    }, 2000);
  });

  const fetchBalance = () => {
    fetchAddressBalance(address, 'flux')
      .then(async (balance) => {
        dispatch(setBalance(balance.confirmed));
        dispatch(setUnconfirmedBalance(balance.unconfirmed));
        await localForage.setItem('balances-flux', balance);
        console.log(balance);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const totalBalance = new BigNumber(balance)
    .plus(new BigNumber(unconfirmedBalance))
    .dividedBy(1e8);
  let balanceUSD = totalBalance.multipliedBy(new BigNumber(fiatRate));

  useEffect(() => {
    balanceUSD = totalBalance.multipliedBy(new BigNumber(fiatRate));
  }, [fiatRate]);

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

  const refresh = () => {
    fetchBalance();
    obtainRate();
  };

  const onTxRejected = () => {
    // do nothing
  };

  const onTxSent = () => {
    setTimeout(() => {
      refresh();
    }, 2500);
    setTimeout(() => {
      refresh();
    }, 7500);
  };

  return (
    <>
      <h3 style={{ marginTop: 0, marginBottom: 10 }}>
        {totalBalance.toFixed(8) || '0.00'} FLUX
      </h3>
      <h4 style={{ marginTop: 0, marginBottom: 15 }}>
        ${balanceUSD.toFixed(2) || '0.00'} USD
      </h4>

      <SocketListener txRejected={onTxRejected} txSent={onTxSent} />
    </>
  );
}

export default Balances;
