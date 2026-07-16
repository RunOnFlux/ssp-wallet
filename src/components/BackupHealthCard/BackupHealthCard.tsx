import { useEffect, useMemo, useState } from 'react';
import BigNumber from 'bignumber.js';
import { Modal, Button } from 'antd';
import {
  ShieldCheck as ShieldCheckIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import secureLocalStorage from 'react-secure-storage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { loadPortfolio } from '../../lib/portfolio';
import { formatFiatWithSymbol } from '../../lib/currency';
import { sspConfig } from '@storage/ssp';
import { toast } from '../../lib/toast';
import { useBackupVerified, setBackupVerified } from '../../storage/walletMeta';
import './BackupHealthCard.css';

/**
 * Backup-health card (loss aversion). Until the seed is BOTH word-verified and
 * the SSP Key is paired, this names the REAL balance and nudges the user to
 * secure it — a concrete "you could lose $X", never a generic banner. It hides
 * itself the moment both conditions hold.
 *
 * Nothing here touches crypto beyond the existing decrypt path (passwordBlob →
 * password → seed, exactly as SspWalletDetails does) and read-only wordlist
 * decoys. The "verified" flag lives in the append-only `walletBackupVerified`
 * key; no seed/config/wallet state is written.
 */
function BackupHealthCard() {
  const { t } = useTranslation(['home', 'cr', 'common']);
  const backupVerified = useBackupVerified();
  const { identityChain } = useAppSelector((state) => state.sspState);
  const { xpubKey } = useAppSelector((state) => state[identityChain]);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );
  const keyPaired = !!xpubKey;

  const [totalFiat, setTotalFiat] = useState<number | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Cheap: cached portfolio total across all synced chains (no network).
  useEffect(() => {
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
        console.log('[backupHealth] portfolio read failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cryptoRates, fiatRates]);

  // Both satisfied → nothing to nag about.
  if (backupVerified && keyPaired) return null;

  const fiatLabel =
    totalFiat && totalFiat > 0
      ? formatFiatWithSymbol(new BigNumber(totalFiat))
      : null;

  const headline = fiatLabel
    ? t('home:backupHealth.title_amount', { amount: fiatLabel })
    : t('home:backupHealth.title_generic');

  const body = !keyPaired
    ? t('home:backupHealth.body_one_device')
    : t('home:backupHealth.body_unverified');

  return (
    <>
      <div className="backup-health-card" role="status">
        <span className="backup-health-icon" aria-hidden="true">
          <TriangleAlertIcon />
        </span>
        <div className="backup-health-text">
          <div className="backup-health-title">{headline}</div>
          <div className="backup-health-body">{body}</div>
        </div>
        <Button
          type="primary"
          size="small"
          className="backup-health-action"
          onClick={() => setVerifyOpen(true)}
        >
          {t('home:backupHealth.verify')}
        </Button>
      </div>
      <VerifyBackupModal
        open={verifyOpen}
        passwordBlob={passwordBlob}
        onClose={() => setVerifyOpen(false)}
        onVerified={() => {
          setBackupVerified(true);
          setVerifyOpen(false);
          void toast.open({
            type: 'success',
            content: t('home:backupHealth.verified_toast'),
          });
        }}
      />
    </>
  );
}

interface VerifyProps {
  open: boolean;
  passwordBlob: string;
  onClose: () => void;
  onVerified: () => void;
}

/**
 * Word-match backup verification. Decrypts the seed silently (same path the
 * app already uses), then asks the user to identify one seed word among decoys
 * without showing the phrase — proving they hold the backup. On success the
 * caller flips the append-only verified flag.
 */
function VerifyBackupModal({
  open,
  passwordBlob,
  onClose,
  onVerified,
}: VerifyProps) {
  const { t } = useTranslation(['home', 'cr', 'common']);
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const [targetIndex, setTargetIndex] = useState(0);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!open) {
      setWords(null);
      setError(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const fingerprint = getFingerprint();
        const password = await passworderDecrypt(fingerprint, passwordBlob);
        if (typeof password !== 'string') throw new Error('bad password');
        const seedBlob = secureLocalStorage.getItem('walletSeed');
        if (typeof seedBlob !== 'string') throw new Error('no seed');
        let seed = await passworderDecrypt(password, seedBlob);
        if (typeof seed !== 'string') throw new Error('bad seed');
        const seedWords = seed.split(' ');
        seed = '';
        if (cancelled) return;
        setError(false);
        setTargetIndex(Math.floor(Math.random() * seedWords.length));
        setWords(seedWords);
      } catch (err) {
        console.log('[backupHealth] verify decrypt failed', err);
        setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, passwordBlob]);

  // Build the multiple-choice options: the real word + unique decoys.
  const options = useMemo(() => {
    if (!words) return [];
    const correct = words[targetIndex];
    const opts = new Set<string>([correct]);
    while (opts.size < 6) {
      const candidate = wordlist[Math.floor(Math.random() * wordlist.length)];
      if (!words.includes(candidate)) opts.add(candidate);
    }
    return [...opts].sort(() => Math.random() - 0.5);
  }, [words, targetIndex, round]);

  const pick = (word: string) => {
    if (!words) return;
    if (word === words[targetIndex]) {
      onVerified();
    } else {
      // reshuffle a fresh challenge (no re-decrypt needed)
      setError(true);
      setTargetIndex(Math.floor(Math.random() * words.length));
      setRound((r) => r + 1);
    }
  };

  return (
    <Modal
      title={t('home:backupHealth.verify_title', 'Verify your backup')}
      open={open}
      onCancel={onClose}
      footer={null}
      style={{ textAlign: 'center', top: 60 }}
    >
      <div className="backup-verify-body">
        <ShieldCheckIcon className="backup-verify-shield" />
        <p className="backup-verify-lead">
          {t(
            'home:backupHealth.verify_lead',
            'Confirm you still have your seed phrase backup. No one can recover it for you.',
          )}
        </p>
        {error && !words && (
          <p className="backup-verify-error">
            {t('home:backupHealth.verify_decrypt_error')}
          </p>
        )}
        {words && (
          <>
            <h3 className="backup-verify-question">
              {t('cr:confirm_wallet_seed_word')}{' '}
              {t('cr:word_number', { number: targetIndex + 1 })}
            </h3>
            {error && (
              <p className="backup-verify-error">
                {t('cr:incorrect_backup_confirmation')}
              </p>
            )}
            <div className="backup-verify-options">
              {options.map((word) => (
                <Button
                  key={word}
                  size="large"
                  onClick={() => pick(word)}
                  style={{ margin: 5 }}
                >
                  {word}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default BackupHealthCard;
