import { useEffect, useState } from 'react';
import BigNumber from 'bignumber.js';
import { Button } from 'antd';
import { TriangleAlert as TriangleAlertIcon, X as XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { loadPortfolio } from '../../lib/portfolio';
import { formatFiatWithSymbol } from '../../lib/currency';
import { sspConfig } from '@storage/ssp';
import { isBackupCheckupDue } from '../../lib/backupCheckup';
import {
  useBackupCheckupState,
  snoozeBackupCheckup,
} from '../../storage/walletMeta';
import VerifyBackupModal from '../VerifyBackup/VerifyBackupModal';
import './BackupHealthCard.css';

/**
 * Periodic backup checkup — a routine reminder, not an accusation. Hidden by
 * default; appears only when the wallet has no recorded verification at all
 * (upgraded wallets show it immediately) or when 30 days have elapsed since
 * the last successful one (cycle logic in lib/backupCheckup). Passing the
 * word-match verify resets the cycle and hides it; "Later" snoozes it for one
 * full cycle. The optional value line is honest about its scope: it names the
 * cached cross-wallet portfolio total AS a cross-wallet total.
 *
 * Nothing here touches crypto — the verify modal reuses the existing decrypt
 * path and all bookkeeping lives in append-only walletMeta keys.
 */
function BackupHealthCard() {
  const { t } = useTranslation(['home', 'cr', 'common']);
  const checkupState = useBackupCheckupState();
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const [totalFiat, setTotalFiat] = useState<number | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const due = isBackupCheckupDue(checkupState, Date.now());

  // Cheap: cached portfolio total across all synced chains (no network).
  useEffect(() => {
    if (!due) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadPortfolio(
          cryptoRates,
          fiatRates,
          sspConfig().fiatCurrency,
          false,
        );
        if (!cancelled) setTotalFiat(result.totalFiat);
      } catch (error) {
        console.log('[backupCheckup] portfolio read failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [due, cryptoRates, fiatRates]);

  if (!due) return null;

  const fiatLabel =
    totalFiat && totalFiat > 0
      ? formatFiatWithSymbol(new BigNumber(totalFiat))
      : null;

  return (
    <>
      <div className="backup-health-card" role="status">
        <span className="backup-health-icon" aria-hidden="true">
          <TriangleAlertIcon />
        </span>
        <div className="backup-health-text">
          <div className="backup-health-title">
            {t('home:backupCheckup.title', 'Backup checkup')}
          </div>
          <div className="backup-health-body">
            {t(
              'home:backupCheckup.body',
              "It's been a while — take 30 seconds to confirm your seed words still match your backup.",
            )}
            {fiatLabel && (
              <>
                {' '}
                {t('home:backupCheckup.protecting', {
                  amount: fiatLabel,
                  defaultValue:
                    'Your backup protects {{amount}} across your wallets.',
                })}
              </>
            )}
          </div>
        </div>
        <Button
          type="primary"
          size="small"
          className="backup-health-action"
          onClick={() => setVerifyOpen(true)}
        >
          {t('home:backupHealth.verify')}
        </Button>
        <button
          type="button"
          className="backup-health-dismiss"
          aria-label={t('home:backupCheckup.later', 'Later')}
          title={t('home:backupCheckup.later', 'Later')}
          onClick={() => snoozeBackupCheckup(Date.now())}
        >
          <XIcon />
        </button>
      </div>
      <VerifyBackupModal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
      />
    </>
  );
}

export default BackupHealthCard;
