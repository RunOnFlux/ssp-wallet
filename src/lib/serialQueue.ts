/**
 * A serialising, de-duplicating queue for keyed async work.
 *
 * Written for chain switching, where the same defect kept reappearing: a long
 * multi-step async sequence (Redux dispatches + localForage writes) fired from
 * several UI entry points with nothing stopping two runs from overlapping, so
 * the store could end up describing one chain while `activeChain` named
 * another. Guarding each call site individually left the next call site free to
 * reintroduce it, so the guard belongs next to the work instead.
 *
 * Semantics:
 *  - a request whose key matches the run already in flight JOINS it and
 *    resolves/rejects with it, rather than repeating the work;
 *  - a request with a different key QUEUES behind the in-flight run, so two
 *    runs never interleave. Queuing rather than rejecting preserves
 *    last-request-wins, which is what a user tapping two options quickly means.
 *
 * A queued run is not cancelled if a third request arrives — each still runs,
 * in order. Callers that need cancellation should check their own state inside
 * the task.
 */
export function createSerialQueue<K>() {
  let current: { key: K; promise: Promise<void> } | null = null;

  return function run(key: K, task: () => Promise<void>): Promise<void> {
    if (current && current.key === key) {
      return current.promise;
    }

    const previous = current?.promise;
    const promise = (async () => {
      if (previous) {
        // A previous run's rejection belongs to its own caller; we only need
        // it to be finished before we start mutating the same state.
        await previous.catch(() => undefined);
      }
      return task();
    })();

    current = { key, promise };

    return promise.finally(() => {
      if (current?.promise === promise) {
        current = null;
      }
    });
  };
}

export default createSerialQueue;
