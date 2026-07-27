import { useCallback } from 'react';

import { fetchNetworkFees } from '../../lib/networkFee.ts';

import { setNetworkFees } from '../../store';

import { useAppDispatch } from '../../hooks';
import { usePolledFetch } from '../../hooks/usePolledFetch.ts';

function NetworkFee() {
  const dispatch = useAppDispatch();

  const obtainNetworkFees = useCallback(async () => {
    const networkFees = await fetchNetworkFees();
    dispatch(setNetworkFees(networkFees));
  }, [dispatch]);

  // Single-flight, at most one pending retry, cleaned up on unmount.
  usePolledFetch(obtainNetworkFees, 15 * 1000, {
    globalHandleKey: 'refreshIntervalNetworkFee',
  });

  return <></>;
}

export default NetworkFee;
