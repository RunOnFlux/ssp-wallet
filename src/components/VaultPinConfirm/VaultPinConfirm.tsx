import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Modal, Space, Typography } from 'antd';
import { blockchains } from '@storage/blockchains';
import {
  shortWkIdentity,
  type VerifiedVaultDescriptor,
} from '../../lib/vaultDescriptor';
import { vaultModeLabel } from './vaultDescriptorText';
import type { cryptos } from '../../types';
import './VaultPinConfirm.css';

const { Text } = Typography;

interface Props {
  open: boolean;
  verified: VerifiedVaultDescriptor | null;
  /** Claimed by SSP Enterprise — shown as such, never trusted. */
  vaultName: string;
  orgName?: string;
  onApprove: () => void;
  onCancel: () => void;
}

/**
 * VD-3 first sight: show the verified signer set and let the user pin it.
 * Cancel must refuse the request that triggered it.
 */
function VaultPinConfirm({
  open,
  verified,
  vaultName,
  orgName,
  onApprove,
  onCancel,
}: Props) {
  const { t } = useTranslation(['home', 'common']);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (!open || !verified) return null;
  const d = verified.descriptor;
  const chainConfig = blockchains[d.chain as keyof cryptos];
  const chainLabel = chainConfig
    ? `${chainConfig.name} (${chainConfig.symbol})`
    : d.chain;

  const toggle = (index: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const row = (label: string, value: string) => (
    <div className="vault-pin-row">
      <Text type="secondary">{label}</Text>
      <Text strong className="vault-pin-row-value">
        {value}
      </Text>
    </div>
  );

  return (
    <Modal
      title={t('home:vaultDescriptor.pin_title')}
      open={open}
      style={{ textAlign: 'center', top: 40 }}
      onCancel={onCancel}
      footer={[]}
      maskClosable={false}
      zIndex={1100}
    >
      <Space
        direction="vertical"
        size="middle"
        style={{ width: '100%', marginTop: 12, marginBottom: 12 }}
      >
        <Text>{t('home:vaultDescriptor.pin_intro')}</Text>
        <div className="vault-pin-box">
          {row(
            t('home:vaultDescriptor.pin_vault_name'),
            vaultName || t('home:vaultDescriptor.unnamed_vault'),
          )}
          {orgName && row(t('home:vaultDescriptor.pin_org_name'), orgName)}
          {row(t('home:vaultDescriptor.pin_chain'), chainLabel)}
          {row(
            t('home:vaultDescriptor.pin_mode'),
            vaultModeLabel(t, d.signingMode),
          )}
          {row(
            t('home:vaultDescriptor.pin_threshold'),
            t('home:vaultDescriptor.pin_threshold_value', {
              m: verified.requiredSigners,
              n: verified.totalSigners,
            }),
          )}
        </div>
        <div style={{ textAlign: 'left' }}>
          <Text type="secondary" strong>
            {t('home:vaultDescriptor.pin_members')}
          </Text>
        </div>
        <div className="vault-pin-members">
          {d.members.map((member, index) => (
            <button
              key={member.wkIdentity}
              type="button"
              className="vault-pin-member"
              aria-expanded={expanded.has(index)}
              onClick={() => toggle(index)}
            >
              {expanded.has(index)
                ? member.wkIdentity
                : shortWkIdentity(member.wkIdentity)}
              {index === verified.ownMemberIndex && (
                <span className="vault-pin-member-you">
                  ({t('home:vaultDescriptor.pin_you')})
                </span>
              )}
            </button>
          ))}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('home:vaultDescriptor.pin_tap_hint')}
        </Text>
        <Alert
          type="warning"
          showIcon
          message={t('home:vaultDescriptor.pin_note')}
          style={{ textAlign: 'left' }}
        />
        <Space direction="vertical" size="large" style={{ marginTop: 8 }}>
          <Button type="primary" size="large" onClick={onApprove}>
            {t('home:vaultDescriptor.pin_approve')}
          </Button>
          <Button type="link" block size="small" onClick={onCancel}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}

export default VaultPinConfirm;
