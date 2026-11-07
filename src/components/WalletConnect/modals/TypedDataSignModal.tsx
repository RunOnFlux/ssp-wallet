import React, { useState, useEffect } from 'react';
import { useSspLogo } from '../../../hooks/useSspLogo';
import { Modal, QRCode, Space, Typography, Alert, Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../hooks';
import { SessionRequest } from '../types/modalTypes';
import { useWalletConnect } from '../../../contexts/WalletConnectContext';
import { blockchains } from '@storage/blockchains';
import '../../DappRequest/DappRequest.css';
import VerifiedDappOrigin from '../VerifiedDappOrigin';
import {
  assessVerifyContext,
  isVerifyBlocked,
  verifyNeedsAcknowledgement,
} from '../verifyContext';
import {
  parseTypedData,
  typedDataRisk,
  type Eip712Payload,
} from '../../../lib/typedData';

const { Text, Paragraph } = Typography;

interface TypedDataSignModalProps {
  request: SessionRequest | null;
  onApprove: (request: SessionRequest) => Promise<void>;
  onReject: (request: SessionRequest) => Promise<void>;
  externalSigningRequest?: Record<string, unknown> | null;
}

const TypedDataSignModal: React.FC<TypedDataSignModalProps> = ({
  request,
  onApprove,
  onReject,
  externalSigningRequest,
}) => {
  const { t } = useTranslation(['home', 'common']);
  const sspLogo = useSspLogo();
  const { chainSwitchInfo, activeSessions } = useWalletConnect();
  const { activeChain } = useAppSelector((state) => state.sspState);
  const [step, setStep] = useState<'approval' | 'qr'>('approval');
  const [isApproving, setIsApproving] = useState(false);
  // Explicit acknowledgement of a Verify API domain mismatch (WEXT-5).
  const [verifyAcknowledged, setVerifyAcknowledged] = useState(false);
  // Typed data can authorise spending: the user confirms they understand.
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  // Reset to step 1 whenever a new request comes in
  useEffect(() => {
    if (request) {
      setStep('approval');
      setIsApproving(false);
      setVerifyAcknowledged(false);
      setRiskAcknowledged(false);
    }
  }, [request?.id]); // Reset when request ID changes

  if (!request) return null;

  const method = request.params.request.method;
  const isTypedDataMethod = [
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ].includes(method);

  if (!isTypedDataMethod) return null;

  // v3/v4 parameter order: [address, typedData]
  const [address, typedData] = request.params.request.params as [
    string,
    unknown,
  ];
  let payload: Eip712Payload | null = null;
  try {
    payload = parseTypedData(typedData);
  } catch {
    payload = null;
  }
  const risk = payload ? typedDataRisk(payload) : null;
  const domainName =
    payload && typeof payload.domain.name === 'string'
      ? payload.domain.name
      : null;
  const verifyingContract =
    payload && typeof payload.domain.verifyingContract === 'string'
      ? payload.domain.verifyingContract
      : null;

  // Step 2 QR string - should contain the actual signingRequest object
  const qrString = externalSigningRequest
    ? `evmsigningrequest${JSON.stringify(externalSigningRequest)}`
    : '';

  const handleApprove = () => {
    if (verifyBlocksApproval || !payload || !riskAcknowledged) return;
    if (step === 'approval') {
      setIsApproving(true);
      try {
        // The parent/context will provide externalSigningRequest after this call
        onApprove(request);
        setStep('qr');
      } catch (error) {
        console.error('Error initiating typed data signing:', error);
      } finally {
        setIsApproving(false);
      }
    }
  };

  const handleReject = async () => {
    try {
      await onReject(request);
    } catch (error) {
      console.error('Error rejecting typed data:', error);
    }
  };

  // Session peer metadata for the origin header (who is asking) — the name and
  // icon are self-declared; the origin shown is the Verify API's.
  const peerMetadata = activeSessions[request.topic]?.peer?.metadata;
  const verifyAssessment = assessVerifyContext(
    request.verifyContext,
    peerMetadata?.url,
  );
  const verifyBlocksApproval =
    isVerifyBlocked(verifyAssessment) ||
    (verifyNeedsAcknowledgement(verifyAssessment) && !verifyAcknowledged);

  // First step: Approval dialog
  if (step === 'approval') {
    return (
      <Modal
        title={t('home:walletconnect.sign_typed_data_request')}
        open={true}
        onOk={handleApprove}
        onCancel={handleReject}
        okText={t('home:walletconnect.approve')}
        cancelText={t('home:walletconnect.reject')}
        cancelButtonProps={{ type: 'text' }}
        confirmLoading={isApproving}
        okButtonProps={{
          disabled: verifyBlocksApproval || !payload || !riskAcknowledged,
          danger: verifyAssessment.status === 'invalid' || risk !== null,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            textAlign: 'left',
            marginTop: 16,
          }}
        >
          <VerifiedDappOrigin
            assessment={verifyAssessment}
            name={peerMetadata?.name}
            icon={peerMetadata?.icons?.[0]}
            acknowledged={verifyAcknowledged}
            onAcknowledge={setVerifyAcknowledged}
          />

          <p className="dapp-ask">
            {t('home:walletconnect.dapp_requests_typed_data_signature')}
          </p>

          {payload ? (
            <Alert
              type={risk ? 'error' : 'warning'}
              showIcon
              message={t('home:walletconnect.typed_data_warning_title')}
              description={
                <>
                  {risk === 'approval' && (
                    <Paragraph strong style={{ marginBottom: 8 }}>
                      {t('home:walletconnect.typed_data_approval_warning')}
                    </Paragraph>
                  )}
                  {risk === 'order' && (
                    <Paragraph strong style={{ marginBottom: 8 }}>
                      {t('home:walletconnect.typed_data_order_warning')}
                    </Paragraph>
                  )}
                  <Text>{t('home:walletconnect.typed_data_warning_desc')}</Text>
                </>
              }
            />
          ) : (
            <Alert
              type="error"
              showIcon
              message={t('home:walletconnect.typed_data_invalid')}
            />
          )}

          <div className="dapp-summary">
            <div className="dapp-summary-row">
              <span className="dapp-summary-label">
                {t('home:walletconnect.address')}
              </span>
              <Text className="dapp-summary-value dapp-mono" copyable>
                {address}
              </Text>
            </div>
            {domainName && (
              <div className="dapp-summary-row">
                <span className="dapp-summary-label">
                  {t('home:walletconnect.typed_data_domain')}
                </span>
                <span className="dapp-summary-value">{domainName}</span>
              </div>
            )}
            {verifyingContract && (
              <div className="dapp-summary-row">
                <span className="dapp-summary-label">
                  {t('home:walletconnect.typed_data_contract')}
                </span>
                <Text className="dapp-summary-value dapp-mono" copyable>
                  {verifyingContract}
                </Text>
              </div>
            )}
            {payload && (
              <div className="dapp-summary-row">
                <span className="dapp-summary-label">
                  {t('home:walletconnect.typed_data_type')}
                </span>
                <span className="dapp-summary-value dapp-mono">
                  {payload.primaryType}
                </span>
              </div>
            )}
            <div className="dapp-summary-row">
              <span className="dapp-summary-label">{t('common:network')}</span>
              <span className="dapp-summary-value">
                {chainSwitchInfo?.required && chainSwitchInfo.targetChain
                  ? chainSwitchInfo.targetChain.chainName
                  : blockchains[activeChain].name}
              </span>
            </div>
          </div>

          {/* Chain Switch Warning */}
          {chainSwitchInfo?.required && chainSwitchInfo.targetChain && (
            <Alert
              message={t('home:walletconnect.chain_switch_required')}
              description={
                <div>
                  <Text>
                    {t('home:walletconnect.signing_chain_switch_desc', {
                      chainName: chainSwitchInfo.targetChain.chainName,
                    })}
                  </Text>
                  <br />
                  <Text type="secondary">
                    {t('home:walletconnect.address_different_chain')}
                  </Text>
                </div>
              }
              type="warning"
              showIcon
            />
          )}

          {/* EIP-712 payload — mono, scrolls internally, theme-aware */}
          <div>
            <div
              className="dapp-summary-label"
              style={{ fontSize: 12, marginBottom: 4 }}
            >
              {t('home:walletconnect.data')} —{' '}
              {t('home:walletconnect.structured_eip712_data')}
            </div>
            <Text
              className="dapp-payload"
              style={{ display: 'block' }}
              copyable={{
                text: JSON.stringify(payload?.message ?? typedData, null, 2),
              }}
            >
              {JSON.stringify(payload?.message ?? typedData, null, 2)}
            </Text>
          </div>

          {payload && (
            <Checkbox
              checked={riskAcknowledged}
              onChange={(e) => setRiskAcknowledged(e.target.checked)}
            >
              {t('home:walletconnect.typed_data_acknowledge')}
            </Checkbox>
          )}

          {/* Method footnote */}
          <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5 }}>
            <span style={{ fontFamily: 'var(--ssp-mono)' }}>{method}</span>
            {' — '}
            {t('home:walletconnect.eip712_structured_data_signature')}
            <br />
            {t('home:walletconnect.step_1_approve_wallet')}
          </Text>
        </div>
      </Modal>
    );
  }

  // Second step: QR code dialog
  return (
    <Modal
      title={t('home:walletconnect.scan_with_ssp_key')}
      open={true}
      onCancel={handleReject}
      footer={null}
      style={{ textAlign: 'center' }}
    >
      <div style={{ textAlign: 'left' }}>
        <div style={{ textAlign: 'center' }}>
          {qrString && qrString.length < 1250 && (
            <Paragraph>{t('home:confirmTxKey.info_1')}</Paragraph>
          )}
          {qrString && qrString.length >= 1250 && (
            <Paragraph>{t('home:confirmTxKey.info_2')}</Paragraph>
          )}

          <Space
            direction="vertical"
            size="large"
            style={{ width: '100%', marginBottom: 20 }}
          >
            {qrString && qrString.length < 1250 && (
              <QRCode
                errorLevel="M"
                value={qrString}
                icon={sspLogo}
                size={280}
                style={{ margin: '0 auto' }}
              />
            )}

            {qrString && (
              <Paragraph
                copyable={{ text: qrString }}
                className="copyableAddress"
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--ssp-mono)',
                  wordBreak: 'break-all',
                  marginBottom: 0,
                  textAlign: 'left',
                }}
              >
                <Text>{qrString}</Text>
              </Paragraph>
            )}

            {!qrString && (
              <Text type="secondary">
                {t('home:walletconnect.waiting_signing_request_data')}
              </Text>
            )}
          </Space>

          <Text type="secondary" italic>
            {t('home:walletconnect.ssp_key_confirmation_needed')}
          </Text>
        </div>
      </div>
    </Modal>
  );
};

export default TypedDataSignModal;
