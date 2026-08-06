import { describe, it, expect, vi } from 'vitest';
import { createSerialQueue } from '../../src/lib/serialQueue';

/**
 * Guards the concurrency contract that chain switching relies on. Six UI entry
 * points call switchToChain; before this, two of them firing close together
 * interleaved a long sequence of Redux dispatches and localForage writes and
 * could leave the store describing one chain while activeChain named another.
 */
describe('createSerialQueue', () => {
  const deferred = () => {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it('runs a single task straight through', async () => {
    const run = createSerialQueue<string>();
    const task = vi.fn(() => Promise.resolve());
    await run('a', task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('joins a concurrent request for the SAME key instead of repeating work', async () => {
    const run = createSerialQueue<string>();
    const d = deferred();
    const task = vi.fn(() => d.promise);

    const first = run('a', task);
    const second = run('a', task);

    d.resolve();
    await Promise.all([first, second]);
    // The whole point: one execution, not two.
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('never interleaves tasks for DIFFERENT keys', async () => {
    const run = createSerialQueue<string>();
    const events: string[] = [];
    const dA = deferred();
    const dB = deferred();

    const a = run('a', async () => {
      events.push('a:start');
      await dA.promise;
      events.push('a:end');
    });
    const b = run('b', async () => {
      events.push('b:start');
      await dB.promise;
      events.push('b:end');
    });

    // b must not have started while a is still running.
    expect(events).toEqual(['a:start']);

    dA.resolve();
    await a;
    dB.resolve();
    await b;

    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('preserves last-request-wins ordering for a burst of different keys', async () => {
    const run = createSerialQueue<string>();
    const order: string[] = [];
    const mk = (k: string) => () =>
      Promise.resolve().then(() => {
        order.push(k);
      });

    await Promise.all([
      run('a', mk('a')),
      run('b', mk('b')),
      run('c', mk('c')),
    ]);
    // Every one ran, in request order, so the final state is the last request's.
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('propagates a task rejection to its own caller', async () => {
    const run = createSerialQueue<string>();
    const boom = new Error('nope');
    await expect(run('a', () => Promise.reject(boom))).rejects.toBe(boom);
  });

  it('a failed run does not poison the queue', async () => {
    const run = createSerialQueue<string>();
    await expect(
      run('a', () => Promise.reject(new Error('x'))),
    ).rejects.toThrow('x');
    const after = vi.fn(() => Promise.resolve());
    await run('b', after);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('a queued run still executes when the one before it fails', async () => {
    const run = createSerialQueue<string>();
    const dA = deferred();
    const b = vi.fn(() => Promise.resolve());

    const first = run('a', () => dA.promise);
    const second = run('b', b);

    dA.reject(new Error('a failed'));
    await expect(first).rejects.toThrow('a failed');
    await second;
    // The predecessor's failure is its own caller's problem, not a reason to
    // silently drop the switch the user asked for next.
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('accepts a new request for the same key once the previous one settled', async () => {
    const run = createSerialQueue<string>();
    const task = vi.fn(() => Promise.resolve());
    await run('a', task);
    await run('a', task);
    // Sequential, not concurrent — so this is two real runs, not a dedupe.
    expect(task).toHaveBeenCalledTimes(2);
  });
});
