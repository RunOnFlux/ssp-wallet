import { useEffect, useRef } from 'react';

import { fetchNetworkFees } from '../../lib/networkFee.ts';

import { setNetworkFees } from '../../store';

import { useAppDispatch } from '../../hooks';

function NetworkFee() {
  const dispatch = useAppDispatch();
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    obtainNetworkFees();
    if (globalThis.refreshIntervalNetworkFee) {
      clearInterval(globalThis.refreshIntervalNetworkFee);
    }
    globalThis.refreshIntervalNetworkFee = setInterval(() => {
      obtainNetworkFees();
    }, 15 * 1000);
    return () => {
      if (globalThis.refreshIntervalNetworkFee) {
        clearInterval(globalThis.refreshIntervalNetworkFee);
      }
    };
  });

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
