import { useEffect, useRef } from 'react';

import { fetchServicesAvailability } from '../../lib/servicesController.ts';

import { setServicesAvailability } from '../../store';

import { useAppDispatch } from '../../hooks';

function ServicesAvailability() {
  const dispatch = useAppDispatch();
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    obtainServicesAvailability();
    if (globalThis.refreshIntervalServices) {
      clearInterval(globalThis.refreshIntervalServices);
    }
    globalThis.refreshIntervalServices = setInterval(
      () => {
        obtainServicesAvailability();
      },
      10 * 60 * 1000,
    );
  });

  const obtainServicesAvailability = () => {
    fetchServicesAvailability()
      .then((servicesAvailability) => {
        dispatch(setServicesAvailability(servicesAvailability));
      })
      .catch((error) => {
        console.log(error);
        setTimeout(() => {
          obtainServicesAvailability();
        }, 10000);
      });
  };

  return <></>;
}

export default ServicesAvailability;
