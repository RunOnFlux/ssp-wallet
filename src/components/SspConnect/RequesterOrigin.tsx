import { createPortal } from 'react-dom';
import { Typography } from 'antd';
import { Globe as GlobeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WkSignRequesterInfo } from '../../lib/wkSign';
import './RequesterOrigin.css';

const { Text } = Typography;

/**
 * Who is asking — the browser-verified origin of the requesting frame
 * (security review H-9 / WEXT-6).
 *
 * `requesterInfo.origin` is stamped by background.js from the runtime `sender`
 * and is the only trustworthy identity a dApp request carries; page-supplied
 * names and icons are deliberately not shown here.
 *
 * - `inline` renders inside a dialog (SignMessage).
 * - `banner` pins the origin to the top of the window, above every antd modal
 *   (z-index over the 1000 modal layer), for the dialogs SspConnect renders
 *   but does not own (payment, chains, tokens and address requests).
 */
function RequesterOrigin(props: {
  requesterInfo: WkSignRequesterInfo | null | undefined;
  variant: 'inline' | 'banner';
  open?: boolean;
}) {
  const { t } = useTranslation(['home']);
  const { requesterInfo, variant, open = true } = props;
  if (!open || !requesterInfo || requesterInfo.internal) return null;

  const content = (
    <div
      className={`ssp-requester-origin ssp-requester-origin-${variant}`}
      role="note"
      data-testid={`requester-origin-${variant}`}
    >
      <GlobeIcon size={16} aria-hidden="true" />
      <div className="ssp-requester-origin-text">
        <Text type="secondary" style={{ fontSize: 11 }}>
          {t('home:sspConnect.requested_by')}
        </Text>
        <Text strong className="ssp-requester-origin-value">
          {requesterInfo.origin}
        </Text>
        {requesterInfo.isSubframe && requesterInfo.topOrigin && (
          <Text type="warning" style={{ fontSize: 11 }}>
            {t('home:sspConnect.embedded_frame', {
              top: requesterInfo.topOrigin,
            })}
          </Text>
        )}
      </div>
    </div>
  );

  if (variant === 'banner' && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
}

export default RequesterOrigin;
