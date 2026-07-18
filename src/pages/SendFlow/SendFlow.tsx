/**
 * SendFlow — the unified 3-step send experience (compose → review → approve)
 * replacing the legacy Send / SendEVM / SendSOL pages. All three routes
 * (/send, /sendevm, /sendsol) render this page; the per-chain strategy is
 * picked by the active chain's chainType exactly as the navigation did
 * before, so every existing navigate() + location.state contract keeps
 * working (swap prefill, WalletConnect, payment requests, RBF).
 *
 * Chain behavior lives in the strategy hooks (useUtxoSendStrategy /
 * useEvmSendStrategy / useSolSendStrategy) — this page only renders the
 * shared shell: recipient with contacts + QR + identicon, amount with fiat +
 * MAX, message, review card with fee presets, and the untouched ConfirmTxKey
 * handshake for approval.
 */
import { useEffect, useMemo, useState } from 'react';
import { Form, Button, Input, Space, Popover, Select, theme } from 'antd';
import { CircleHelp as CircleHelpIcon, Scan as ScanIcon } from 'lucide-react';
import BigNumber from 'bignumber.js';
import { useTranslation } from 'react-i18next';

import PageHeader from '../../components/PageHeader/PageHeader';
import SspConnect from '../../components/SspConnect/SspConnect';
import QRScanner, {
  isQrScanSupported,
} from '../../components/QRScanner/QRScanner';
import Identicon from '../../components/Identicon/Identicon';
import { useAppSelector } from '../../hooks';
import { formatFiatWithSymbol } from '../../lib/currency';
import { sspConfig } from '@storage/ssp';
import { blockchains } from '@storage/blockchains';
import { getDisplayName } from '../../storage/walletNames';
import {
  sendStepReducer,
  sendStepIndex,
  type SendStep,
} from '../../lib/sendStrategies/machine';
import type { FeePresetKey } from '../../lib/sendStrategies/utxo';
import { toast } from '../../lib/toast';
import { truncateAddress } from '../../lib/addressDisplay';
import type { SendStrategyView } from './types';
import { useUtxoSendStrategy } from './useUtxoSendStrategy';
import { useEvmSendStrategy } from './useEvmSendStrategy';
import { useSolSendStrategy } from './useSolSendStrategy';
import './SendFlow.css';

interface contactOption {
  label: string;
  index?: string;
  value: string;
}

interface contactsInterface {
  label: string;
  options: contactOption[];
}

const STRATEGY_HOOKS: Record<'utxo' | 'evm' | 'sol', () => SendStrategyView> = {
  utxo: useUtxoSendStrategy,
  evm: useEvmSendStrategy,
  sol: useSolSendStrategy,
};

function SendFlow() {
  const { activeChain } = useAppSelector((state) => state.sspState);
  const chainType = (blockchains[activeChain].chainType ?? 'utxo') as
    | 'utxo'
    | 'evm'
    | 'sol';
  // chainType cannot change while this page is mounted (the flow header shows
  // chain context but offers no switcher), so keying the inner flow by
  // chainType keeps the strategy hook identity stable per mount.
  return <SendFlowInner key={chainType} chainType={chainType} />;
}

