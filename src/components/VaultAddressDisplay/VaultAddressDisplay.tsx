import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Modal, Space, Typography } from 'antd';
import {
  CircleCheck as CircleCheckIcon,
  CircleX as CircleXIcon,
} from 'lucide-react';
import { useVaultDescriptorGate } from '../../hooks/useVaultDescriptorGate';
import {
  deriveVaultAddressFromDescriptor,
  vaultAddressesEqual,
} from '../../lib/vaultDescriptorDerive';
import { VAULT_ERROR_CODES, vaultGateErrorCode } from '../../lib/vaultGate';
import type { WkSignRequesterInfo } from '../../lib/wkSign';
import VaultPinConfirm from '../VaultPinConfirm/VaultPinConfirm';
import VaultDescriptorStatus from '../VaultPinConfirm/VaultDescriptorStatus';
import RequesterOrigin from '../SspConnect/RequesterOrigin';
import './VaultAddressDisplay.css';

const { Text } = Typography;

/**
 * SSP Enterprise reads `address` / `matches` at the top level; `result`
 * carries the same values in the shape the other window.ssp methods use.
 */
export interface VaultAddressResponse {
  status: string;
  address?: string;
  matches?: boolean;
  result?: { address: string; matches: boolean };
  data?: string;
  errorCode?: string;
}

interface Props {
  open: boolean;
  openAction: (data: VaultAddressResponse | null) => void;
  requesterInfo: WkSignRequesterInfo | null;
  vaultDescriptor: unknown;
  vaultDescriptorHash?: string;
  /** BIP32 level of vault addresses; undefined = the vault's own vaultIndex. */
  typeIndex?: number;
  addressIndex: number;
  expectedAddress: string;
  vaultName: string;
  orgName?: string;
}

/**
 * VD-5 (H-17): show a vault address derived on this device from the verified,
 * pinned signer set, with a MATCH / MISMATCH against what SSP Enterprise shows.
 */
function VaultAddressDisplay({
  open,
  openAction,
  requesterInfo,
  vaultDescriptor,
  vaultDescriptorHash,
  typeIndex,
  addressIndex,
  expectedAddress,
  vaultName,
  orgName,
}: Props) {
  const { t } = useTranslation(['home', 'common']);
  const gate = useVaultDescriptorGate({
    open,
    descriptor: vaultDescriptor,
    descriptorHash: vaultDescriptorHash,
    request: null,
    vaultName,
    // Showing the address IS the action here: pin as soon as it is confirmed.
    pinTiming: 'on_confirm',
  });
  const verified =
    gate.state.status === 'verified' ? gate.state.verified : null;

  const derivation = useMemo(():
    | { ok: true; address: string; matches: boolean }
    | { ok: false; error: string }
    | null => {
    if (!verified) return null;
    const d = verified.descriptor;
    try {
      // Vault addresses live at /{vaultIndex}/{addressIndex}; any other
      // level is not an address of this vault.
      if (typeIndex !== undefined && typeIndex !== d.vaultIndex) {
        throw new Error(
          `typeIndex ${String(typeIndex)} is not this vault's address level (${String(
            d.vaultIndex,
          )})`,
        );
      }
      const derived = deriveVaultAddressFromDescriptor(
        d,
        d.vaultIndex,
        addressIndex,
      );
      return {
        ok: true,
        address: derived.address,
        matches: vaultAddressesEqual(d.chain, derived.address, expectedAddress),
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Address derivation failed',
      };
    }
  }, [verified, typeIndex, addressIndex, expectedAddress]);

  if (!open) return null;

  const gateError = gate.state.status === 'error' ? gate.state : null;

  const handleClose = () => {
    if (derivation?.ok) {
      openAction({
        status: 'SUCCESS',
        address: derivation.address,
        matches: derivation.matches,
        result: { address: derivation.address, matches: derivation.matches },
      });
      return;
    }
    if (gateError) {
      openAction({
        status: 'ERROR',
        data: gateError.message,
        errorCode: vaultGateErrorCode(gateError.code),
      });
      return;
    }
    if (derivation && !derivation.ok) {
      openAction({
        status: 'ERROR',
        data: derivation.error,
        errorCode: VAULT_ERROR_CODES.invalid,
      });
      return;
    }
    openAction(null);
  };

  const handlePinDeclined = () => {
    openAction({
      status: 'ERROR',
      data: t('home:vaultDescriptor.pin_declined'),
      errorCode: VAULT_ERROR_CODES.pinRefused,
    });
  };

  return (
    <>
      <VaultPinConfirm
        open={gate.state.status === 'needs_pin'}
        verified={
          gate.state.status === 'needs_pin' ? gate.state.verified : null
        }
        vaultName={vaultName}
        orgName={orgName}
        onApprove={gate.confirmPin}
        onCancel={handlePinDeclined}
      />
      <Modal
        title={t('home:vaultDescriptor.address_title')}
        open={open}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleClose}
        footer={[]}
        maskClosable={false}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ width: '100%', marginTop: 12, marginBottom: 12 }}
        >
          <RequesterOrigin variant="inline" requesterInfo={requesterInfo} />
          <Text>{t('home:vaultDescriptor.address_intro')}</Text>
          <VaultDescriptorStatus
            state={gate.state}
            checkError={derivation && !derivation.ok ? derivation.error : null}
          />
          {derivation?.ok && (
            <>
              <div
                className={`vault-address-verdict ${
                  derivation.matches
                    ? 'vault-address-verdict-match'
                    : 'vault-address-verdict-mismatch'
                }`}
                role="status"
              >
                {derivation.matches ? (
                  <CircleCheckIcon size={28} />
                ) : (
                  <CircleXIcon size={28} />
                )}
                <span className="vault-address-verdict-label">
                  {derivation.matches
                    ? t('home:vaultDescriptor.match')
                    : t('home:vaultDescriptor.mismatch')}
                </span>
              </div>
              {!derivation.matches && (
                <Alert
                  type="error"
                  showIcon
                  message={t('home:vaultDescriptor.mismatch_detail')}
                  style={{ textAlign: 'left' }}
                />
              )}
              {derivation.matches && (
                <Text type="secondary">
                  {t('home:vaultDescriptor.match_detail')}
                </Text>
              )}
              <div className="vault-address-box">
                <Text type="secondary" style={{ display: 'block' }}>
                  {t('home:vaultDescriptor.address_derived')} ·{' '}
                  {t('home:vaultDescriptor.address_index', {
                    index: addressIndex,
                  })}
                </Text>
                <Text
                  strong
                  copyable={{ text: derivation.address }}
                  className="vault-address-value"
                >
                  {derivation.address}
                </Text>
              </div>
              <div className="vault-address-box">
                <Text type="secondary" style={{ display: 'block' }}>
                  {t('home:vaultDescriptor.address_expected')}
                </Text>
                <Text className="vault-address-value">
                  {expectedAddress || '-'}
                </Text>
              </div>
            </>
          )}
          <Button
            type="primary"
            size="large"
            onClick={handleClose}
            disabled={gate.state.status === 'verifying'}
          >
            {derivation?.ok
              ? t('home:vaultDescriptor.done')
              : t('common:cancel')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default VaultAddressDisplay;
