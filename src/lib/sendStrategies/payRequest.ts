/**
 * Answer to a dApp `pay` request that the send flow took over (the payment
 * dialog's "continue" navigates to the send screen with `paymentAction`).
 *
 * background.js resolves the dApp's request only with a reply that echoes its
 * request id (WEXT-3, see components/SspConnect/pendingPayRequest.ts). Every
 * terminal outcome of the send — broadcast, Key rejection, user cancel — must
 * therefore send exactly one such reply; otherwise the dApp hangs until the
 * background's 15-minute timeout.
 *
 * The reply shape is the one the UTXO and EVM send strategies send.
 */

export type PayRequestOutcome =
  | { status: 'SUCCESS'; txid: string; message: string }
  | { status: 'ERROR'; message: string };

export interface PayRequestReply {
  origin: 'ssp';
  requestId: string;
  data:
    | { status: 'SUCCESS'; data: string; txid: string }
    | { status: 'ERROR'; result: string };
}

export function buildPayRequestReply(
  requestId: string,
  outcome: PayRequestOutcome,
): PayRequestReply {
  if (outcome.status === 'SUCCESS') {
    return {
      origin: 'ssp',
      requestId,
      data: { status: 'SUCCESS', data: outcome.message, txid: outcome.txid },
    };
  }
  return {
    origin: 'ssp',
    requestId,
    data: { status: 'ERROR', result: outcome.message },
  };
}

export interface PayRequestResponder {
  /**
   * Send the one reply for this pay request. Returns true when a reply was
   * sent; false when it was already answered or there is no pending id.
   */
  answer(outcome: PayRequestOutcome): boolean;
  readonly answered: boolean;
}

/**
 * At-most-once responder for the pay request a send screen took over.
 * `takeRequestId` reads AND clears the pending id (takePendingPayRequestId),
 * so a reply can never be attributed to a later request. Sending never throws.
 */
export function createPayRequestResponder(deps: {
  takeRequestId: () => string;
  send: (reply: PayRequestReply) => unknown;
}): PayRequestResponder {
  let answered = false;
  return {
    answer(outcome: PayRequestOutcome): boolean {
      if (answered) return false;
      answered = true;
      const requestId = deps.takeRequestId();
      if (!requestId) return false;
      try {
        void Promise.resolve(
          deps.send(buildPayRequestReply(requestId, outcome)),
        ).catch((error: unknown) => {
          console.log('[pay request] reply failed', error);
        });
      } catch (error) {
        console.log('[pay request] reply failed', error);
      }
      return true;
    },
    get answered(): boolean {
      return answered;
    },
  };
}
