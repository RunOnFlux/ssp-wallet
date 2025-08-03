import { useEffect } from 'react';

import { fetchAllRates } from '../../lib/currency.ts';

import { setFiatRates, setCryptoRates } from '../../store';

import { useAppDispatch } from '../../hooks';

function FiatCurrency() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    obtainRates();
    if (globalThis.refreshIntervalRates) {
      clearInterval(globalThis.refreshIntervalRates);
    }
    globalThis.refreshIntervalRates = setInterval(
      () => {
        obtainRates();
      },
      5 * 60 * 1000,
    );
  }, []);

  const obtainRates = () => {
    fetchAllRates()
      .then((rates) => {
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
