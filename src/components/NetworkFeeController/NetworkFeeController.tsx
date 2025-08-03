import { useEffect } from 'react';

import { fetchNetworkFees } from '../../lib/networkFee.ts';

import { setNetworkFees } from '../../store';

import { useAppDispatch } from '../../hooks';

function NetworkFee() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    obtainNetworkFees();
    if (globalThis.refreshIntervalNetworkFee) {
      clearInterval(globalThis.refreshIntervalNetworkFee);
    }
    globalThis.refreshIntervalNetworkFee = setInterval(() => {
      obtainNetworkFees();
    }, 15 * 1000);
  }, []);

  const obtainNetworkFees = () => {
    fetchNetworkFees()
      .then((networkFees) => {
        dispatch(setNetworkFees(networkFees));
      })
      .catch((error) => {
        console.log(error);
        setTimeout(() => {
          obtainNetworkFees();
        }, 10000);
      });
  };

  return <></>;
}

export default NetworkFee;
