/**
 * Pure state logic for the "Approve on your SSP Key" handshake experience
 * (ConfirmTxKey, ConfirmPublicNoncesKey and other wait-for-key surfaces).
 *
 * Presentation-only: these helpers interpret signals that already exist
 * (the action was posted to the relay + the existing socket events) — they
 * never produce, transform or transmit any payload.
 */

export type HandshakePhase = 'waiting' | 'approved' | 'rejected';

export interface HandshakeSignals {
  /** current value of the socket "approved" signal (e.g. txid payload) */
  approvedSignal: string;
  /** current value of the socket "rejected" signal */
  rejectedSignal: string;
  /** value of the approved signal at the moment the modal opened */
  baselineApproved: string;
  /** value of the rejected signal at the moment the modal opened */
  baselineRejected: string;
}

/**
 * Latches a terminal phase from the relay socket signals. Baselines are the
 * signal values captured when the modal opened, so a stale signal left over
 * from a previous flow can never mark a fresh request approved/rejected.
 * Once terminal, the phase is sticky until the modal is reopened.
 */
export function deriveHandshakePhase(
  current: HandshakePhase,
  signals: HandshakeSignals,
): HandshakePhase {
  if (current !== 'waiting') {
    return current;
  }
  if (
    signals.rejectedSignal &&
    signals.rejectedSignal !== signals.baselineRejected
  ) {
    return 'rejected';
  }
  if (
    signals.approvedSignal &&
    signals.approvedSignal !== signals.baselineApproved
  ) {
    return 'approved';
  }
  return 'waiting';
}

export type HandshakeStepKey = 'sent' | 'awaiting' | 'result';
export type HandshakeStepStatus = 'finish' | 'process' | 'wait' | 'error';

export interface HandshakeStep {
  key: HandshakeStepKey;
  status: HandshakeStepStatus;
}

/**
 * Timeline statuses for the live status list. Driven ONLY by signals that
 * already exist: the action post (modal open ⇒ "sent") and the terminal
 * socket events.
 *
 * NOTE: a "viewed on your phone" step between sent → awaiting is
 * deliberately absent — it would require a new key-side signal
 * (key ack over the relay). Deferred until such a signal exists.
 */
export function handshakeTimeline(phase: HandshakePhase): HandshakeStep[] {
  return [
    { key: 'sent', status: 'finish' },
    {
      key: 'awaiting',
      status: phase === 'waiting' ? 'process' : 'finish',
    },
    {
      key: 'result',
      status:
        phase === 'approved'
          ? 'finish'
          : phase === 'rejected'
            ? 'error'
            : 'wait',
    },
  ];
}

/**
 * Relay actions are valid for 15 minutes from posting
 * (ssp-relay actionService: validTill = timestamp + 15 * 60 * 1000).
 * Purely informational countdown — expiry is enforced by the relay.
 */
export const ACTION_EXPIRY_SECONDS = 15 * 60;

/** Formats remaining seconds as mm:ss, clamped at 00:00. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}
