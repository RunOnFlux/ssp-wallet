import { describe, it, expect } from 'vitest';
import { timedTronFetch, TRON_NODE_TIMEOUT_MS } from '../../src/lib/tron';

const INIT = {
  method: 'POST' as const,
  headers: { 'content-type': 'application/json' },
  body: '{"value":"T"}',
};

// Resolves only when the request is aborted, like a node that never answers.
function hangUntilAborted(
  signal: AbortSignal | null | undefined,
): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

describe('timedTronFetch', () => {
  it('defaults to a bounded timeout', () => {
    expect(TRON_NODE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(TRON_NODE_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });

  it('fails a node that never answers', async () => {
    const f = timedTronFetch(
      (_url, init) => hangUntilAborted(init?.signal),
      20,
    );
    await expect(f('https://node/wallet/getnowblock', INIT)).rejects.toThrow(
      'aborted',
    );
  });

  it('fails a node that sends headers and then stalls the body', async () => {
    const f = timedTronFetch(
      async (_url, init) =>
        ({
          ok: true,
          status: 200,
          text: () => hangUntilAborted(init?.signal),
        }) as unknown as Response,
      20,
    );
    await expect(f('https://node/wallet/getnowblock', INIT)).rejects.toThrow(
      'aborted',
    );
  });

  it('passes the request through and returns the buffered answer', async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined;
    const f = timedTronFetch(async (url, init) => {
      seen = { url: String(url), init };
      return new Response('{"blockID":"00"}', { status: 200 });
    }, 20);
    const res = await f('https://node/wallet/getnowblock', INIT);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"blockID":"00"}');
    expect(seen?.url).toBe('https://node/wallet/getnowblock');
    expect(seen?.init?.method).toBe('POST');
    expect(seen?.init?.body).toBe(INIT.body);
    expect(seen?.init?.headers).toEqual(INIT.headers);
    // the timer is cleared once the answer is in: the signal never fires later
    await new Promise((r) => setTimeout(r, 40));
    expect(seen?.init?.signal?.aborted).toBe(false);
  });

  it('keeps a non-2xx status for the client to classify', async () => {
    const f = timedTronFetch(
      async () => new Response('busy', { status: 503 }),
      20,
    );
    const res = await f('https://node/wallet/broadcasthex', INIT);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('busy');
  });
});
