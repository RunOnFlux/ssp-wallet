import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppSelector } from '../hooks';
import {
  VaultDescriptorError,
  parseVaultDescriptor,
  type VaultDescriptorErrorCode,
  type VerifiedVaultDescriptor,
} from '../lib/vaultDescriptor';
import {
  commitVaultPin,
  verifyPinnedVaultGate,
  verifyVaultGate,
  type VaultRequestBinding,
} from '../lib/vaultGate';
import { computeOwnVaultAccountXpub } from '../lib/vaultOwnXpub';

export type VaultGateState =
  | { status: 'idle' }
  | { status: 'verifying' }
  | { status: 'needs_pin'; verified: VerifiedVaultDescriptor }
  | {
      status: 'verified';
      verified: VerifiedVaultDescriptor;
      /**
       * Confirmed on the pin screen of this request but not saved yet: the pin
       * is written by commitPin() only once signing is about to happen.
       */
      staged?: boolean;
    }
  | { status: 'error'; code: VaultDescriptorErrorCode; message: string };

function toGateError(error: unknown): VaultGateState {
  if (error instanceof VaultDescriptorError) {
    return { status: 'error', code: error.code, message: error.message };
  }
  return {
    status: 'error',
    code: 'malformed',
    message:
      error instanceof Error ? error.message : 'Vault could not be verified',
  };
}

/**
 * VD-3 for an enterprise vault dialog: verifies the descriptor that arrived
 * with the request, binds the request to it, and applies the TOFU pin.
 *
 * - `needs_pin`: first sight — render VaultPinConfirm. `confirmPin()` records
 *   the confirmation; cancelling must refuse the request (and call
 *   `discardStagedPin()`).
 * - `verified`: pinned and matching, or confirmed for this request — the dialog
 *   may enable its action after its own VD-4 checks.
 * - `error`: refuse (missing descriptor, invalid, changed pinned vault…).
 *
 * Pin timing (`pinTiming`):
 * - 'on_sign' (default, signing dialogs): the confirmation is only STAGED. It
 *   is saved by `commitPin(verified)` once the request passed every sign-time
 *   check, right before this device's key is used — a request that fails its
 *   checks (or is cancelled) leaves no pin behind.
 * - 'on_confirm' (enterprise_vault_address): pinned as soon as the user
 *   confirms, since showing the address is the action.
 *
 * `reverify(ownAccountXpub)` repeats the whole check synchronously at sign
 * time, with the xpub computed from the key the dialog is about to sign with.
 */
export function useVaultDescriptorGate(params: {
  open: boolean;
  descriptor: unknown;
  descriptorHash: unknown;
  /** null: the request carries no indices of its own (enterprise_vault_address). */
  request: VaultRequestBinding | null;
  vaultName: string;
  pinTiming?: 'on_confirm' | 'on_sign';
}) {
  const {
    open,
    descriptor,
    descriptorHash,
    request,
    vaultName,
    pinTiming = 'on_sign',
  } = params;
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity: wkIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const [state, setState] = useState<VaultGateState>({ status: 'idle' });
  const runRef = useRef(0);
  // Hash the user confirmed for THIS request and dialog opening (not saved).
  const stagedHashRef = useRef<string | null>(null);
  const requestChain = request?.chain;
  const requestOrgIndex = request?.orgIndex;
  const requestVaultIndex = request?.vaultIndex;
  const requestSigningMode = request?.signingMode;
  const hasRequest = request !== null;

  useEffect(() => {
    const run = ++runRef.current;
    // A confirmation belongs to one request: a new descriptor, request or
    // dialog opening starts from scratch.
    stagedHashRef.current = null;
    if (!open) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'verifying' });
    const binding: VaultRequestBinding | null = hasRequest
      ? {
          chain: requestChain ?? '',
          orgIndex: requestOrgIndex ?? -1,
          vaultIndex: requestVaultIndex ?? -1,
          signingMode: requestSigningMode,
        }
      : null;
    void (async () => {
      try {
        // The account to compute our own xpub for comes from the (not yet
        // verified) descriptor; a wrong claim simply fails check 5.
        const claimed = parseVaultDescriptor(descriptor);
        const ownAccountXpub = await computeOwnVaultAccountXpub({
          passwordBlob,
          wkIdentity,
          chain: claimed.chain,
          orgIndex: claimed.orgIndex,
          vaultIndex: claimed.vaultIndex,
        });
        const result = verifyVaultGate({
          descriptor,
          descriptorHash,
          wkIdentity,
          ownAccountXpub,
          request: binding,
        });
        if (run !== runRef.current) return;
        setState(
          result.pin
            ? { status: 'verified', verified: result.verified }
            : { status: 'needs_pin', verified: result.verified },
        );
      } catch (error) {
        if (run !== runRef.current) return;
        setState(toGateError(error));
      }
    })();
  }, [
    open,
    descriptor,
    descriptorHash,
    hasRequest,
    requestChain,
    requestOrgIndex,
    requestVaultIndex,
    requestSigningMode,
    passwordBlob,
    wkIdentity,
  ]);

  /** The user confirmed the vault on the pin screen. */
  const confirmPin = useCallback(() => {
    if (state.status !== 'needs_pin') return;
    const { verified } = state;
    if (pinTiming === 'on_sign') {
      stagedHashRef.current = verified.hash;
      setState({ status: 'verified', verified, staged: true });
      return;
    }
    try {
      commitVaultPin(verified, verified.hash, vaultName);
      setState({ status: 'verified', verified });
    } catch (error) {
      setState(toGateError(error));
    }
  }, [state, vaultName, pinTiming]);

  /** Forget a confirmation that never led to a signature (cancel / decline). */
  const discardStagedPin = useCallback(() => {
    stagedHashRef.current = null;
  }, []);

  /**
   * Save the pin right before this device's key is used for the request,
   * after `reverify` and the dialog's own VD-4 checks passed. A no-op for an
   * already pinned vault. Throws VaultDescriptorError.
   */
  const commitPin = useCallback(
    (verified: VerifiedVaultDescriptor) => {
      const record = commitVaultPin(verified, stagedHashRef.current, vaultName);
      stagedHashRef.current = null;
      return record;
    },
    [vaultName],
  );

  /** Sign-time re-check. Throws VaultDescriptorError. */
  const reverify = useCallback(
    (ownAccountXpub: string): VerifiedVaultDescriptor =>
      verifyPinnedVaultGate(
        {
          descriptor,
          descriptorHash,
          wkIdentity,
          ownAccountXpub,
          request: hasRequest
            ? {
                chain: requestChain ?? '',
                orgIndex: requestOrgIndex ?? -1,
                vaultIndex: requestVaultIndex ?? -1,
                signingMode: requestSigningMode,
              }
            : null,
        },
        stagedHashRef.current,
      ),
    [
      descriptor,
      descriptorHash,
      wkIdentity,
      hasRequest,
      requestChain,
      requestOrgIndex,
      requestVaultIndex,
      requestSigningMode,
    ],
  );

  return { state, confirmPin, discardStagedPin, commitPin, reverify };
}
