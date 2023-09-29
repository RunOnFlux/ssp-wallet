import { useEffect, useRef } from 'react';

import { fetchAllRates } from '../../lib/currency.ts';

import { setFiatRates, setCryptoRates } from '../../store';

import { useAppDispatch } from '../../hooks';

let refreshInterval: string | number | NodeJS.Timeout | undefined;

function FiatCurrency() {
  const dispatch = useAppDispatch();
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    obtainRates();
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
      obtainRates();
    }, 10 * 60 * 1000);
  });

  const obtainRates = () => {
    fetchAllRates()
      .then((rates) => {
        console.log(rates);
        dispatch(setFiatRates(rates.fiat));
        dispatch(setCryptoRates(rates.crypto));
      })
      .catch((error) => {
        console.log(error);
        setTimeout(() => {
          obtainRates();
        }, 10000);
      });
  };

  return <></>;
}

export default FiatCurrency;
