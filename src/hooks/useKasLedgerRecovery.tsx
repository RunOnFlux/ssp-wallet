/**
 * Kaspa signed-amount ledger refusals (review KAS-2 / KAS-6), shared by the
 * consumer send flow and enterprise vault co-signing.
 *
 * Signing stays refused. The only ways out are explicit, warned resets
 * (lib/kaspa.ts), each behind a confirmation dialog:
 *  - the whole record, when it is unreadable (resetCorruptKasLedger keeps the
 *    bad blob aside and refuses to touch a readable ledger);
 *  - single coins whose amount could NOT be proven from the chain
 *    (KasLedgerConflictError.unprovable → resetKasLedgerOutpoints), and only
 *    when no coin of the same request was PROVEN wrong.
 * A conflict the chain PROVES (`refused`: the backend's amount is false) is
 * refused with no reset on offer, even when other coins of the same request
 * are merely unprovable: the backend has just been caught lying, so its
 * unprovable amounts are not to be trusted either, and a reset would re-open
 * the fee inflation the record guards against (same rule as SSP Key,
 * kaspaLedgerConflict.ts). A full ledger and a ledger lock that could not be
 * taken (another SSP window is signing, or no Web Locks) are refused with no
 * reset on offer too.
 */
import type { ReactNode } from 'react';
import { App, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  isKasLedgerConflictError,
  isKasLedgerCorruptError,
  isKasLedgerFullError,
  isKasLedgerLockError,
  resetCorruptKasLedger,
  resetKasLedgerOutpoints,
} from '../lib/kaspa';

export type KasLedgerOutcome =
  /** A warned reset dialog was opened; `message` says why signing stopped. */
  | { kind: 'prompted'; message: string }
  /** A ledger refusal with no reset on offer: show `message`. */
  | { kind: 'refused'; message: string }
  /** Not a signed-amount ledger refusal. */
  | null;

export interface KasLedgerRecoveryOptions {
  /** Shows a result or refusal to the user. */
  notify: (type: 'success' | 'error', content: string) => void;
  /** Called after a reset went through (the user may sign again). */
  onReset?: () => void;
}

interface ConfirmArgs {
  title: string;
  content: ReactNode;
  okText: string;
  okButtonProps: { danger: true };
  cancelText: string;
  onOk: () => Promise<void>;
}

/**
 * Returns a classifier for a signing error. A ledger refusal is handled
 * (dialog or message) and reported; anything else returns null so the
 * caller's own error handling applies.
 */
export function useKasLedgerRecovery({
  notify,
  onReset,
}: KasLedgerRecoveryOptions): (error: unknown) => KasLedgerOutcome {
  const { t } = useTranslation(['send', 'common']);
  const { modal } = App.useApp();
  // Outside an antd <App> the hook API is empty: fall back to the static
  // dialog rather than swallowing the refusal.
  const confirm = (args: ConfirmArgs): void => {
    if (typeof modal.confirm === 'function') modal.confirm(args);
    else Modal.confirm(args);
  };

  return (error: unknown): KasLedgerOutcome => {
    if (isKasLedgerCorruptError(error)) {
      confirm({
        title: t('send:kas_ledger_corrupt_title'),
        content: t('send:kas_ledger_corrupt_desc'),
        okText: t('send:kas_ledger_reset'),
        okButtonProps: { danger: true },
        cancelText: t('common:cancel'),
        onOk: async () => {
          try {
            if (await resetCorruptKasLedger()) {
              notify('success', t('send:kas_ledger_reset_done'));
              onReset?.();
            }
          } catch {
            notify('error', t('send:err_kas_ledger_reset_failed'));
          }
        },
      });
      return { kind: 'prompted', message: t('send:kas_ledger_corrupt_title') };
    }
    if (isKasLedgerConflictError(error)) {
      const unprovable = [...error.unprovable];
      // Fail closed: a missing `refused` list counts as a proven conflict.
      const refused: readonly unknown[] = Array.isArray(error.refused)
        ? error.refused
        : [null];
      if (refused.length > 0 || unprovable.length === 0) {
        return {
          kind: 'refused',
          message: t('send:err_kas_ledger_conflict_proven'),
        };
      }
      confirm({
        title: t('send:kas_ledger_conflict_title'),
        content: (
          <div>
            <p>{t('send:kas_ledger_conflict_desc')}</p>
            {unprovable.map((o) => (
              <div
                key={o}
                style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
              >
                {o}
              </div>
            ))}
          </div>
        ),
        okText: t('send:kas_ledger_reset_outpoints'),
        okButtonProps: { danger: true },
        cancelText: t('common:cancel'),
        onOk: async () => {
          try {
            const count = await resetKasLedgerOutpoints(unprovable);
            notify(
              'success',
              t('send:kas_ledger_reset_outpoints_done', { n: String(count) }),
            );
            onReset?.();
          } catch {
            notify('error', t('send:err_kas_ledger_reset_failed'));
          }
        },
      });
      return { kind: 'prompted', message: t('send:kas_ledger_conflict_title') };
    }
    if (isKasLedgerFullError(error)) {
      return { kind: 'refused', message: t('send:err_kas_ledger_full') };
    }
    if (isKasLedgerLockError(error)) {
      return { kind: 'refused', message: t('send:err_kas_ledger_lock') };
    }
    return null;
  };
}
