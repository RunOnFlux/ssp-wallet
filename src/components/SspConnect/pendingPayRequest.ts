/**
 * Request id of a dApp `pay` request that left the SspConnect dialog for the
 * send screen ("continue").
 *
 * background.js resolves a dApp request only with a reply that echoes its
 * request id (security review WEXT-3). A `pay` request is answered later, by
 * the send flow, once the transaction is broadcast or cancelled, so the send
 * strategies read the id from here and send it with their reply:
 *
 *   browser.runtime.sendMessage({
 *     origin: 'ssp',
 *     requestId: takePendingPayRequestId(),
 *     data,
 *   });
 */

let pendingPayRequestId = '';

/** Record the id of the pay request now handed to the send flow. */
export function setPendingPayRequestId(requestId: string): void {
  pendingPayRequestId = typeof requestId === 'string' ? requestId : '';
}

/** Read the pending pay request id without clearing it. */
export function peekPendingPayRequestId(): string {
  return pendingPayRequestId;
}

/** Read and clear the pending pay request id (one reply per request). */
export function takePendingPayRequestId(): string {
  const requestId = pendingPayRequestId;
  pendingPayRequestId = '';
  return requestId;
}
