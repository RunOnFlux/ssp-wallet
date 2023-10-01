import { useEffect, useRef, useState } from 'react';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setBalance, setUnconfirmedBalance } from '../../store';
import { fetchAddressBalance } from '../../lib/balances.ts';
import SocketListener from '../SocketListener/SocketListener.tsx';

let refreshInterval: string | number | NodeJS.Timeout | undefined;

function Balances() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [fiatRate, setFiatRate] = useState(0);
  const dispatch = useAppDispatch();
  const { wallets } = useAppSelector((state) => state.flux);
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
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
    }, 20000);
  });

  const fetchBalance = () => {
    fetchAddressBalance(wallets['0-0'].address, 'flux')
      .then(async (balance) => {
        dispatch(setBalance({ wallet: '0-0', data: balance.confirmed }));
        dispatch(
          setUnconfirmedBalance({ wallet: '0-0', data: balance.unconfirmed }),
        );
        await localForage.setItem('balances-flux-0-0', balance);
        console.log(balance);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const totalBalance = new BigNumber(wallets['0-0'].balance)
    .plus(new BigNumber(wallets['0-0'].unconfirmedBalance))
    .dividedBy(1e8);
  let balanceUSD = totalBalance.multipliedBy(new BigNumber(fiatRate));

  useEffect(() => {
    balanceUSD = totalBalance.multipliedBy(new BigNumber(fiatRate));
  }, [fiatRate]);

  const getCryptoRate = (
    crypto: keyof typeof cryptoRates,
    fiat: keyof typeof fiatRates,
  ) => {
    console.log(cryptoRates);
    const cr = cryptoRates[crypto];
    const fi = fiatRates[fiat];
    setFiatRate(cr * fi);
  };

  const refresh = () => {
    console.log('kappa');
    fetchBalance();
    getCryptoRate('flux', 'USD');
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
