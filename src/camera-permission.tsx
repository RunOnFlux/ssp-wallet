/**
 * Camera permission grant page (separate extension page, own Vite entry).
 *
 * Chrome cannot anchor the getUserMedia permission prompt to the extension
 * popup, so QRScanner opens this page in a full tab to obtain the one-time
 * grant for the extension origin. Kept intentionally light: React + i18n
 * only — no antd, no router, no store.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import './translations';

type Status =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'granted' }
  | { kind: 'blocked' }
  | { kind: 'nocamera' }
  | { kind: 'error' };

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

const styles: Record<string, React.CSSProperties> = {
  card: {
    maxWidth: 420,
    padding: 32,
    border: '1px solid var(--border)',
    borderRadius: 16,
    textAlign: 'center',
  },
  logo: { height: 48, marginBottom: 16 },
  title: { fontSize: 20, margin: '0 0 8px' },
  text: {
    color: 'var(--text-secondary)',
    fontSize: 14,
    lineHeight: 1.5,
    margin: '0 0 20px',
  },
  button: {
    background: 'var(--primary)',
    color: '#000',
    border: 'none',
    borderRadius: 8,
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  status: { marginTop: 16, fontSize: 14 },
};

function CameraPermissionPage() {
  const { t } = useTranslation(['send']);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const requestCamera = async () => {
    setStatus({ kind: 'requesting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      stream.getTracks().forEach((track) => track.stop());
      setStatus({ kind: 'granted' });
      setTimeout(() => {
        window.close();
      }, 2500);
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      ) {
        setStatus({ kind: 'blocked' });
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setStatus({ kind: 'nocamera' });
      } else {
        setStatus({ kind: 'error' });
      }
    }
  };

  // Attempt immediately — opening this page is itself a deliberate action.
  // Empty deps: run exactly once on mount.
  useEffect(() => {
    void requestCamera();
  }, []);

  const statusText: Partial<Record<Status['kind'], string>> = {
    requesting: t('send:camera_page_requesting'),
    granted: t('send:camera_page_granted'),
    blocked: t('send:camera_page_blocked'),
    nocamera: t('send:camera_page_no_camera'),
    error: t('send:qr_camera_error'),
  };
  const statusColor =
    status.kind === 'granted'
      ? '#22c55e'
      : status.kind === 'blocked' ||
          status.kind === 'nocamera' ||
          status.kind === 'error'
        ? '#ef4444'
        : 'var(--text-secondary)';

  return (
    <div style={styles.card}>
      <img
        style={styles.logo}
        src={isDark ? '/ssp-logo-white.svg' : '/ssp-logo-black.svg'}
        alt="SSP"
      />
      <h1 style={styles.title}>{t('send:camera_page_title')}</h1>
      <p style={styles.text}>{t('send:camera_page_desc')}</p>
      {status.kind !== 'granted' && (
        <button
          style={styles.button}
          type="button"
          disabled={status.kind === 'requesting'}
          onClick={() => {
            void requestCamera();
          }}
        >
          {t('send:camera_page_allow')}
        </button>
      )}
      <div style={{ ...styles.status, color: statusColor }} role="status">
        {statusText[status.kind] ?? ''}
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<CameraPermissionPage />);
}
