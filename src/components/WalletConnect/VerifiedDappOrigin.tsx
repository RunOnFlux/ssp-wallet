import { Alert, Checkbox, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import DappOrigin from '../DappRequest/DappOrigin';
import '../DappRequest/DappRequest.css';
import { displayOrigin, type VerifyAssessment } from './verifyContext';

const { Text } = Typography;

/**
 * Requester header for WalletConnect modals (security review WEXT-5).
 *
 * Shows the origin the Verify API saw — not the peer's self-declared URL — as
 * the requester, with the declared name and icon kept as presentation only,
 * and the Verify status:
 *  - scam: blocking error (the modal must disable approval);
 *  - invalid: domain-mismatch error plus an explicit "I understand" checkbox
 *    the modal requires before approval;
 *  - unknown: "not verified" note;
 *  - valid: "verified domain" note.
 */
function VerifiedDappOrigin(props: {
  assessment: VerifyAssessment;
  name?: string;
  icon?: string;
  acknowledged: boolean;
  onAcknowledge: (acknowledged: boolean) => void;
}) {
  const { t } = useTranslation(['home']);
  const { assessment, name, icon, acknowledged, onAcknowledge } = props;
  const origin = displayOrigin(assessment);

  return (
    <>
      <DappOrigin name={name} url={origin} icon={icon} />
      {assessment.status === 'valid' && (
        <Text type="success" style={{ fontSize: 12 }}>
          {t('home:walletconnect.verify_valid', { origin })}
        </Text>
      )}
      {assessment.status === 'unknown' && (
        <Text type="warning" style={{ fontSize: 12 }}>
          {t('home:walletconnect.verify_unknown')}
        </Text>
      )}
      {assessment.status === 'invalid' && (
        <Alert
          type="error"
          showIcon
          message={t('home:walletconnect.verify_invalid_title')}
          data-testid="wc-verify-invalid"
          description={
            <>
              <div>
                {t('home:walletconnect.verify_invalid_desc', {
                  origin: assessment.verifiedOrigin || '—',
                  claimed: assessment.claimedUrl || '—',
                })}
              </div>
              <Checkbox
                checked={acknowledged}
                onChange={(e) => onAcknowledge(e.target.checked)}
                style={{ marginTop: 8 }}
              >
                {t('home:walletconnect.verify_invalid_confirm')}
              </Checkbox>
            </>
          }
        />
      )}
      {assessment.status === 'scam' && (
        <Alert
          type="error"
          showIcon
          message={t('home:walletconnect.verify_scam_title')}
          description={t('home:walletconnect.verify_scam_desc', {
            origin: origin || '—',
          })}
          data-testid="wc-verify-scam"
        />
      )}
    </>
  );
}

export default VerifiedDappOrigin;
