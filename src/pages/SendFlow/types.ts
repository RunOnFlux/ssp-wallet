import type { ReactNode } from 'react';
import type { FormInstance } from 'antd';
import type { FeePresetKey } from '../../lib/sendStrategies/utxo';

/**
 * The uniform surface every per-chain send strategy hook exposes to the
 * unified SendFlow page. Strategies own ALL chain-specific behavior — fee
 * models, balance fetching, validation, WalletConnect/swap/payment-request
 * integrations and, critically, transaction construction: they call the
 * EXISTING lib/constructTx functions exactly as the legacy pages did.
 */

export interface TokenSelectView {
  items: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

export interface FeePresetView {
  key: FeePresetKey;
  /** Fee amount in native units for display, or null when not yet known. */
  feeAmount: string | null;
}

export interface SendStrategyView {
  chainType: 'utxo' | 'evm' | 'sol';
  /** Page header title override (swap mode uses the swap title). */
  headerTitle: string;
  /** Submit button label (swap mode shows "Send and Swap for ..."). */
  submitLabel: string;

  form: FormInstance;
  onFinish: (values: unknown) => void;
  /** Cancel contract — includes payment-request / WalletConnect rejection. */
  cancel: () => void;
  submitting: boolean;

  // ---- compose step ----
  tokenSelect: TokenSelectView | null;
  receiver: {
    value: string;
    set: (value: string) => void;
    disabled: boolean;
    /** Live validation for the identicon + inline error. */
    valid: boolean;
    showError: boolean;
    errorText: string | null;
    qrEnabled: boolean;
  };
  amount: {
    value: string;
    set: (value: string) => void;
    status: '' | 'success' | 'error' | 'warning' | 'validating' | undefined;
    suffix: string;
    disabled: boolean;
    fiat: string | null;
    maxDisplay: string;
    onMax: () => void;
    maxDisabled: boolean;
  };
  message: { value: string; set: (value: string) => void } | null;
  /** Chain-specific extra compose content (EVM: advanced data collapse). */
  composeExtra: ReactNode;
  /**
   * Chain-specific extra content inside the REVIEW summary card (EVM:
   * contract-interaction/calldata disclosure — anything that changes what
   * the transaction does must be visible at the confirmation point).
   */
  reviewExtra?: ReactNode;
  /** Gate compose → review. Returns a user-facing error message or null. */
  validateCompose: () => string | null;

  // ---- review step ----
  feePresets: FeePresetView[];
  selectedPreset: FeePresetKey;
  selectPreset: (key: FeePresetKey) => void;
  /** The legacy manual fee inputs, shown when Custom is selected. */
  customFeeContent: ReactNode;
  /** Hidden-but-mounted form fields (fee et al.) kept alive across steps. */
  hiddenFormContent: ReactNode;
  /** Current effective fee in native units ('---' when unknown). */
  feeDisplay: string;
  /**
   * False while the fee is still being estimated (or estimation failed) —
   * the review Send button stays disabled until it is true. A legitimately
   * computed zero fee and a user-entered Custom fee both count as ready.
   */
  feeReady: boolean;
  feeSymbol: string;
  feeFiat: string | null;
  /**
   * Short fee-RATE readout, e.g. "12 sat/vB" (UTXO) or "25 gwei" (EVM), shown
   * next to the fee amount on the form so both are visible even on Automatic.
   * null for chains without a market rate (Solana's flat schedule).
   */
  feeRateDisplay: string | null;
  /** Amount + fee total in native units for native-asset sends, else null. */
  totalDisplay: string | null;
  /** Fiat value of totalDisplay (so Review shows the total in fiat too). */
  totalFiat: string | null;
  isRBF: boolean;

  // ---- approve step ----
  /** True while the ConfirmTxKey handshake modal is open. */
  approveActive: boolean;
  /** ConfirmTxKey + TxSent + TxRejected (+ EVM nonce modals) — untouched. */
  modals: ReactNode;
}
