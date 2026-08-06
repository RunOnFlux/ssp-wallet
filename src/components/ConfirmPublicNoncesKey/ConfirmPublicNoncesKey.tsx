import { useState, useEffect, useRef } from 'react';
import { toast } from '../../lib/toast';
import { useSspLogo } from '../../hooks/useSspLogo';
import { QRCode, Typography, Button, Space, Modal, Input, Steps } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { TextArea } = Input;
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';
import HandshakeAnimation from '../HandshakeAnimation/HandshakeAnimation';
import { useSocket } from '../../hooks/useSocket';
import {
  deriveHandshakePhase,
  handshakeTimeline,
  type HandshakePhase,
} from '../../lib/handshake';
const { Paragraph, Text } = Typography;

interface publicNonces {
  kPublic: string;
  kTwoPublic: string;
}

/**
 * "Approve on your SSP Key" — handshake experience while the Key shares
 * public nonces (EVM tx construction). Presentation-only rebuild: the QR
 * payload ("publicnonces"), manual-input processing and the open/close
 * contract with Settings / SendEVM / WalletConnect are untouched. Terminal
 * states are latched read-only from the existing socket signals.
 */
function ConfirmPublicNoncesKey(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const sspLogo = useSspLogo();
  const { open, openAction } = props;
  const { publicNonces, publicNoncesRejected } = useSocket();
  const [keyInput, setKeyInput] = useState('');
  const [phase, setPhase] = useState<HandshakePhase>('waiting');
  const [showFallback, setShowFallback] = useState(false);
  const baselines = useRef({ approved: '', rejected: '' });

  useEffect(() => {
    setPhase('waiting');
    setShowFallback(false);
    if (open) {
      baselines.current = {
        approved: publicNonces,
        rejected: publicNoncesRejected,
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPhase((current) =>
      deriveHandshakePhase(current, {
        approvedSignal: publicNonces,
        rejectedSignal: publicNoncesRejected,
        baselineApproved: baselines.current.approved,
        baselineRejected: baselines.current.rejected,
      }),
    );
  }, [open, publicNonces, publicNoncesRejected]);

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({
      type,
      content,
    });
  };

  const handleOk = () => {
    if (keyInput.length > 0) {
      if (!keyInput.startsWith('[') || !keyInput.endsWith(']')) {
        displayMessage(
          'error',
          t('home:confirmPublicNoncesKey.invalid_public_nonces'),
        );
        return;
      }
      // process keyInput
      try {
        const sspKeyPublicNonces = JSON.parse(keyInput) as publicNonces[];
        void (async function () {
          try {
            await localForage.setItem('sspKeyPublicNonces', sspKeyPublicNonces);
            // display message
            displayMessage(
              'success',
              t('home:confirmPublicNoncesKey.public_nonces_stored'),
            );
            setKeyInput('');
            openAction(false);
          } catch (error) {
            displayMessage(
              'error',
              t('home:confirmPublicNoncesKey.invalid_public_nonces'),
            );
            console.log(error);
          }
        })();
      } catch (error) {
        console.log(error);
        displayMessage(
          'error',
          t('home:confirmPublicNoncesKey.invalid_public_nonces'),
        );
      }
    } else {
      setKeyInput('');
      openAction(false);
    }
  };

  const handleCancel = () => {
    setKeyInput('');
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

  return (
    <>
      <Modal
        title={t('home:keyHandshake.title')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
        zIndex={1100}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ width: '100%', marginBottom: 15 }}
        >
          <HandshakeAnimation
            state={phase}
            ariaLabel={stepTitles[phase === 'waiting' ? 'awaiting' : 'result']}
          />
          <Text>
            {t('home:confirmPublicNoncesKey.confirm_public_nonces_key_info')}
          </Text>
          <Steps
            direction="vertical"
            size="small"
            className="keyHandshakeTimeline"
            items={timelineItems}
          />
          {/* QR + manual input demoted to fallback — payload untouched */}
          <Button type="link" onClick={() => setShowFallback(!showFallback)}>
            {showFallback
              ? t('home:keyHandshake.hide_qr')
              : t('home:keyHandshake.show_qr')}
          </Button>
          {showFallback && (
            <>
              <Text>
                {t(
                  'home:confirmPublicNoncesKey.confirm_public_nonces_key_info_2',
                )}
              </Text>
              <div>
                <QRCode
                  errorLevel="M"
                  value="publicnonces"
                  icon={sspLogo}
                  size={240}
                  style={{ margin: '0 auto 15px auto' }}
                />
                <Paragraph
                  copyable={{ text: 'publicnonces' }}
                  className="copyableAddress"
                >
                  <Text>publicnonces</Text>
                </Paragraph>
              </div>
              <TextArea
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={t('home:confirmPublicNoncesKey.manual_input')}
                autoSize
              />
            </>
          )}
          <Button type="primary" size="middle" onClick={handleOk}>
            {t('common:ok')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default ConfirmPublicNoncesKey;
