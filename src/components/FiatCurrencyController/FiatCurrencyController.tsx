import { useCallback } from 'react';

import { fetchAllRates } from '../../lib/currency.ts';

import { setFiatRates, setCryptoRates } from '../../store';

import { useAppDispatch } from '../../hooks';
import { usePolledFetch } from '../../hooks/usePolledFetch.ts';

function FiatCurrency() {
  const dispatch = useAppDispatch();

  const obtainRates = useCallback(async () => {
    const rates = await fetchAllRates();
    dispatch(setFiatRates(rates.fiat));
    dispatch(setCryptoRates(rates.crypto));
  }, [dispatch]);

  // Single-flight, at most one pending retry, cleaned up on unmount.
  usePolledFetch(obtainRates, 5 * 60 * 1000, {
    globalHandleKey: 'refreshIntervalRates',
  });

  return <></>;
}

export default FiatCurrency;
