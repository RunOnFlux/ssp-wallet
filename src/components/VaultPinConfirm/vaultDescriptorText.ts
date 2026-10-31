import type { TFunction } from 'i18next';
import type { VaultDescriptorErrorCode } from '../../lib/vaultDescriptor';

type Translate = TFunction<['home', 'common']>;

/** Signing-mode label (SSP Wallet + SSP Key / Key only / Wallet only). */
export function vaultModeLabel(t: Translate, mode: string | null): string {
  switch (mode) {
    case 'key_only':
      return t('home:vaultDescriptor.mode_key_only');
    case 'wallet_only':
    case 'sol_single':
      return t('home:vaultDescriptor.mode_wallet_only');
    default:
      return t('home:vaultDescriptor.mode_dual');
  }
}

/** Headline for a refused descriptor; the detailed reason is shown below it. */
export function vaultGateErrorText(
  t: Translate,
  code: VaultDescriptorErrorCode,
): string {
  switch (code) {
    case 'missing':
      return t('home:vaultDescriptor.err_missing');
    case 'pin_mismatch':
      return t('home:vaultDescriptor.err_pin_mismatch');
    case 'pin_storage':
      return t('home:vaultDescriptor.err_pin_storage');
    case 'derivation_mismatch':
    case 'request_mismatch':
      return t('home:vaultDescriptor.err_derivation');
    default:
      return t('home:vaultDescriptor.err_invalid');
  }
}
