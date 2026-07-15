import { useState, useEffect, useRef } from 'react';
import { useSspLogo } from '../../hooks/useSspLogo';
import { QRCode, Typography, Button, Space, Modal, Steps, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import HandshakeAnimation from '../HandshakeAnimation/HandshakeAnimation';
import { useSocket } from '../../hooks/useSocket';
import {
  deriveHandshakePhase,
  handshakeTimeline,
  formatCountdown,
  ACTION_EXPIRY_SECONDS,
  type HandshakePhase,
} from '../../lib/handshake';
const { Paragraph, Text } = Typography;

const SOFT_TIMEOUT_SECONDS = 30;

/**
 * "Approve on your SSP Key" — the handshake experience while the mobile
 * Key co-signs a transaction. Presentation-only rebuild: the QR payload,
 * the open/close contract with the Send pages / Home, and the socket
 * success/rejection handoff (handled by the parents) are untouched.
 *
 * The terminal Approved/Rejected states are latched from the same socket
 * signals the parents already consume (txid / txrejected) — read-only,
 * nothing is cleared here.
 */
function ConfirmTxKey(props: {
  open: boolean;
  txHex: string;
  chain: string;
  wallet: string;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const sspLogo = useSspLogo();
  const { open, openAction, txHex, chain, wallet } = props;
  const { txid: socketTxid, txRejected } = useSocket();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [phase, setPhase] = useState<HandshakePhase>('waiting');
  const [showFallback, setShowFallback] = useState(false);
  // socket signal values present when the modal opened — a stale signal
  // from a previous flow must never resolve a fresh request
  const baselines = useRef({ approved: '', rejected: '' });

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset per open. The countdown mirrors the relay action validity
  // (15 min) — informational only, expiry is enforced by the relay.
  useEffect(() => {
    setElapsedSeconds(0);
    setPhase('waiting');
    setShowFallback(false);
    if (!open) {
      return;
    }
    baselines.current = { approved: socketTxid, rejected: txRejected };
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  // Latch terminal phase from the existing socket events. The parent still
  // owns the close + TxSent/TxRejected handoff; this only drives the visual.
  useEffect(() => {
    if (!open) {
      return;
    }
    setPhase((current) =>
      deriveHandshakePhase(current, {
        approvedSignal: socketTxid,
        rejectedSignal: txRejected,
        baselineApproved: baselines.current.approved,
        baselineRejected: baselines.current.rejected,
      }),
    );
  }, [open, socketTxid, txRejected]);

  const qrSize = windowWidth < 420 ? 240 : 280;
  const qrPayload = `${chain}:${wallet}:${txHex}`;

  const handleOk = () => {
    openAction(false);
  };

  const stepTitles: Record<string, string> = {
    sent: t('home:keyHandshake.step_sent'),
    awaiting: t('home:keyHandshake.step_awaiting'),
    result:
      phase === 'rejected'
        ? t('home:keyHandshake.step_rejected')
        : t('home:keyHandshake.step_approved'),
  };

  const timelineItems = handshakeTimeline(phase).map((step) => ({
    title: stepTitles[step.key],
    status: step.status,
  }));

  const remainingSeconds = ACTION_EXPIRY_SECONDS - elapsedSeconds;

  return (
    <>
      <Modal
        title={t('home:keyHandshake.title')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            {t('common:ok')}
          </Button>,
        ]}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <HandshakeAnimation
            state={phase}
            ariaLabel={stepTitles[phase === 'waiting' ? 'awaiting' : 'result']}
          />
          <Steps
            direction="vertical"
            size="small"
            className="keyHandshakeTimeline"
            items={timelineItems}
          />
          {phase === 'waiting' && remainingSeconds > 0 && (
            <Text
              type="secondary"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t('home:keyHandshake.expires_in')}{' '}
              <Text
                strong
                style={{
                  color: remainingSeconds <= 60 ? '#ef4444' : '#f59e0b',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCountdown(remainingSeconds)}
              </Text>
            </Text>
          )}
          {phase === 'waiting' && remainingSeconds <= 0 && (
            <Alert
              type="error"
              showIcon
              message={t('home:keyHandshake.expired')}
            />
          )}
          {phase === 'waiting' &&
            elapsedSeconds >= SOFT_TIMEOUT_SECONDS &&
            !showFallback && (
              <Alert
                type="warning"
                showIcon
                message={t('home:confirmTxKey.soft_timeout_title')}
                description={t('home:confirmTxKey.soft_timeout_description')}
                style={{ textAlign: 'left' }}
              />
            )}
          {/* QR fallback — payload generation untouched, presentation only */}
          <Button type="link" onClick={() => setShowFallback(!showFallback)}>
            {showFallback
              ? t('home:keyHandshake.hide_qr')
              : t('home:keyHandshake.show_qr')}
          </Button>
        </Space>
        {showFallback && txHex.length < 1250 && (
          <>
            <p style={{ marginTop: 8 }}>{t('home:confirmTxKey.info_1')}</p>
            <Space
              direction="vertical"
              size="large"
              style={{ marginBottom: 15 }}
            >
              <QRCode
                errorLevel="M"
                value={qrPayload}
                icon={sspLogo}
                size={qrSize}
                style={{ margin: '0 auto' }}
              />
              <Paragraph
                copyable={{ text: qrPayload }}
                className="copyableAddress"
              >
                <Text>{qrPayload}</Text>
              </Paragraph>
            </Space>
          </>
        )}
        {showFallback && txHex.length >= 1250 && (
          <>
            <p style={{ marginTop: 8 }}>{t('home:confirmTxKey.info_2')}</p>
            <Space
              direction="vertical"
              size="large"
              style={{ marginBottom: 15 }}
            >
              <Paragraph
                copyable={{ text: qrPayload }}
                className="copyableAddress"
              >
                <Text>{qrPayload}</Text>
              </Paragraph>
            </Space>
          </>
        )}
      </Modal>
    </>
  );
}

export default ConfirmTxKey;
