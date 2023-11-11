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
      10 * 60 * 1000,
    );
    return () => {
      if (globalThis.refreshIntervalRates) {
        clearInterval(globalThis.refreshIntervalRates);
      }
    };
  });

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
