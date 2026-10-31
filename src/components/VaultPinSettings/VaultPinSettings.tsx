import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Modal, Space, Typography } from 'antd';
import { ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import { blockchains } from '@storage/blockchains';
import {
  listVaultPins,
  resetAllVaultPins,
  resetVaultPin,
  type VaultPinRecord,
} from '../../lib/vaultPins';
import { vaultModeLabel } from '../VaultPinConfirm/vaultDescriptorText';
import type { cryptos } from '../../types';

const { Text } = Typography;

type PinList = { ok: true; pins: VaultPinRecord[] } | { ok: false };

function loadPins(): PinList {
  try {
    return { ok: true, pins: listVaultPins() };
  } catch {
    return { ok: false };
  }
}

/**
 * Settings row: the SSP Enterprise vaults this wallet has pinned (VD-3), with
 * "Reset vault pin" behind a confirmation. Resetting is the ONLY way a vault
 * whose configuration changed can be confirmed again.
 */
function VaultPinSettings() {
  const { t } = useTranslation(['home', 'common']);
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<PinList>({ ok: true, pins: [] });
  const [confirming, setConfirming] = useState<VaultPinRecord | 'all' | null>(
    null,
  );

  const openList = () => {
    setPins(loadPins());
    setOpen(true);
  };

  const confirmReset = () => {
    try {
      if (confirming === 'all') resetAllVaultPins();
      else if (confirming) resetVaultPin(confirming.orgId, confirming.vaultId);
    } catch {
      // The list below shows the storage problem.
    }
    setConfirming(null);
    setPins(loadPins());
  };

  const chainLabel = (chain: string) =>
    blockchains[chain as keyof cryptos]?.name ?? chain;

  return (
    <>
      <div className="settings-row">
        <div className="settings-row-label">
          <span className="settings-row-icon">
            <ShieldCheckIcon />
          </span>
          {t('home:vaultDescriptor.pins_title')}
        </div>
        <div className="settings-row-control">
          <Button size="middle" onClick={openList}>
            {t('home:vaultDescriptor.pins_manage')}
          </Button>
        </div>
      </div>

      <Modal
        title={t('home:vaultDescriptor.pins_title')}
        open={open}
        onCancel={() => setOpen(false)}
        footer={[]}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary">{t('home:vaultDescriptor.pins_help')}</Text>
          {!pins.ok && (
            <Alert
              type="error"
              showIcon
              message={t('home:vaultDescriptor.pins_unreadable')}
              action={
                <Button
                  size="small"
                  danger
                  onClick={() => setConfirming('all')}
                >
                  {t('home:vaultDescriptor.pins_reset_all')}
                </Button>
              }
            />
          )}
          {pins.ok && pins.pins.length === 0 && (
            <Text>{t('home:vaultDescriptor.pins_empty')}</Text>
          )}
          {pins.ok &&
            pins.pins.map((pin) => (
              <div
                key={`${pin.orgId}:${pin.vaultId}`}
                className="settings-row"
                style={{ alignItems: 'flex-start' }}
              >
                <div style={{ minWidth: 0 }}>
                  <Text strong style={{ display: 'block' }}>
                    {pin.vaultName || t('home:vaultDescriptor.unnamed_vault')}
                  </Text>
                  <Text
                    type="secondary"
                    style={{ display: 'block', fontSize: 12 }}
                  >
                    {chainLabel(pin.chain)} ·{' '}
                    {t('home:vaultDescriptor.pin_threshold_value', {
                      m: pin.requiredSigners,
                      n: pin.totalSigners,
                    })}{' '}
                    · {vaultModeLabel(t, pin.signingMode)}
                  </Text>
                  <Text
                    type="secondary"
                    style={{ display: 'block', fontSize: 12 }}
                  >
                    {t('home:vaultDescriptor.pinned_on', {
                      date: new Date(pin.pinnedAt).toLocaleDateString(),
                    })}
                  </Text>
                </div>
                <Button size="small" danger onClick={() => setConfirming(pin)}>
                  {t('home:vaultDescriptor.pins_reset')}
                </Button>
              </div>
            ))}
          {pins.ok && pins.pins.length > 1 && (
            <Button danger type="link" onClick={() => setConfirming('all')}>
              {t('home:vaultDescriptor.pins_reset_all')}
            </Button>
          )}
        </Space>
      </Modal>

      <Modal
        title={t('home:vaultDescriptor.pins_reset_confirm_title')}
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onOk={confirmReset}
        okText={
          confirming === 'all'
            ? t('home:vaultDescriptor.pins_reset_all')
            : t('home:vaultDescriptor.pins_reset')
        }
        okButtonProps={{ danger: true }}
        cancelText={t('common:cancel')}
        zIndex={1100}
      >
        <Text>
          {confirming === 'all'
            ? t('home:vaultDescriptor.pins_reset_all_confirm')
            : t('home:vaultDescriptor.pins_reset_confirm', {
                name:
                  (confirming && confirming.vaultName) ||
                  t('home:vaultDescriptor.unnamed_vault'),
              })}
        </Text>
      </Modal>
    </>
  );
}

export default VaultPinSettings;
