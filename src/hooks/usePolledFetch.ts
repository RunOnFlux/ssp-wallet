import { useEffect, useRef } from 'react';

type IntervalHandle = string | number | NodeJS.Timeout | undefined;

/**
 * Poll an async fetch on an interval, with disciplined failure handling.
 *
 * The three background controllers (network fees, fiat/crypto rates, services
 * availability) each hand-rolled this and each had the same three defects:
 *
 *  - the interval was created in a `[]`-deps effect with NO cleanup, so it kept
 *    firing after unmount;
 *  - on failure the callback scheduled `setTimeout(retry, 10_000)` with nothing
 *    tracking it, so EVERY failing tick started its own perpetual retry chain.
 *    During an outage the request rate grew without bound —
 *    (outage_seconds / interval) concurrent loops, not one;
 *  - nothing prevented a slow request from overlapping the next tick.
 *
 * This hook fixes all three: at most one request in flight, at most one pending
 * retry, and both the interval and the retry are cleared on unmount.
 *
 * @param fetcher   the request. Rejections trigger a single scheduled retry.
 * @param intervalMs steady-state polling period.
 * @param options.retryMs delay before retrying a failed attempt (default 10s).
 * @param options.globalHandleKey optional `globalThis` key to keep publishing
 *   the interval handle to, preserving the existing double-registration guard
 *   that these controllers relied on.
 */
export function usePolledFetch(
  fetcher: () => Promise<void>,
  intervalMs: number,
  options?: { retryMs?: number; globalHandleKey?: string },
): void {
  const retryMs = options?.retryMs ?? 10_000;
  const globalHandleKey = options?.globalHandleKey;

  // Keep the latest fetcher without rebuilding the interval every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;

    const globals = globalThis as unknown as Record<string, IntervalHandle>;

    const run = () => {
      if (cancelled || inFlight) return; // never overlap a slow request
      inFlight = true;
      fetcherRef
        .current()
        .then(() => {
          if (cancelled) return;
          // A success makes any queued retry redundant.
          if (retryTimeout) {
            clearTimeout(retryTimeout);
            retryTimeout = undefined;
          }
        })
        .catch((error) => {
          if (cancelled) return;
          console.log(error);
          // At most ONE pending retry, ever. The steady-state interval keeps
          // running regardless, so a dropped retry is not a dropped poll.
          if (!retryTimeout) {
            retryTimeout = setTimeout(() => {
              retryTimeout = undefined;
              run();
            }, retryMs);
          }
        })
        .finally(() => {
          inFlight = false;
        });
    };

    run();

    if (globalHandleKey && globals[globalHandleKey]) {
      clearInterval(globals[globalHandleKey] as NodeJS.Timeout);
    }
    const handle = setInterval(run, intervalMs);
    if (globalHandleKey) {
      globals[globalHandleKey] = handle;
    }

    return () => {
      cancelled = true;
      clearInterval(handle);
      if (globalHandleKey && globals[globalHandleKey] === handle) {
        globals[globalHandleKey] = undefined;
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = undefined;
      }
    };
  }, [intervalMs, retryMs, globalHandleKey]);
}

export default usePolledFetch;
