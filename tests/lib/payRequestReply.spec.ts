import { readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPayRequestReply,
  createPayRequestResponder,
} from '../../src/lib/sendStrategies/payRequest';

/**
 * A dApp `pay` request continues from the payment dialog to the send screen,
 * which must answer it — echoing the request id (WEXT-3) — once the send
 * reaches a terminal state. The Solana send screen never answered, so the
 * dApp waited for the background's 15-minute timeout.
 */

const read = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

describe('pay request reply', () => {
  it('success echoes the request id with the txid (UTXO/EVM shape)', () => {
    expect(
      buildPayRequestReply('req-1', {
        status: 'SUCCESS',
        txid: 'sig58',
        message: 'Transaction sent',
      }),
    ).toEqual({
      origin: 'ssp',
      requestId: 'req-1',
      data: { status: 'SUCCESS', data: 'Transaction sent', txid: 'sig58' },
    });
  });

  it('rejection / cancel echoes the request id with an ERROR', () => {
    expect(
      buildPayRequestReply('req-1', {
        status: 'ERROR',
        message: 'Request rejected',
      }),
    ).toEqual({
      origin: 'ssp',
      requestId: 'req-1',
      data: { status: 'ERROR', result: 'Request rejected' },
    });
  });
});

describe('createPayRequestResponder', () => {
  it('answers exactly once, taking (and clearing) the pending id', () => {
    const send = vi.fn();
    const takeRequestId = vi.fn().mockReturnValueOnce('req-7');
    const responder = createPayRequestResponder({ takeRequestId, send });

    expect(
      responder.answer({ status: 'SUCCESS', txid: 'abc', message: 'sent' }),
    ).toBe(true);
    expect(responder.answered).toBe(true);
    // A later cancel / rejection after the broadcast is not a second answer.
    expect(responder.answer({ status: 'ERROR', message: 'rejected' })).toBe(
      false,
    );
    expect(takeRequestId).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      origin: 'ssp',
      requestId: 'req-7',
      data: { status: 'SUCCESS', txid: 'abc' },
    });
  });

  it('sends nothing when there is no pending request id', () => {
    const send = vi.fn();
    const responder = createPayRequestResponder({
      takeRequestId: () => '',
      send,
    });
    expect(responder.answer({ status: 'ERROR', message: 'x' })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('never throws when sending fails (sync or async)', async () => {
    const sync = createPayRequestResponder({
      takeRequestId: () => 'a',
      send: () => {
        throw new Error('no runtime');
      },
    });
    expect(() => sync.answer({ status: 'ERROR', message: 'x' })).not.toThrow();
    const asyncFail = createPayRequestResponder({
      takeRequestId: () => 'b',
      send: () => Promise.reject(new Error('port closed')),
    });
    expect(asyncFail.answer({ status: 'ERROR', message: 'x' })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('send strategies answer dApp pay requests', () => {
  const sol = read('pages/SendFlow/useSolSendStrategy.tsx');

  it('the Solana strategy answers through the at-most-once responder with the pending id', () => {
    expect(sol).toContain('createPayRequestResponder({');
    expect(sol).toContain('takeRequestId: takePendingPayRequestId');
    // Only for an actual pay request.
    expect(sol).toMatch(
      /if \(state\.paymentAction\) \{\s*payResponder\.answer/,
    );
  });

  it('answers SUCCESS with the txid when the Key broadcast arrives', () => {
    const effect = sol.slice(
      sol.indexOf('if (socketTxid && socketChain === activeChain)'),
      sol.indexOf('if (socketTxRejected && socketChain === activeChain)'),
    );
    expect(effect).toContain("status: 'SUCCESS'");
    expect(effect).toContain('txid: socketTxid');
  });

  it('answers ERROR on Key rejection (socket and inline) and on cancel', () => {
    const rejectedEffect = sol.slice(
      sol.indexOf('if (socketTxRejected && socketChain === activeChain)'),
      sol.indexOf('// Pre-fill from navigation state'),
    );
    expect(rejectedEffect).toContain('payRequestRejected();');
    const inline = sol.slice(
      sol.indexOf("error?.message?.includes('Key device rejected')"),
      sol.indexOf('const confirmTxAction'),
    );
    expect(inline).toContain('payRequestRejected();');
    const cancel = sol.slice(
      sol.indexOf('const cancelSend = () => {'),
      sol.indexOf('const isNativeAsset'),
    );
    expect(cancel).toContain('payRequestRejected();');
  });

  it.each([
    'pages/SendFlow/useUtxoSendStrategy.tsx',
    'pages/SendFlow/useEvmSendStrategy.tsx',
    'pages/SendFlow/useSolSendStrategy.tsx',
  ])('%s echoes the pending pay request id', (path) => {
    const source = read(path);
    expect(source).toContain('takePendingPayRequestId');
    expect(source).toContain('state.paymentAction');
  });
});
