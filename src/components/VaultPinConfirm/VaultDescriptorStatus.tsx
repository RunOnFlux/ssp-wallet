import { useTranslation } from 'react-i18next';
import { Alert, Spin, Typography } from 'antd';
import { ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import type { VaultGateState } from '../../hooks/useVaultDescriptorGate';
import { vaultGateErrorText, vaultModeLabel } from './vaultDescriptorText';
import './VaultPinConfirm.css';

const { Text } = Typography;

interface Props {
  state: VaultGateState;
  /** Vault address derived on this device for this request, when known. */
  sourceAddress?: string | null;
  /** A VD-4 check failure for this request (shown as a refusal). */
  checkError?: string | null;
}

/** One status line for an enterprise vault dialog (VD-3 / VD-4). */
function VaultDescriptorStatus({ state, sourceAddress, checkError }: Props) {
  const { t } = useTranslation(['home', 'common']);

  if (state.status === 'idle') return null;
  if (state.status === 'verifying' || state.status === 'needs_pin') {
    return (
      <Alert
        type="info"
        showIcon
        icon={<Spin size="small" />}
        message={t('home:vaultDescriptor.verifying')}
        style={{ textAlign: 'left' }}
      />
    );
  }
  if (state.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message={vaultGateErrorText(t, state.code)}
        description={state.code === 'missing' ? undefined : state.message}
        style={{ textAlign: 'left' }}
      />
    );
  }
  if (checkError) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('home:vaultDescriptor.err_derivation')}
        description={checkError}
        style={{ textAlign: 'left' }}
      />
    );
  }
  const { verified } = state;
  return (
    <div className="vault-descriptor-status" role="status">
      <ShieldCheckIcon size={18} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <Text strong style={{ display: 'block' }}>
          {t('home:vaultDescriptor.verified')}
        </Text>
        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          {t('home:vaultDescriptor.verified_detail', {
            m: verified.requiredSigners,
            n: verified.totalSigners,
            mode: vaultModeLabel(t, verified.descriptor.signingMode),
          })}
        </Text>
        {state.staged && (
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {t('home:vaultDescriptor.pin_staged')}
          </Text>
        )}
        {sourceAddress && (
          <>
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
              {t('home:vaultDescriptor.source_address')}:
            </Text>
            <Text
              className="vault-descriptor-status-address"
              copyable={{ text: sourceAddress }}
            >
              {sourceAddress}
            </Text>
          </>
        )}
      </div>
    </div>
  );
}

export default VaultDescriptorStatus;
