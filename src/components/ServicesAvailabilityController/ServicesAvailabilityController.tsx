import { useCallback } from 'react';

import { fetchServicesAvailability } from '../../lib/servicesController.ts';

import { setServicesAvailability } from '../../store';

import { useAppDispatch } from '../../hooks';
import { usePolledFetch } from '../../hooks/usePolledFetch.ts';

function ServicesAvailability() {
  const dispatch = useAppDispatch();

  const obtainServicesAvailability = useCallback(async () => {
    const servicesAvailability = await fetchServicesAvailability();
    dispatch(setServicesAvailability(servicesAvailability));
  }, [dispatch]);

  // Single-flight, at most one pending retry, cleaned up on unmount.
  usePolledFetch(obtainServicesAvailability, 10 * 60 * 1000, {
    globalHandleKey: 'refreshIntervalServices',
  });

  return <></>;
}

export default ServicesAvailability;
