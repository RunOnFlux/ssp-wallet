import { useEffect, useMemo, useState } from 'react';
import { Modal, Button } from 'antd';
import { ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import secureLocalStorage from 'react-secure-storage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { toast } from '../../lib/toast';
import {
  setBackupVerified,
  markBackupVerifyNow,
} from '../../storage/walletMeta';
import './VerifyBackup.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Word-match backup verification, shared by the Home "Backup checkup" card and
 * the Menu → Security "Verify seed backup" row. Decrypts the seed silently
 * (same passwordBlob → password → seed path SspWalletDetails uses), then asks
 * the user to identify one seed word among decoys without showing the phrase —
 * proving they hold the backup. On success it flips the append-only
 * `walletBackupVerified` flag, records `lastVerifyAt` (resetting the 30-day
 * checkup cycle) and shows the success toast. Read-only beyond that: no
 * seed/config/wallet state is written.
 */
function VerifyBackupModal({ open, onClose }: Props) {
  const { t } = useTranslation(['home', 'cr', 'common']);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
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
        console.log('[verifyBackup] decrypt failed', err);
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
      setBackupVerified(true);
      markBackupVerifyNow(Date.now());
      onClose();
      void toast.open({
        type: 'success',
        content: t('home:backupHealth.verified_toast'),
      });
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
      style={{ textAlign: 'center' }}
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

export default VerifyBackupModal;
