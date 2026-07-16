import { useEffect, useState } from 'react';
import { Modal, Input, Button } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import Identicon from '../Identicon/Identicon';
import CreationSteps from '../CreationSteps/CreationSteps';
import { ACCENT_COLORS } from '../../storage/walletMeta';
import './OnboardingPersonalize.css';

interface Props {
  open: boolean;
  /** "Wallet N" default used as placeholder + fallback if left blank. */
  defaultName: string;
  /** Identity string the preview identicon is derived from (e.g. "0-0"). */
  identiconSeed: string;
  /** Whether this is the import (restore) wizard — only affects step labels. */
  isImport?: boolean;
  onContinue: (name: string, color: string) => void;
  onBack?: () => void;
}

/**
 * "Make it yours" — the IKEA-effect personalization step. The user names the
 * wallet and picks a color accent, previewed live on the wallet's identicon.
 * Purely cosmetic: the result is written to the append-only `walletMeta` key,
 * never to wallet state or config. The primary button says "Continue" (never
 * "Finish") — onboarding keeps momentum toward the first real use.
 */
function OnboardingPersonalize({
  open,
  defaultName,
  identiconSeed,
  isImport = false,
  onContinue,
  onBack,
}: Props) {
  const { t } = useTranslation(['cr', 'common']);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(ACCENT_COLORS[0]);

  useEffect(() => {
    if (open) {
      setName('');
      setColor(ACCENT_COLORS[0]);
    }
  }, [open]);

  const displayName = name.trim() || defaultName;

  return (
    <Modal
      title={t('cr:personalize.title', 'Make it yours')}
      open={open}
      onCancel={onBack}
      maskClosable={false}
      style={{ textAlign: 'center', top: 60 }}
      footer={[
        <Button
          key="continue"
          type="primary"
          block
          size="large"
          onClick={() => onContinue(displayName, color)}
        >
          {t('common:continue')}
        </Button>,
      ]}
    >
      <CreationSteps step={3} import={isImport} />
      <p className="personalize-lead">
        {t(
          'cr:personalize.lead',
          'Give your wallet a name and a color so you can spot it at a glance.',
        )}
      </p>

      <div className="personalize-preview">
        <span
          className="personalize-identicon-ring"
          style={{ boxShadow: `0 0 0 3px ${color}` }}
        >
          <Identicon value={identiconSeed} size={64} />
          <span
            className="personalize-accent-dot"
            style={{ background: color }}
          />
        </span>
        <span className="personalize-preview-name">{displayName}</span>
      </div>

      <Input
        size="large"
        value={name}
        maxLength={25}
        placeholder={defaultName}
        onChange={(e) => setName(e.target.value)}
        aria-label={t('cr:personalize.name_label', 'Wallet name')}
        style={{ marginBottom: 18 }}
      />

      <div className="personalize-swatches" role="radiogroup">
        {ACCENT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-label={c}
            className={`personalize-swatch${c === color ? ' selected' : ''}`}
            style={{ background: c, color: c }}
            onClick={() => setColor(c)}
          >
            {c === color && <CheckOutlined />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default OnboardingPersonalize;
