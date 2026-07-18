/**
 * Flux node status → semantic tone mapping for the Nodes tab status chips.
 * Pure presentation logic (colors resolve in CSS): raw statuses come from
 * lib/nodes.ts network refresh ('confirmed' | 'started' | 'dos' | 'offline' |
 * a unix-seconds timestamp string while a start tx is in the mempool).
 */

export type NodeStatusTone = 'success' | 'warning' | 'error' | 'neutral';

export function nodeStatusTone(
  status: string,
  hasName: boolean,
): NodeStatusTone {
  if (!hasName) {
    return 'neutral'; // unassigned collateral — no node configured yet
  }
  if (!status) {
    return 'neutral';
  }
  if (status.startsWith('1')) {
    return 'warning'; // timestamp = start tx broadcast, node is starting
  }
  if (status === 'started') {
    return 'success';
  }
  if (status === 'confirmed') {
    return 'success';
  }
  if (status === 'dos') {
    return 'error';
  }
  if (status === 'offline') {
    return 'error';
  }
  return 'neutral';
}