function SendFlowInner({ chainType }: { chainType: 'utxo' | 'evm' | 'sol' }) {
  const { token } = theme.useToken();
  const { t } = useTranslation(['send', 'common', 'home']);
  const strategy = STRATEGY_HOOKS[chainType]();
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets } = useAppSelector((state) => state[activeChain]);
  const { contacts } = useAppSelector((state) => state.contacts);
  const walletNames = useAppSelector(
    (state) => state.walletNames?.chains[activeChain] || {},
  );

  const [step, setStep] = useState<SendStep>('compose');
  const [openQrScanner, setOpenQrScanner] = useState(false);

  // Approve step tracks the ConfirmTxKey handshake modal.
  useEffect(() => {
    setStep((current) =>
      sendStepReducer(current, {
        type: strategy.approveActive ? 'APPROVE_OPEN' : 'APPROVE_CLOSED',
      }),
    );
  }, [strategy.approveActive]);

  // Contacts + own-wallets dropdown — lifted from the legacy pages
  // (identical logic in all three). Contacts double as "recent recipients":
  // every successful send saves the receiver (dated when unnamed).
  const contactsItems: contactsInterface[] = useMemo(() => {
    const wItems: contactOption[] = [];
    Object.keys(wallets).forEach((wallet) => {
      const customName = walletNames[wallet];
      const walletName = getDisplayName(activeChain, wallet);

      const wal = {
        value: wallets[wallet].address,
        index: wallet,
        label: customName || walletName,
      };
      wItems.push(wal);
    });
    wItems.sort((a, b) => {
      if (!a.index || !b.index) return 0;
      if (+a.index.split('-')[1] < +b.index.split('-')[1]) return -1;
      if (+a.index.split('-')[1] > +b.index.split('-')[1]) return 1;
      return 0;
    });
    wItems.sort((a, b) => {
      if (!a.index || !b.index) return 0;
      if (+a.index.split('-')[0] < +b.index.split('-')[0]) return -1;
      if (+a.index.split('-')[0] > +b.index.split('-')[0]) return 1;
      return 0;
    });
    const sendContacts: contactsInterface[] = [];
    const contactsOptions: contactOption[] = [];
    contacts[activeChain]?.forEach((contact) => {
      const option = {
        label:
          contact.name ||
          new Date(contact.id).toLocaleDateString() +
            ' ' +
            new Date(contact.id).toLocaleTimeString(),
        value: contact.address,
      };
      contactsOptions.push(option);
    });
    if (contactsOptions.length > 0) {
      sendContacts.push({
        label: 'Contacts',
        options: contactsOptions,
      });
    }
    sendContacts.push({
      label: t('common:my_wallets'),
      options: wItems,
    });
    return sendContacts;
  }, [wallets, activeChain, contacts, walletNames, t]);

  const recipientName = useMemo(() => {
    const receiver = strategy.receiver.value;
    if (!receiver) return null;
    const contact = contacts[activeChain]?.find(
      (c) => c.address === receiver && c.name,
    );
    if (contact?.name) return contact.name;
    const ownWallet = Object.keys(wallets).find(
      (w) => wallets[w].address === receiver,
    );
    if (ownWallet) {
      return walletNames[ownWallet] || getDisplayName(activeChain, ownWallet);
    }
    return null;
  }, [strategy.receiver.value, contacts, wallets, walletNames, activeChain]);

  const handleContinue = () => {
    const error = strategy.validateCompose();
    if (error) {
      void toast.open({ type: 'error', content: error });
      return;
    }
    setStep((current) =>
      sendStepReducer(current, { type: 'CONTINUE', composeError: error }),
    );
  };

  const handleBack = () => {
    setStep((current) => sendStepReducer(current, { type: 'BACK' }));
  };

  const presetLabel = (key: FeePresetKey): string =>
    t(`send:fee_preset_${key}`);

  const presetEta = (key: FeePresetKey): string => {
    if (key === 'custom') {
      return t('send:eta_custom');
    }
    const etaKeys = {
      utxo: {
        slow: t('send:eta_utxo_slow'),
        normal: t('send:eta_utxo_normal'),
        fast: t('send:eta_utxo_fast'),
      },
      evm: {
        slow: t('send:eta_evm_slow'),
        normal: t('send:eta_evm_normal'),
        fast: t('send:eta_evm_fast'),
      },
      sol: {
        slow: t('send:eta_sol_normal'),
        normal: t('send:eta_sol_normal'),
        fast: t('send:eta_sol_normal'),
      },
    } as const;
    return etaKeys[chainType][key];
  };

  // Fiat for a preset fee via the same rate path the strategies use
  // (crypto rate × fiat rate — fees are always in the native asset).
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );
  const presetFiat = (feeAmount: string | null): string | null => {
    if (feeAmount === null) return null;
    const numeric = new BigNumber(feeAmount || '0');
    if (!numeric.isFinite() || numeric.lte(0)) return null;
    const cr = cryptoRates[activeChain] ?? 0;
    const fi = fiatRates[sspConfig().fiatCurrency] ?? 0;
    if (!cr || !fi) return null;
    return formatFiatWithSymbol(numeric.multipliedBy(cr).multipliedBy(fi));
  };

  const selectedTitleStep = strategy.approveActive ? 'approve' : step;
  const stepLabels: Record<SendStep, string> = {
    compose: t('send:step_details'),
    review: t('send:step_review'),
    approve: t('send:step_approve'),
  };

  const rbfContent = (
    <div>
      <p>{t('home:transactionsTable.replace_by_fee_desc')}</p>
      <p>{t('home:transactionsTable.replace_by_fee_desc_b')}</p>
      <p>{t('send:replace_by_fee_stop')}</p>
    </div>
  );

  return (
    <div className="flow-page">
      {/* Slim v2 chrome: back chevron + title + static chain pill. The send
          flow is chain-bound mid-flow, so chain context is shown but never
          switchable here; wallet switching and the old Navbar burger
          utilities are reachable via the shell after backing out. */}
      <PageHeader title={strategy.headerTitle || t('send:send')} chainPill />

      {/* Step progress — Details · Review · Approve */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          margin: '4px 0 12px',
        }}
        aria-label={stepLabels[selectedTitleStep]}
      >
        {(['compose', 'review', 'approve'] as SendStep[]).map((s, i) => {
          const activeIndex = sendStepIndex(selectedTitleStep);
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          return (
            <div
              key={s}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {i > 0 && (
                <div
                  style={{
                    width: 24,
                    height: 2,
                    borderRadius: 1,
                    background:
                      isDone || isActive
                        ? token.colorPrimary
                        : token.colorBorderSecondary,
                  }}
                />
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background:
                      isDone || isActive
                        ? token.colorPrimary
                        : token.colorBorderSecondary,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive
                      ? token.colorText
                      : token.colorTextSecondary,
                  }}
                >
                  {stepLabels[s]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Form
        name="sendForm"
        form={strategy.form}
        onFinish={(values) => strategy.onFinish(values)}
        onFinishFailed={(info) => {
          // Some fields (fee, gas components) live behind the Custom preset
          // or are hidden — surface their validation errors via toast so a
          // failed submit is never silent.
          const firstError = info.errorFields?.[0]?.errors?.[0];
          if (firstError) {
            void toast.open({ type: 'error', content: firstError });
          }
        }}
        autoComplete="off"
        layout="vertical"
        style={{ paddingBottom: 16 }}
        data-tutorial="send-form"
      >
        {strategy.hiddenFormContent}

        {/* ============ STEP 1 — COMPOSE ============ */}
        <div style={{ display: step === 'compose' ? 'block' : 'none' }}>
          {strategy.tokenSelect && (
            <Form.Item name="asset" label={t('send:asset')}>
              <Select
                size="large"
                style={{ textAlign: 'left' }}
                popupMatchSelectWidth={false}
                value={strategy.tokenSelect.value}
                onChange={(value: string) =>
                  strategy.tokenSelect?.onChange(value)
                }
                options={strategy.tokenSelect.items}
                disabled={strategy.tokenSelect.disabled}
                dropdownRender={(menu) => <>{menu}</>}
              />
            </Form.Item>
          )}

          <Form.Item
            label={t('send:receiver_address')}
            name="receiver"
            rules={[
              { required: true, message: t('send:input_receiver_address') },
            ]}
            validateStatus={strategy.receiver.showError ? 'error' : undefined}
            help={strategy.receiver.errorText ?? undefined}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                size="large"
                value={strategy.receiver.value}
                placeholder={t('send:receiver_address')}
                disabled={strategy.receiver.disabled}
                onChange={(e) => strategy.receiver.set(e.target.value)}
              />
              {isQrScanSupported() && strategy.receiver.qrEnabled && (
                <Button
                  size="large"
                  icon={<ScanIcon />}
                  onClick={() => setOpenQrScanner(true)}
                  title={t('send:scan_qr')}
                  aria-label={t('send:scan_qr')}
                />
              )}
              <Select
                size="large"
                className="no-text-select"
                style={{ width: '40px' }}
                defaultValue=""
                value={strategy.receiver.value}
                popupMatchSelectWidth={false}
                onChange={(value: string) => strategy.receiver.set(value)}
                options={contactsItems}
                disabled={strategy.receiver.disabled}
                dropdownRender={(menu) => <>{menu}</>}
              />
            </Space.Compact>
          </Form.Item>
          {strategy.receiver.valid && strategy.receiver.value && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: -18,
                marginBottom: 12,
                marginLeft: 3,
                fontSize: 12,
                color: token.colorTextSecondary,
              }}
            >
              <Identicon value={strategy.receiver.value} size={20} />
              <span>
                {recipientName ? `${recipientName} · ` : ''}
                {truncateAddress(strategy.receiver.value)}
              </span>
            </div>
          )}

          <Form.Item
            label={t('send:amount_to_send')}
            name="amount"
            rules={[{ required: true, message: t('send:input_amount') }]}
            validateStatus={strategy.amount.status}
          >
            <Input
              size="large"
              value={strategy.amount.value}
              onChange={(e) => strategy.amount.set(e.target.value)}
              placeholder={t('send:input_amount')}
              suffix={strategy.amount.suffix}
              disabled={strategy.amount.disabled}
            />
          </Form.Item>
          {strategy.amount.fiat && (
            <div
              style={{
                marginTop: '-22px',
                float: 'left',
                marginLeft: 3,
                fontSize: 12,
                color: token.colorTextSecondary,
                zIndex: 2,
                position: 'relative',
              }}
            >
              ≈ {strategy.amount.fiat}
            </div>
          )}
          <Button
            type="text"
            size="small"
            style={{
              marginTop: '-22px',
              float: 'right',
              marginRight: 3,
              fontSize: 12,
              color: token.colorPrimary,
              cursor: strategy.amount.maxDisabled ? 'not-allowed' : 'pointer',
              zIndex: 2,
            }}
            onClick={strategy.amount.onMax}
            disabled={strategy.amount.maxDisabled}
          >
            {t('send:max')}: {strategy.amount.maxDisplay}
          </Button>

          {strategy.message && (
            <Form.Item
              style={{ marginTop: '26px' }}
              label={t('send:message')}
              name="message"
              rules={[{ required: false, message: t('send:include_message') }]}
            >
              <Input
                size="large"
                value={strategy.message.value}
                placeholder={t('send:payment_note')}
                onChange={(e) => strategy.message?.set(e.target.value)}
              />
            </Form.Item>
          )}

          <div style={{ marginTop: strategy.message ? 0 : 30 }}>
            {strategy.composeExtra}
          </div>

          <Form.Item style={{ marginTop: 40 }}>
            <Space direction="vertical" size="middle">
              <Button
                type="primary"
                size="large"
                style={{ minWidth: 220, maxWidth: '380px' }}
                onClick={handleContinue}
              >
                {t('send:continue')}
              </Button>
              <Button type="link" block size="small" onClick={strategy.cancel}>
                {t('common:cancel')}
              </Button>
            </Space>
          </Form.Item>
        </div>

        {/* ============ STEP 2 — REVIEW ============ */}
        <div style={{ display: step !== 'compose' ? 'block' : 'none' }}>
          {/* Plain-language summary card */}
          <div
            style={{
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 12,
              padding: '14px 16px',
              textAlign: 'left',
              marginBottom: 16,
              background: token.colorBgContainer,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <Identicon value={strategy.receiver.value} size={36} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: token.colorTextSecondary,
                  }}
                >
                  {t('send:review_to')}
                  {recipientName ? ` · ${recipientName}` : ''}
                </div>
                {/* Review = where the user verifies the destination — always
                    the FULL address (anti address-poisoning invariant). */}
                <div
                  style={{
                    fontFamily: 'var(--ssp-mono)',
                    fontSize: 13,
                    wordBreak: 'break-all',
                  }}
                >
                  {strategy.receiver.value}
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                {t('send:review_amount')}
              </span>
              <span style={{ textAlign: 'right' }}>
                <strong>
                  {strategy.amount.value || '0'} {strategy.amount.suffix}
                </strong>
                {strategy.amount.fiat && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: token.colorTextSecondary,
                    }}
                  >
                    ≈ {strategy.amount.fiat}
                  </span>
                )}
              </span>
            </div>
            {strategy.message?.value ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 8,
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                  {t('send:message')}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    textAlign: 'right',
                    wordBreak: 'break-word',
                  }}
                >
                  {strategy.message.value}
                </span>
              </div>
            ) : null}
          </div>

          {/* Fee presets */}
          <div style={{ textAlign: 'left', marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{t('send:network_fee')}</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                strategy.feePresets.length > 2 ? '1fr 1fr' : '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            {strategy.feePresets.map((preset) => {
              const selected = strategy.selectedPreset === preset.key;
              return (
                <div
                  key={preset.key}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  className="fee-preset"
                  onClick={() => strategy.selectPreset(preset.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      strategy.selectPreset(preset.key);
                    }
                  }}
                  style={{
                    border: `2px solid ${
                      selected ? token.colorPrimary : token.colorBorderSecondary
                    }`,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: selected
                      ? token.colorPrimaryBg
                      : token.colorBgContainer,
                  }}
                  data-testid={`fee-preset-${preset.key}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span>{presetLabel(preset.key)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: token.colorTextSecondary,
                    }}
                  >
                    {presetEta(preset.key)}
                  </div>
                  {preset.key !== 'custom' && (
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      {preset.feeAmount !== null ? (
                        <>
                          {new BigNumber(preset.feeAmount).toFixed()}{' '}
                          {strategy.feeSymbol}
                          {presetFiat(preset.feeAmount) ? (
                            <span
                              style={{
                                color: token.colorTextSecondary,
                                marginLeft: 4,
                              }}
                            >
                              ≈ {presetFiat(preset.feeAmount)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        '---'
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom fee — the legacy manual inputs, expanded on demand.
              Kept mounted so form values survive preset switches. */}
          <div
            style={{
              display: strategy.selectedPreset === 'custom' ? 'block' : 'none',
              textAlign: 'left',
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8,
              padding: '12px 12px 0',
              marginBottom: 12,
            }}
          >
            {strategy.customFeeContent}
          </div>

          {/* Fee + total summary */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              padding: '2px 4px',
            }}
          >
            <span style={{ color: token.colorTextSecondary }}>
              {t('send:network_fee')}
            </span>
            <span>
              {strategy.feeDisplay} {strategy.feeSymbol}
              {strategy.feeFiat ? (
                <span
                  style={{
                    color: token.colorTextSecondary,
                    marginLeft: 6,
                    fontSize: 12,
                  }}
                >
                  ≈ {strategy.feeFiat}
                </span>
              ) : null}
            </span>
          </div>
          {strategy.totalDisplay && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                fontWeight: 600,
                padding: '2px 4px',
                marginTop: 2,
              }}
            >
              <span>{t('send:total')}</span>
              <span>
                {strategy.totalDisplay} {strategy.feeSymbol}
              </span>
            </div>
          )}

          <Form.Item style={{ marginTop: 24 }}>
            <Space direction="vertical" size="middle">
              {strategy.isRBF && (
                <div
                  style={{
                    fontSize: 12,
                    color: token.colorTextSecondary,
                  }}
                >
                  <Popover
                    content={rbfContent}
                    title={t('send:replace_by_fee_tx')}
                  >
                    <CircleHelpIcon
                      style={{ color: token.colorPrimary }}
                    />{' '}
                  </Popover>{' '}
                  {t('send:replace_by_fee_tx')}
                </div>
              )}
              <Button
                type="primary"
                size="large"
                loading={strategy.submitting}
                // Never allow sending against a fee that is still being
                // estimated ('---'/placeholder 0) — a real computed zero fee
                // sets feeReady and stays sendable.
                disabled={!strategy.feeReady}
                style={{
                  minWidth: 220,
                  maxWidth: '380px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  strategy.form.submit();
                }}
              >
                {strategy.submitLabel}
              </Button>
              <div
                style={{
                  fontSize: 12,
                  color: token.colorTextSecondary,
                  maxWidth: 360,
                }}
              >
                {t('send:tx_to_sspkey')} {t('send:double_check_tx')}
              </div>
              <Button type="default" size="middle" onClick={handleBack}>
                {t('send:back')}
              </Button>
              <Button type="link" block size="small" onClick={strategy.cancel}>
                {t('common:cancel')}
              </Button>
            </Space>
          </Form.Item>
        </div>
      </Form>

      {/* ============ STEP 3 — APPROVE (handshake modals, untouched) ==== */}
      {strategy.modals}

      <QRScanner
        open={openQrScanner}
        onClose={() => setOpenQrScanner(false)}
        onResult={(value) => {
          // QR payloads may be a bare address or a chain URI such as
          // "bitcoin:<address>?amount=..." / "ethereum:<address>@1?value=..."
          // — take the address portion only.
          let scanned = value.trim();
          const schemeMatch = scanned.match(/^[a-zA-Z]+:([^@?]+)/);
          if (schemeMatch) {
            scanned = schemeMatch[1];
          }
          strategy.receiver.set(scanned);
          setOpenQrScanner(false);
        }}
      />
      <SspConnect />
    </div>
  );
}

export default SendFlow;
