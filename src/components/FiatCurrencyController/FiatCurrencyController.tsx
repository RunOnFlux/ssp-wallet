import { useEffect, useRef } from 'react';

import { fetchAllRates } from '../../lib/currency.ts';

import { setFiatRates, setCryptoRates } from '../../store';

import { useAppDispatch } from '../../hooks';

function FiatCurrency() {
  const dispatch = useAppDispatch();
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
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
