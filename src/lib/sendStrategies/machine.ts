/**
 * Send-flow step machine — pure, unit-testable core of the unified 3-step
 * Send experience (compose → review → approve).
 *
 * The approve step is entered when the signed transaction has been handed to
 * ConfirmTxKey (the handshake modal) and left when that modal resolves; the
 * compose/review steps are user-navigable.
 */

export type SendStep = 'compose' | 'review' | 'approve';

export type SendStepEvent =
  | { type: 'CONTINUE'; composeError: string | null }
  | { type: 'BACK' }
  | { type: 'APPROVE_OPEN' }
  | { type: 'APPROVE_CLOSED' };

export const SEND_STEPS: SendStep[] = ['compose', 'review', 'approve'];

export function sendStepIndex(step: SendStep): number {
  return SEND_STEPS.indexOf(step);
}

/**
 * Pure transition function. Invalid transitions return the current step
 * unchanged (e.g. CONTINUE with a compose error, BACK from compose).
 */
export function sendStepReducer(
  step: SendStep,
  event: SendStepEvent,
): SendStep {
  switch (event.type) {
    case 'CONTINUE':
      if (step === 'compose' && !event.composeError) {
        return 'review';
      }
      return step;
    case 'BACK':
      if (step === 'review') {
        return 'compose';
      }
      return step;
    case 'APPROVE_OPEN':
      // Approval can only start from review (the Send button lives there).
      return step === 'review' ? 'approve' : step;
    case 'APPROVE_CLOSED':
      // Handshake dismissed/rejected → back to review so the user can retry.
      return step === 'approve' ? 'review' : step;
    default:
      return step;
  }
}
